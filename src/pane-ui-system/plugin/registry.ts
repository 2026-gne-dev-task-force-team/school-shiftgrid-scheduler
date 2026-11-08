/**
 * 플러그인 수명주기 — 활성 · 비활성 · 다시 켜기 + 🔴 모듈·의존성(M0: 위상 정렬·상태 넷·늦은 연결).
 *
 * 🔴 activateAll 은 React 가 뜨기 전 main.tsx 에서 **한 번** 부른다(effect 안에서 안 부른다 — StrictMode 가 두 번 돈다).
 * 🔴 onActivate 가 던져도 **그 플러그인만** 실패하고 나머지는 계속 산다 — 하나가 앱을 못 뜨게 하면 안 된다.
 *
 * ⭐ 상태 넷(명세 「페이블 설계 검증 반영」 1):
 *   on      — 켜져 돈다.
 *   off     — 사용자가 끈 것(영구, 기기별 저장). disabledIds.
 *   blocked — requires 가 안 찼다(없음·버전·순환·제공자 꺼짐). 🔴 비영구 — 제공자가 켜지면 자동 복귀. blockedReasons.
 *   failed  — onActivate/applyContributes 가 던졌거나 minHostVersion 미달. failedIds.
 *
 * ⭐ 켜는 순서 = requires 위상 정렬(supports 는 순서에 안 들어간다 — 그래서 순환을 못 만든다). 같은 층은 core 먼저·목록 순.
 * ⭐ 늦은 연결 — supports 한 인터페이스가 채워지는 순간 lifecycle.onInterface.attach 를 부른다(활성 순서·재시작과 무관).
 * 🔴 ⛔ 코어는 끌 수 없다 — disablePlugin 이 거부하고 설정 토글도 잠긴다.
 */
import { useSyncExternalStore } from 'react';
import { storageKey } from '../storage';
import type { PluginModule, PluginHost, Disposable, PerCallerApi, InterfaceContribution } from './types';
import { HOST_VERSION } from './types';
import { makeHost } from './host';
import { applyContributes } from './contributes';
import { disposeOwner, trackScope, disposeScope, disposeConsumerScopes } from './store';

// ── 설치된 모듈 + 상태 ──
let installed: PluginModule[] = [];
const failedIds = new Set<string>();            // onActivate 가 던졌거나 minHostVersion 미달
let disabledIds = new Set<string>();            // 사용자가 끈 것(기기별 저장)
const blockedReasons = new Map<string, string>();  // 🔴 비영구 — 제공자가 켜지면 reconcile 이 지운다

// 활성 런타임 상태(reconcile 이 쥔다)
const activeProviders = new Map<string, string>();  // 인터페이스 이름 → 지금 채우는 플러그인 id(승자)
const standbyNotes = new Map<string, string>();     // 플러그인 id → 「내 provide 가 대기다」 사유(둘이 채울 때 진 쪽)
const hosts = new Map<string, PluginHost>();        // 활성 플러그인별 호스트(attach/detach 가 쓴다)
const activeIds = new Set<string>();                // 지금 onActivate 까지 돈 플러그인
const attached = new Map<string, Set<string>>();    // 소비자 id → 지금 attach 된 인터페이스 이름 집합(늦은 연결)

function byId(id: string): PluginModule | undefined { return installed.find((x) => x.manifest.id === id); }

const req = (m: PluginModule) => m.manifest.requires ?? {};
const sup = (m: PluginModule) => m.manifest.supports ?? {};
const prov = (m: PluginModule) => m.manifest.provides ?? {};
const decl = (m: PluginModule): InterfaceContribution[] => m.manifest.contributes?.interfaces ?? [];

/** 약속 한 줄 — 어느 플러그인이 어느 버전·어떤 uses 로 선언했나. (정의/문서용 — 🔴 실행 판정엔 안 쓰인다 · listInterfaces 표시 전용) */
interface DeclaredIface { name: string; version: string; uses: string[]; pluginId: string }

