/**
 * 플러그인 수명주기 — 활성 · 비활성 · 다시 켜기. 정적 번들(모듈 배열).
 *
 * 🔴 activateAll 은 React 가 뜨기 전 main.tsx 에서 **한 번** 부른다(effect 안에서 안 부른다 — StrictMode 가 두 번 돈다).
 * 🔴 activate 가 던져도 **그 플러그인만** 실패하고 나머지는 계속 산다 — 하나가 앱을 못 뜨게 하면 안 된다.
 *
 * ⭐ 비활성 = 그 주인의 Disposable 전부 회수(뷰·리본·설정·상태바·메뉴·명령·구독). 열려 있던 leaf 는 트리에 남아
 *    자리표시가 된다(EditorArea 가 ownerOfView 로 주인을 알아내 「켜기」를 단다). 다시 켜면 그 자리에서 실뷰로.
 * 🔴 ⛔ 코어는 끌 수 없다 — disablePlugin 이 거부하고 설정 토글도 잠긴다. 「설정을 꺼서 설정을 못 켜는」 일이 없다.
 */
import { useSyncExternalStore } from 'react';
import { storageKey } from '../storage';
import type { PluginModule, Disposable, PerCallerApi } from './types';
import { HOST_VERSION } from './types';
import { makeHost } from './host';
import { applyContributes } from './contributes';
import { disposeOwner } from './store';

// ── 설치된 모듈 + 상태 ──
let installed: PluginModule[] = [];
const failedIds = new Set<string>();      // activate 가 던졌거나 minHostVersion 미달
let disabledIds = new Set<string>();      // 사용자가 끈 것(기기별 저장)

// ── 기기별 저장: { disabled: string[] } ──
const pluginsKey = () => storageKey('plugins');
function loadDisabled(): Set<string> {
    try {
        if (typeof localStorage === 'undefined') return new Set();
        const s = localStorage.getItem(pluginsKey());
        if (!s) return new Set();
        const raw = JSON.parse(s) as { disabled?: unknown };
        const arr = Array.isArray(raw?.disabled) ? raw.disabled.filter((x): x is string => typeof x === 'string') : [];
        return new Set(arr);
    } catch { return new Set(); }
}
function saveDisabled(): void {
    try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(pluginsKey(), JSON.stringify({ disabled: [...disabledIds] }));
    } catch { /* 조용히 */ }
}

// ── 버전 비교: minHostVersion <= HOST_VERSION 인가(a.b.c 숫자 비교) ──
function parseVer(v: string): number[] { return v.split('.').map((n) => parseInt(n, 10) || 0); }
function versionOk(min: string): boolean {
    const a = parseVer(min); const b = parseVer(HOST_VERSION);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const x = a[i] ?? 0; const y = b[i] ?? 0;
        if (x < y) return true;
        if (x > y) return false;
    }
    return true;   // 같음
}

// ── React 구독 — 설정 「플러그인」 판·EditorArea 자리표시가 enable/disable 에 다시 그린다 ──
const regListeners = new Set<() => void>();
let regVersion = 0;
function emitReg(): void { regVersion += 1; for (const l of regListeners) l(); }
function subscribeReg(l: () => void): () => void { regListeners.add(l); return () => { regListeners.delete(l); }; }
export function usePluginRegistry(): number {
    return useSyncExternalStore(subscribeReg, () => regVersion, () => regVersion);
}

/** 한 플러그인을 활성한다 — minHostVersion·예외를 격리한다(실패하면 failedIds 에, 나머지는 산다). */
function activateOne(m: PluginModule): void {
    failedIds.delete(m.manifest.id);
    if (!versionOk(m.manifest.minHostVersion)) {
        failedIds.add(m.manifest.id);
        console.warn(`[plugin] "${m.manifest.id}" 는 창틀 ${HOST_VERSION} 보다 높은 ${m.manifest.minHostVersion} 를 요구한다 — 활성 안 함`);
        return;
    }
    try {
        // 🔴 순서: contributes 꽂기 → activate → lifecycle.onActivate → onFirstRun.
        //    호스트 하나를 만들어 넷이 같이 쓴다(등록물은 전부 이 주인 꼬리표로 모여 끌 때 회수된다).
        //    applyContributes 가 이름 어긋남에 던지면 아래 catch 가 받아 「활성 실패」로 올린다(조용히 안 넘긴다).
        const host = makeHost(m.manifest.id, m);
        applyContributes(m.manifest.contributes, m, host);
        // activate 는 선택이다(선언형 전환) — 등록은 contributes 가 하고, activate 는 구독·동작만 남는다.
        if (m.activate) void m.activate(host);
        if (m.lifecycle?.onActivate) void m.lifecycle.onActivate(host);
        if (m.lifecycle?.onFirstRun) {
            const firstRun = m.lifecycle.onFirstRun;
            host.onFirstRun(() => firstRun(host));   // 첫 실행 게이트(다리·플래그)를 그대로 탄다
        }
    } catch (e) {
        failedIds.add(m.manifest.id);
        console.error(`[plugin] "${m.manifest.id}" 활성 실패 — 나머지는 계속`, e);
    }
}

