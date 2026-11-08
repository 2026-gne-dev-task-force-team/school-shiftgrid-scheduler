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
import type { PluginModule, PluginHost, Disposable, PerCallerApi, InterfaceDecl } from './types';
import { HOST_VERSION } from './types';
import { makeHost } from './host';
import { applyContributes } from './contributes';
import { disposeOwner, trackScope, disposeScope, disposeConsumerScopes } from './store';

// ── 설치된 모듈 + 상태 ──
let installed: PluginModule[] = [];
let activeInterfaces: InterfaceDecl[] = [];     // src/app 이 데이터로 넘긴 인터페이스 목록(창틀은 src/interfaces 를 모른다)
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

/**
 * 🔴 켜고 싶은 후보(= core 이거나 사용자가 안 끈 것)에서 위상 정렬을 돌려
 *   { order(켤 순서) · blocked(id→사유) · providers(인터페이스→승자) } 를 낸다. 🔴 순수 — 상태를 안 바꾼다.
 */
function computeActivation(): { order: string[]; blocked: Map<string, string>; providers: Map<string, string>; standby: Map<string, string> } {
    const cands = installed.filter((m) => m.manifest.core || !disabledIds.has(m.manifest.id));
    // 안정 순서: core 먼저, 같은 층은 설치(목록) 순
    const ordered = [...cands].sort((a, b) => Number(!!b.manifest.core) - Number(!!a.manifest.core));

    // ① 제공자 승자 — 같은 인터페이스를 둘이 채우면 먼저 온 쪽(ordered 순). 진 쪽은 standby.
    const providers = new Map<string, string>();
    const standby = new Map<string, string>();
    for (const m of ordered) {
        for (const iface of Object.keys(prov(m))) {
            if (!providers.has(iface)) providers.set(iface, m.manifest.id);
            else standby.set(m.manifest.id, `인터페이스 "${iface}" 는 이미 "${providers.get(iface)}" 가 채움 — 대기`);
        }
    }

    const blocked = new Map<string, string>();
    // ② 직접 블록 — requires 인터페이스가 없거나 버전이 안 맞는다
    for (const m of cands) {
        for (const [iface, range] of Object.entries(req(m))) {
            const pid = providers.get(iface);
            if (!pid) { blocked.set(m.manifest.id, `꺼짐 — "${iface}" ${range} 없음`); break; }
            const ver = prov(byId(pid)!)[iface];
            if (!satisfies(range, ver)) { blocked.set(m.manifest.id, `꺼짐 — "${iface}" ${range} 없음(있는 것 ${ver})`); break; }
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
                    blocked.set(id, `꺼짐 — "${iface}" 제공자(${byId(pid)!.manifest.name}) 꺼짐`);
                    changed = true; break;
                }
            }
        }
    }

    // ④ 위상 정렬(survivors) — 안정 Kahn. 남는 것은 순환.
    const survivors = ordered.filter((m) => !blocked.has(m.manifest.id));
    const remaining = new Set(survivors.map((m) => m.manifest.id));
    const depsOf = (id: string): string[] =>
        Object.keys(req(byId(id)!)).map((iface) => providers.get(iface))
            .filter((p): p is string => !!p && p !== id && remaining.has(p));
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
        for (const id of remaining) blocked.set(id, `꺼짐 — 순환: ${cyclePath(id, remaining, providers)}`);
    }
    return { order, blocked, providers, standby };
}

/** 순환 고리 한 줄 — DFS 로 back-edge 를 찾아 `a → b → a` 로. 못 찾으면 남은 것들을 쉼표로. */
function cyclePath(start: string, nodes: Set<string>, providers: Map<string, string>): string {
    const edges = (id: string): string[] =>
        Object.keys(req(byId(id)!)).map((i) => providers.get(i)).filter((p): p is string => !!p && p !== id && nodes.has(p));
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

export function activateAll(modules: PluginModule[], options?: { interfaces?: InterfaceDecl[] }): void {
    // 🔴 깨끗한 시작 — 런타임 상태를 전부 비운다(activateAll 은 「다시 켜기」가 아니라 처음부터다).
    //    ⛔ activeIds 를 안 비우면 두 번째 activateAll 이 「이미 활성」으로 보고 등록을 건너뛴다.
    installed = [...modules];
    activeInterfaces = options?.interfaces ? [...options.interfaces] : [];
    disabledIds = loadDisabled();
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
 *   지금 이 플러그인이 채우는 인터페이스를 requires 하는 활성 플러그인 + 그 전이(그 플러그인이 또 채우는 것에 매달린 것).
 */
export function dependentsOf(id: string): string[] {
    const out = new Set<string>();
    const stack = [id];
    while (stack.length) {
        const cur = stack.pop()!;
        const curProvides = Object.keys(prov(byId(cur) ?? ({} as PluginModule))).filter((i) => activeProviders.get(i) === cur);
        if (!curProvides.length) continue;
        for (const m of installed) {
            const mid = m.manifest.id;
            if (out.has(mid) || mid === id) continue;
            if (Object.keys(req(m)).some((i) => curProvides.includes(i))) { out.add(mid); stack.push(mid); }
        }
    }
    return [...out];
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
        };
    });
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

/** 인터페이스 목록(설정 「인터페이스」 화면용) — 이름·버전·채운 모듈·기다리는 플러그인. */
export interface InterfaceStatus { name: string; version: string; provider: string | null; waiting: string[] }
export function listInterfaces(): InterfaceStatus[] {
    return activeInterfaces.map((decl) => ({
        name: decl.name,
        version: decl.version,
        provider: activeProviders.get(decl.name) ?? null,
        waiting: installed
            .filter((m) => decl.name in { ...req(m), ...sup(m) } && activeProviders.get(decl.name) !== m.manifest.id)
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