/** 켜진(core||!disabled) 플러그인의 contributes.interfaces 를 모은다 — listInterfaces 화면이 「어느 약속이 선언돼 있나」를 보일 때만 쓴다. 같은 이름은 먼저 선언한 쪽. */
function collectDeclared(cands: PluginModule[]): Map<string, DeclaredIface> {
    const out = new Map<string, DeclaredIface>();
    for (const m of cands) {
        for (const it of decl(m)) {
            if (!out.has(it.name)) out.set(it.name, { name: it.name, version: it.version, uses: it.uses ?? [], pluginId: m.manifest.id });
            else console.warn(`[plugin] 약속 "${it.name}" 를 둘이 선언한다 — "${out.get(it.name)!.pluginId}" 가 이긴다, "${m.manifest.id}" 는 무시`);
        }
    }
    return out;
}

/**
 * 🔴 인터페이스 이름으로 모듈을 찾아 소비자에 바인딩해 돌려준다(host.modules.use 의 알맹이).
 *   없으면 undefined. 「호출자별 팩토리」(__perCaller)면 (소비자, (소비자,인터페이스) scope track) 으로 불러 바인딩.
 */
export function resolveModule(ifaceName: string, consumerId: string): unknown {
    const providerId = activeProviders.get(ifaceName);
    if (!providerId) return undefined;
    const mod = byId(providerId)?.modules?.[ifaceName];
    if (mod === undefined) return undefined;
    if (typeof mod === 'function' && (mod as Partial<PerCallerApi>).__perCaller) {
        return (mod as PerCallerApi)(consumerId, (d: Disposable) => trackScope(consumerId, ifaceName, d));
    }
    return mod;
}

// ── 버전 범위: `*`·`^a.b` 둘만(semver 전부는 안 한다) ──
function satisfies(range: string, version: string): boolean {
    if (range === '*') return true;
    const m = range.match(/^\^(\d+)\.(\d+)$/);
    if (!m) return false;                       // 모르는 범위 꼴 → 불만족(조용히 통과시키지 않는다)
    const [maj, min] = [parseInt(m[1], 10), parseInt(m[2], 10)];
    const v = version.split('.').map((n) => parseInt(n, 10) || 0);
    return v[0] === maj && (v[1] ?? 0) >= min;   // 0.x 포함: 메이저 같고 마이너 ≥
}