export function activateAll(modules: PluginModule[]): void {
    installed = [...modules];
    disabledIds = loadDisabled();
    // 코어(core:true) 를 앞으로 — 안정 정렬이라 같은 급은 목록 순이 남는다
    const sorted = [...modules].sort((a, b) => Number(!!b.manifest.core) - Number(!!a.manifest.core));
    for (const m of sorted) {
        if (!m.manifest.core && disabledIds.has(m.manifest.id)) continue;   // 꺼 둔 것은 안 켠다
        activateOne(m);
    }
}

/** 다시 켜기 — 등록물을 깨끗이 비우고 activate 를 다시 돌린다(그 자리 leaf 가 실뷰로 돌아온다). */
export function enablePlugin(id: string): void {
    const m = installed.find((x) => x.manifest.id === id);
    if (!m) return;
    if (disabledIds.delete(id)) saveDisabled();
    disposeOwner(id);   // 혹시 남은 찌꺼기(개발 중 재활성 등)를 먼저 비운다
    activateOne(m);
    emitReg();
}

/** 끄기 — 그 주인의 Disposable 전부 회수. ⛔ 코어는 거부. */
export function disablePlugin(id: string): void {
    const m = installed.find((x) => x.manifest.id === id);
    if (!m) return;
    if (m.manifest.core) { console.warn(`[plugin] "${id}" 는 코어다 — 끌 수 없다`); return; }
    disabledIds.add(id);
    saveDisabled();
    disposeOwner(id);   // 뷰·리본·설정·상태바·메뉴·명령·구독 전부(각 Disposable 이 제 스토어를 emit 한다)
    emitReg();
}

export interface PluginStatus {
    id: string;
    name: string;
    version: string;
    core: boolean;
    enabled: boolean;
    failed: boolean;
    /** 매니페스트 설명 — 설정 「설치된 플러그인」 상세가 보여 준다(쥔님 13:42) */
    description?: string;
    minHostVersion: string;
}
export function listPlugins(): PluginStatus[] {
    return installed.map((m) => ({
        id: m.manifest.id,
        name: m.manifest.name,
        version: m.manifest.version,
        description: m.manifest.description,
        minHostVersion: m.manifest.minHostVersion,
        core: !!m.manifest.core,
        enabled: !disabledIds.has(m.manifest.id),
        failed: failedIds.has(m.manifest.id),
    }));
}

/**
 * 🔴 N4 — 활성(켜진) 플러그인의 공개 api(PluginModule.api). 꺼졌거나·실패거나·없으면 undefined.
 *   host.plugins.get 이 이 한 길로 온다. registry 가 모듈 목록(installed)을 쥐고 있어 여기서 찾는다.
 *   ⭐ api 가 「호출자별 팩토리」(__perCaller)면 caller·track 을 넘겨 불러 바인딩한 것을 돌려준다 —
 *      그래서 상대 플러그인이 setData 주인 검사·disposable 회수를 호출자 기준으로 할 수 있다.
 */
export function getPluginApi<T = unknown>(
    id: string,
    caller?: string,
    track?: (d: Disposable) => Disposable,
): T | undefined {
    const m = installed.find((x) => x.manifest.id === id);
    if (!m) return undefined;
    if (failedIds.has(id)) return undefined;                 // 활성 실패 — 없는 것과 같다
    if (!m.manifest.core && disabledIds.has(id)) return undefined;   // 꺼진 것(코어는 못 끈다)
    const api = m.api;
    if (typeof api === 'function' && (api as Partial<PerCallerApi>).__perCaller) {
        return (api as PerCallerApi<T>)(caller, track);
    }
    return api as T | undefined;
}

/** 이 viewId 의 주인 플러그인 — 자리표시가 「누가 꺼졌나」를 알아내는 창구(viewId 접두사로). */
export function ownerOfView(viewId: string): { id: string; name: string; enabled: boolean } | null {
    const pid = viewId.split('.')[0];
    const m = installed.find((x) => x.manifest.id === pid);
    if (!m) return null;
    return { id: pid, name: m.manifest.name, enabled: !disabledIds.has(pid) };
}