// ── 기기별 저장: { disabled: string[] } ──
const pluginsKey = () => storageKey('plugins');
function loadDisabled(): Set<string> {
    try {
        if (typeof localStorage === 'undefined') return new Set();
        const s = localStorage.getItem(pluginsKey());
        if (!s) return new Set();
        const raw = JSON.parse(s) as { disabled?: unknown };
        if (!raw || typeof raw !== 'object') {
            localStorage.removeItem(pluginsKey());
            return new Set();
        }
        const arr = Array.isArray(raw.disabled) ? raw.disabled.filter((x): x is string => typeof x === 'string') : [];
        return new Set(arr);
    } catch {
        try { localStorage.removeItem(pluginsKey()); } catch { /* 조용히 */ }
        return new Set();
    }
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

/**
 * 🔴 켜고 싶은 후보(= core 이거나 사용자가 안 끈 것)에서 위상 정렬을 돌려
 *   { order(켤 순서) · blocked(id→사유) · providers(인터페이스→승자) } 를 낸다. 🔴 순수 — 상태를 안 바꾼다.
 */
function computeActivation(): { order: string[]; blocked: Map<string, string>; providers: Map<string, string>; standby: Map<string, string> } {
    const cands = installed.filter((m) => m.manifest.core || !disabledIds.has(m.manifest.id));
    // 안정 순서: core 먼저, 같은 층은 설치(목록) 순
    const ordered = [...cands].sort((a, b) => Number(!!b.manifest.core) - Number(!!a.manifest.core));

    // ① 제공자 승자 — provides 만 본다. 🔴 정의(contributes.interfaces)가 켜졌나는 안 본다 — 제공자는 약속 정의 없이도 선다(쥔님 2026-11-08 19:42).
    //    둘이 같은 약속을 채우면 먼저 온 쪽이 이기고 진 쪽은 standby.
    const providers = new Map<string, string>();
    const standby = new Map<string, string>();
    for (const m of ordered) {
        for (const iface of Object.keys(prov(m))) {
            if (!providers.has(iface)) providers.set(iface, m.manifest.id);
            else standby.set(m.manifest.id, `인터페이스 "${iface}" 는 이미 "${providers.get(iface)}" 가 채움 — 대기`);
        }
    }

    const blocked = new Map<string, string>();
    // ② 직접 블록 — 🔴 실행 판정은 하나뿐: requires 한 약속을 **채우는 활성 플러그인**이 없으면(또는 버전 불일치) 꺼진다.
    //    정의가 있나/없나는 안 본다. 사유 한 줄: 「채워 주는 플러그인 없음 — '약속'」.
    for (const m of cands) {
        const id = m.manifest.id;
        for (const [iface, range] of Object.entries(req(m))) {
            const pid = providers.get(iface);
            if (!pid) { blocked.set(id, `꺼짐 — 채워 주는 플러그인 없음 — '${iface}'`); break; }
            const ver = prov(byId(pid)!)[iface];
            if (!satisfies(range, ver)) { blocked.set(id, `꺼짐 — 채워 주는 플러그인 없음 — '${iface}' (있는 것 ${ver}, 필요 ${range})`); break; }
        }
    }
    // ②' 호스트 검사 — nodeTypes 를 기여하는 플러그인은 requires.nodes 필수(제공자는 provides.nodes 로 면제).
    //    창틀이 nodeTypes 를 nodes 인터페이스 모듈에 넘기므로(applyContributes), 그 모듈 의존을 선언 안 하면 조용히 터진다.
    for (const m of cands) {
        if (blocked.has(m.manifest.id)) continue;
        const hasNodeTypes = (m.manifest.contributes?.nodeTypes?.length ?? 0) > 0;
        if (hasNodeTypes && !('nodes' in req(m)) && !('nodes' in prov(m))) {
            blocked.set(m.manifest.id, `꺼짐 — nodeTypes 기여엔 requires.nodes 선언이 필요하다`);
        }
    }
    // ③ 전이 블록 — 필요한 제공자가 블록이면 나도 블록(고정점)
    let changed = true;
    while (changed) {
        changed = false;
        for (const m of cands) {
            const id = m.manifest.id;
            if (blocked.has(id)) continue;
            for (const [iface] of Object.entries(req(m))) {
                const pid = providers.get(iface);
                if (pid && pid !== id && blocked.has(pid)) {
                    blocked.set(id, `꺼짐 — 채워 주는 플러그인 없음 — '${iface}' (제공자 ${byId(pid)!.manifest.name} 꺼짐)`);
                    changed = true; break;
                }
            }
        }
    }

    // ④ 위상 정렬(survivors) — 안정 Kahn. 남는 것은 순환.
    //    간선은 하나뿐: requires 의 제공자가 먼저(onActivate 가 바로 use 할 수 있게). 🔴 정의·uses 간선은 없다(실행 판정에서 뺐다).
    const survivors = ordered.filter((m) => !blocked.has(m.manifest.id));
    const remaining = new Set(survivors.map((m) => m.manifest.id));
    const edgesOf = (id: string): string[] => {
        const m = byId(id)!;
        const out = new Set<string>();
        for (const iface of Object.keys(req(m))) {               // requires 의 제공자가 먼저
            const pp = providers.get(iface);
            if (pp && pp !== id) out.add(pp);
        }
        return [...out];
    };
    const depsOf = (id: string): string[] => edgesOf(id).filter((p) => remaining.has(p));
    const order: string[] = [];
    let progress = true;
    while (progress && remaining.size) {
        progress = false;
        for (const m of survivors) {           // 안정 순서로 스캔
            const id = m.manifest.id;
            if (!remaining.has(id)) continue;
            if (depsOf(id).every((d) => !remaining.has(d))) {   // 모든 의존이 이미 켜졌다
                order.push(id); remaining.delete(id); progress = true; break;
            }
        }
    }
    // 남은 것 = 순환 — 고리를 찾아 사유로
    if (remaining.size) {
        for (const id of remaining) blocked.set(id, `꺼짐 — 순환: ${cyclePath(id, remaining, edgesOf)}`);
    }
    return { order, blocked, providers, standby };
}

/** 순환 고리 한 줄 — DFS 로 back-edge 를 찾아 `a → b → a` 로. 못 찾으면 남은 것들을 쉼표로. */
function cyclePath(start: string, nodes: Set<string>, edgesOfAll: (id: string) => string[]): string {
    const edges = (id: string): string[] => edgesOfAll(id).filter((p) => p !== id && nodes.has(p));
    const color = new Map<string, number>();   // 1 gray · 2 black
    const stack: string[] = [];
    let found: string[] | null = null;
    const dfs = (id: string): void => {
        if (found) return;
        color.set(id, 1); stack.push(id);
        for (const nx of edges(id)) {
            if (found) return;
            const c = color.get(nx) ?? 0;
            if (c === 1) { found = [...stack.slice(stack.indexOf(nx)), nx]; return; }
            if (c === 0) dfs(nx);
        }
        color.set(id, 2); stack.pop();
    };
    dfs(start);
    return (found ?? [...nodes]).join(' → ');
}

/** 한 플러그인을 활성한다 — 호스트를 만들고 contributes·onActivate·onFirstRun. 실패는 격리(failedIds). */
function activateOne(m: PluginModule): void {
    const id = m.manifest.id;
    failedIds.delete(id);
    if (!versionOk(m.manifest.minHostVersion)) {
        failedIds.add(id);
        console.warn(`[plugin] "${id}" 는 창틀 ${HOST_VERSION} 보다 높은 ${m.manifest.minHostVersion} 를 요구한다 — 활성 안 함`);
        return;
    }
    try {
        const host = makeHost(id, m, m.manifest);
        hosts.set(id, host);
        activeIds.add(id);
        applyContributes(m.manifest.contributes, m, host);
        if (m.lifecycle?.onActivate) void m.lifecycle.onActivate(host);
        if (m.lifecycle?.onFirstRun) {
            const firstRun = m.lifecycle.onFirstRun;
            host.onFirstRun(() => firstRun(host));
        }
    } catch (e) {
        failedIds.add(id);
        hosts.delete(id);
        activeIds.delete(id);
        disposeOwner(id);
        console.error(`[plugin] "${id}" 활성 실패 — 나머지는 계속`, e);
    }
}

/** 한 플러그인을 비활성한다 — 자기 supports 를 먼저 떼고(detach), 등록물·scope 전부 회수. */
function deactivate(id: string): void {
    if (!activeIds.has(id)) return;
    const att = attached.get(id);
    if (att) for (const iface of [...att]) runDetach(id, iface);   // 소비자로서 붙은 것 먼저 떼기
    disposeOwner(id);
    disposeConsumerScopes(id);
    attached.delete(id);
    hosts.delete(id);
    activeIds.delete(id);
}

/** 늦은 연결 — 이 소비자가 supports 한 인터페이스 중 지금 채워졌고 아직 안 붙은 것에 attach. */
function runAttach(consumerId: string): void {
    const m = byId(consumerId);
    const host = hosts.get(consumerId);
    if (!m || !host) return;
    const hooks = m.lifecycle?.onInterface;
    const att = attached.get(consumerId) ?? new Set<string>();
    for (const [iface, range] of Object.entries(sup(m))) {
        if (att.has(iface)) continue;
        const pid = activeProviders.get(iface);
        if (!pid) continue;
        const ver = prov(byId(pid)!)[iface];
        if (!ver || !satisfies(range, ver)) continue;
        const hook = hooks?.[iface];
        if (!hook) { att.add(iface); continue; }   // supports 만 적고 훅이 없어도 「붙음」으로 친다(쓰는 게 없을 뿐)
        try {
            hook.attach(host, resolveModule(iface, consumerId));
            att.add(iface);
        } catch (e) { console.error(`[plugin] "${consumerId}" onInterface.${iface}.attach 실패`, e); }
    }
    attached.set(consumerId, att);
}

/** 늦은 해제 — detach 를 부르고(순서 ①) scope 를 거둔다(②). 소비자는 계속 켜져 있다(supports 니까). */
function runDetach(consumerId: string, iface: string): void {
    const att = attached.get(consumerId);
    if (!att || !att.has(iface)) return;
    const m = byId(consumerId);
    const host = hosts.get(consumerId);
    const hook = m?.lifecycle?.onInterface?.[iface];
    if (hook && host) {
        try { hook.detach(host); } catch (e) { console.error(`[plugin] "${consumerId}" onInterface.${iface}.detach 실패`, e); }
    }
    att.delete(iface);
    disposeScope(consumerId, iface);   // 순서: detach → scope dispose
}

/**
 * 🔴 ⭐ 조정(reconcile) — disabledIds 로부터 바라는 활성 상태를 계산해 지금 상태와 맞춘다.
 *   활성·비활성·블록·늦은 연결이 전부 여기 한 곳에서 난다(자동 복귀 = 제공자가 켜지면 블록이 풀려 다시 order 에 든다).
 *   순서: 사라진 제공자의 supports 소비자 detach → 안 바라는 플러그인 deactivate → providers 교체 → 새로 켤 것 activate → attach.
 */
function reconcile(): void {
    const { order, blocked, providers, standby } = computeActivation();
    const desired = new Set(order);
    const newProviders = new Map<string, string>();
    for (const [iface, pid] of providers) if (desired.has(pid)) newProviders.set(iface, pid);

    // ① detach — 이미 붙어 있던 소비자 중, 그 인터페이스 제공자가 사라진/바뀐 것
    for (const consumerId of [...activeIds]) {
        const att = attached.get(consumerId);
        if (!att) continue;
        for (const iface of [...att]) {
            if (newProviders.get(iface) === undefined) runDetach(consumerId, iface);
        }
    }
    // ② deactivate — 지금 켜졌지만 더는 안 바라는 것(끈 것·블록된 것)
    for (const id of [...activeIds].reverse()) if (!desired.has(id)) deactivate(id);

    // ③ providers 교체
    activeProviders.clear();
    for (const [iface, pid] of newProviders) activeProviders.set(iface, pid);
    standbyNotes.clear();
    for (const [id, note] of standby) if (desired.has(id)) standbyNotes.set(id, note);

    // ④ activate — 새로 켤 것(order 순). 이미 켜진 건 건너뛴다.
    for (const id of order) if (!activeIds.has(id)) activateOne(byId(id)!);

    // ⑤ 블록 사유 갱신 + attach(늦은 연결) — 전부 켜진 뒤 한 번
    blockedReasons.clear();
    for (const [id, r] of blocked) blockedReasons.set(id, r);
    for (const [id, note] of standbyNotes) console.warn(`[plugin] "${id}" — ${note}`);
    for (const id of order) runAttach(id);
}

export function activateAll(modules: PluginModule[]): void {
    // 🔴 깨끗한 시작 — 런타임 상태를 전부 비운다(activateAll 은 「다시 켜기」가 아니라 처음부터다).
    //    ⛔ activeIds 를 안 비우면 두 번째 activateAll 이 「이미 활성」으로 보고 등록을 건너뛴다.
    //    ⭐ 약속 목록은 이제 플러그인들의 contributes.interfaces 에서 모은다 — 창틀에 고정 배열(옛 INTERFACES)이 없다.
    installed = [...modules];
    disabledIds = loadDisabled();
    // 🔴 유령·코어 ID 자동 정리 — 플러그인이 통폐합·삭제됐거나 코어로 승격됐는데 옛 localStorage 의 disabled 에
    //    남아 있으면 거둬내고 저장소를 깨끗이 맞춘다.
    const validToggleable = new Set(modules.filter((m) => !m.manifest.core).map((m) => m.manifest.id));
    let pruned = false;
    for (const id of [...disabledIds]) {
        if (!validToggleable.has(id)) {
            disabledIds.delete(id);
            pruned = true;
        }
    }
    if (pruned) saveDisabled();
    failedIds.clear();
    blockedReasons.clear();
    activeProviders.clear();
    standbyNotes.clear();
    activeIds.clear();
    hosts.clear();
    attached.clear();
    reconcile();
}

/** 다시 켜기 — 끈 목록에서 빼고 조정(블록됐던 의존자까지 자동 복귀 · supports 소비자엔 attach). */
export function enablePlugin(id: string): void {
    if (!byId(id)) return;
    let touched = false;
    if (disabledIds.delete(id)) { saveDisabled(); touched = true; }
    if (!touched && !blockedReasons.has(id)) return;   // 이미 켜져 있고 블록도 아니면 할 일 없음
    reconcile();
    emitReg();
}

/** 끄기 — 끈 목록에 넣고 조정. requires 로 매달린 것은 같이 블록되고, supports 로 붙은 것은 detach 만(계속 켜짐). ⛔ 코어는 거부. */
export function disablePlugin(id: string): void {
    const m = byId(id);
    if (!m) return;
    if (m.manifest.core) { console.warn(`[plugin] "${id}" 는 코어다 — 끌 수 없다`); return; }
    disabledIds.add(id);
    saveDisabled();
    reconcile();
    emitReg();
}

/**
 * 🔴 이 플러그인을 끄면 requires 로 같이 꺼지는(블록되는) 플러그인들 — 설정 토글이 「같이 꺼지는 것」 인라인으로 보여 준다.
 *   ⭐ 계산은 한 벌이다 — 순수 함수 disableImpact 한 곳에만 규칙이 산다. 여기선 지금 상태(listPlugins)를 그 함수에 먹인다.
 */
export function dependentsOf(id: string): string[] {
    return disableImpact(id, listPlugins()).willBlock.map((x) => x.id);
}

export interface PluginStatus {
    id: string;
    name: string;
    version: string;
    core: boolean;
    enabled: boolean;        // 사용자 의도(안 껐나) — blocked 여도 enabled 는 true 일 수 있다
    failed: boolean;
    blocked: boolean;        // requires 미충족(비영구)
    /** blocked·failed·standby 사유 한 줄 — 자리표시·상세가 그대로 그린다. */
    reason?: string;
    description?: string;
    minHostVersion: string;
    /** 모듈·의존성 — 채우는/필요한/있으면 쓰는 인터페이스(장부가 그린다). */
    provides: Record<string, string>;
    requires: Record<string, string>;
    supports: Record<string, string>;
    /** 🔴 선언한 약속(contributes.interfaces) — 약속 플러그인은 이것만 있다(장부 「선언한 약속」). */
    interfaces: { name: string; version: string; uses: string[] }[];
    /** 🔴 선언한 권한 낱말(contributes.permissions) — 호스트는 모으기만, 장부가 표시(페이블 8). 정책 편집 화면도 이걸 모은다. */
    permissions: { id: string; title: string }[];
    /** 🔴 선언한 사용자 칸(contributes.userFields) — 계정 화면이 모아 그린다. */
    userFields: { id: string; title: string; editor?: string }[];
    /** 🔴 선언한 역할 칸(contributes.roleFields). */
    roleFields: { id: string; title: string; editor?: string }[];
}
export function listPlugins(): PluginStatus[] {
    return installed.map((m) => {
        const id = m.manifest.id;
        const blocked = blockedReasons.has(id);
        const reason = blockedReasons.get(id) ?? standbyNotes.get(id);
        return {
            id,
            name: m.manifest.name,
            version: m.manifest.version,
            description: m.manifest.description,
            minHostVersion: m.manifest.minHostVersion,
            core: !!m.manifest.core,
            enabled: !disabledIds.has(id),
            failed: failedIds.has(id),
            blocked,
            reason,
            provides: { ...prov(m) },
            requires: { ...req(m) },
            supports: { ...sup(m) },
            interfaces: decl(m).map((it) => ({ name: it.name, version: it.version, uses: it.uses ?? [] })),
            permissions: (m.manifest.contributes?.permissions ?? []).map((p) => ({ ...p })),
            userFields: (m.manifest.contributes?.userFields ?? []).map((f) => ({ ...f })),
            roleFields: (m.manifest.contributes?.roleFields ?? []).map((f) => ({ ...f })),
        };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 ⭐ 끄기 영향 — 단일 진실. dependentsOf(호스트)·설정 상세/토글이 전부 이 한 함수를 부른다.
//   입력은 PluginStatus[](listPlugins) 하나뿐이라 순수하게 잴 수 있다(vitest 단독). 전역 런타임을 안 건드린다.
// ─────────────────────────────────────────────────────────────────────────────
export interface ImpactItem { id: string; name: string; /** 어느 약속을 통해 매였나(사람에게 보여 줄 꼬리표). */ via: string }
export interface DisableImpact {
    /** requires 로 매달려 **같이 꺼질**(blocked 될) 플러그인 — 전이 포함. */
    willBlock: ImpactItem[];
    /** supports 로 붙어 **기능만 떨어질**(detach) 플러그인 — 계속 켜져 있다. */
    willDegrade: ImpactItem[];
}

/**
 * 🔴 targetId 를 끄면 생기는 영향. 전이(연쇄)까지 고정점으로 계산.
 *   🔴 실행 판정과 같은 규칙 하나뿐: 「requires 한 약속의 제공자가 전부 꺼지면(providerGone) 그 소비자도 꺼진다」.
 *   정의(contributes.interfaces)·uses 연쇄는 보지 않는다 — 제공자가 사라지는 길 하나로만 번진다.
 *     willBlock(requires) — 끄는 집합 때문에 requires 제공자를 잃은 플러그인(전이).
 *     willDegrade(supports) — 사라지는 약속을 supports 로 붙였던, 집합 밖의 살아 있는 플러그인(detach · 계속 켜짐).
 */
export function disableImpact(targetId: string, plugins: PluginStatus[]): DisableImpact {
    const byPid = new Map(plugins.map((p) => [p.id, p]));
    if (!byPid.has(targetId)) return { willBlock: [], willDegrade: [] };

    const live = (p: PluginStatus) => p.enabled && !p.blocked && !p.failed;
    const blockVia = new Map<string, string>();
    const down = new Set<string>([targetId]);       // 꺼질(또는 블록될) 집합

    // 집합이 끄는 약속 중, 집합 밖에 살아 있는 다른 제공자가 없어 **제공자가 사라지는** 약속.
    const providerGoneFromDown = (): Set<string> => {
        const providedDown = new Set<string>();
        for (const id of down) for (const k of Object.keys(byPid.get(id)!.provides)) providedDown.add(k);
        const gone = new Set<string>();
        for (const x of providedDown) {
            const other = plugins.some((p) => !down.has(p.id) && live(p) && x in p.provides);
            if (!other) gone.add(x);
        }
        return gone;
    };

    // 고정점 — requires 제공자를 잃은 플러그인을 집합으로 끌어들인다(그러면 그 플러그인의 provides 도 사라져 또 번진다).
    let changed = true;
    while (changed) {
        changed = false;
        const gone = providerGoneFromDown();
        for (const m of plugins) {
            if (down.has(m.id) || !live(m)) continue;
            const via = Object.keys(m.requires).find((i) => gone.has(i));
            if (via) { down.add(m.id); blockVia.set(m.id, via); changed = true; }
        }
    }
    const willBlock: ImpactItem[] = plugins
        .filter((m) => m.id !== targetId && down.has(m.id))
        .map((m) => ({ id: m.id, name: m.name, via: blockVia.get(m.id) ?? '' }));

    // willDegrade — 사라지는 약속을 supports 로 붙였던, 집합 밖의 살아 있는 플러그인.
    const gone = providerGoneFromDown();
    const willDegrade: ImpactItem[] = [];
    for (const m of plugins) {
        if (down.has(m.id) || !live(m)) continue;
        const hit = Object.keys(m.supports).find((i) => gone.has(i));
        if (hit) willDegrade.push({ id: m.id, name: m.name, via: hit });
    }
    return { willBlock, willDegrade };
}

/**
 * 🔴 지금 그 플러그인이 어느 인터페이스에 붙어 있나(장부 「있으면 쓰는 것」의 붙음/안 붙음). supports 이름 → 붙었나.
 */
export function attachmentsOf(id: string): { iface: string; attached: boolean }[] {
    const m = byId(id);
    if (!m) return [];
    const att = attached.get(id) ?? new Set<string>();
    return Object.keys(sup(m)).map((iface) => ({ iface, attached: att.has(iface) }));
}

/** 🔴 누가 나를(이 플러그인이 채우는 인터페이스를) 쓰나 — requires·supports 로 이 제공자에 매인 플러그인 id. */
export function consumersOf(id: string): string[] {
    const mine = Object.keys(prov(byId(id) ?? ({} as PluginModule))).filter((i) => activeProviders.get(i) === id);
    if (!mine.length) return [];
    return installed
        .filter((m) => m.manifest.id !== id)
        .filter((m) => Object.keys({ ...req(m), ...sup(m) }).some((i) => mine.includes(i)))
        .map((m) => m.manifest.id);
}

/** 인터페이스 목록(설정 「인터페이스」 화면용) — 이름·버전·선언한 플러그인·채운 모듈·기다리는 플러그인. */
export interface InterfaceStatus { name: string; version: string; declaredBy: string; provider: string | null; waiting: string[] }
export function listInterfaces(): InterfaceStatus[] {
    // 🔴 켜진(core||!disabled) 플러그인들의 contributes.interfaces 를 모은다 — 약속 플러그인을 끄면 그 약속이 목록에서 사라진다.
    const declared = collectDeclared(installed.filter((m) => m.manifest.core || !disabledIds.has(m.manifest.id)));
    return [...declared.values()].map((d) => ({
        name: d.name,
        version: d.version,
        declaredBy: d.pluginId,
        provider: activeProviders.get(d.name) ?? null,
        waiting: installed
            .filter((m) => d.name in { ...req(m), ...sup(m) } && activeProviders.get(d.name) !== m.manifest.id)
            .map((m) => m.manifest.id),
    }));
}

/** 이 viewId 의 주인 플러그인 — 자리표시가 「누가 꺼졌나/블록됐나」를 알아내는 창구(viewId 접두사로). */
export function ownerOfView(viewId: string): { id: string; name: string; enabled: boolean; blocked: boolean; reason?: string } | null {
    const pid = viewId.split('.')[0];
    const m = byId(pid);
    if (!m) return null;
    return {
        id: pid,
        name: m.manifest.name,
        enabled: !disabledIds.has(pid),
        blocked: blockedReasons.has(pid),
        reason: blockedReasons.get(pid),
    };
}
