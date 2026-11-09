/**
 * 플러그인 기여 스토어 + 주인 꼬리표 + 작업대 다리 + 작업대 이벤트.
 *
 * 🔴 ⛔ 도메인 0. 여기는 「누가 무엇을 등록했나」만 쥔다 — viewId·명령·항목이 무슨 뜻인지 모른다.
 *
 * ⭐ 사는 것:
 *   ① 주인별 Disposable 묶음 — 플러그인이 안 챙겨도 호스트가 모아 뒀다가 끌 때 한꺼번에 부른다(P2).
 *   ② 기여 스토어(contrib) — 리본 동작·명령·설정 섹션/항목·탭 메뉴·새 탭. 하나의 버전으로 묶어 구독한다.
 *   ③ 상태바 스토어 — 항목마다 render 를 들고, 작업대 이벤트에도 다시 그린다(상태바는 흔히 작업대를 비춘다).
 *   ④ 작업대 다리 — host.workspace.open/close 를 Workbench 로 넘긴다(host 는 React 밖에 산다).
 *   ⑤ 작업대 이벤트 — view-open/close/activate. Workbench 가 트리 변화를 재서 fireWorkspace 로 쏜다.
 */
import { useSyncExternalStore } from 'react';
import type { ComponentType } from 'react';
import type { IconName } from '../primitives/Icon';
import type { MenuEntry } from '../primitives/ContextMenu';
import type {
    Disposable, RibbonAction, WorkspaceOpenOptions, CommandDef, CommandContext,
    StatusContribution, TabMenuContext, WorkspaceEvent, WorkspaceLeafInfo, ContributionRecord, PropertiesTarget,
} from './types';

// ── ① 주인별 Disposable ──
const owned = new Map<string, Disposable[]>();

/** 주인 꼬리표를 달아 모아 둔다 — 그대로 돌려준다(체이닝). */
export function track(owner: string, d: Disposable): Disposable {
    const arr = owned.get(owner) ?? [];
    arr.push(d);
    owned.set(owner, arr);
    return d;
}

/** 그 주인의 등록물을 전부 회수한다(역순) — P2 비활성에서 쓴다. */
export function disposeOwner(owner: string): void {
    const arr = owned.get(owner);
    if (!arr) return;
    for (const d of [...arr].reverse()) {
        try { d.dispose(); } catch { /* 하나가 던져도 나머지는 회수 */ }
    }
    owned.set(owner, []);
}

// ── 모듈 scope (소비자, 인터페이스) ──
// 🔴 host.modules.use·onInterface.attach 가 받은 구독(Disposable)을 이 묶음에 모은다 — detach 때 그 묶음만 거둔다.
//    owner(소비자) 묶음과 **따로**다: supports 제공자가 사라져도 소비자 뷰(owner)는 안 죽고, 그 인터페이스 scope 만 거둬진다.
const scopes = new Map<string, Disposable[]>();
const scopeKey = (consumer: string, iface: string) => `${consumer}\u0000${iface}`;

/** 그 (소비자,인터페이스) scope 에 구독을 단다 — 돌려주는 Disposable 은 거둘 때 제 자리를 scope 에서 뺀다(scopeSize 가 정확하게). */
export function trackScope(consumer: string, iface: string, d: Disposable): Disposable {
    const k = scopeKey(consumer, iface);
    const arr = scopes.get(k) ?? [];
    scopes.set(k, arr);
    const wrapped: Disposable = {
        dispose() {
            const i = arr.indexOf(wrapped);
            if (i >= 0) arr.splice(i, 1);
            try { d.dispose(); } catch { /* 조용히 */ }
        },
    };
    arr.push(wrapped);
    return wrapped;
}

/** 그 (소비자,인터페이스) scope 를 통째로 거둔다(detach 때). 각 래퍼가 제 자리를 빼므로 끝나면 scopeSize 0. */
export function disposeScope(consumer: string, iface: string): void {
    const arr = scopes.get(scopeKey(consumer, iface));
    if (!arr) return;
    for (const w of [...arr]) { try { w.dispose(); } catch { /* 하나 던져도 나머지 */ } }
}

/** 지금 그 scope 에 살아 있는 구독 수 — 테스트·장부가 「붙어 있나」를 잰다. */
export function scopeSize(consumer: string, iface: string): number {
    return (scopes.get(scopeKey(consumer, iface)) ?? []).length;
}

/** 그 소비자의 **모든** 인터페이스 scope 를 거둔다 — 소비자가 꺼질 때(disposeOwner 와 짝). */
export function disposeConsumerScopes(consumer: string): void {
    const prefix = `${consumer}\u0000`;
    for (const k of [...scopes.keys()]) {
        if (!k.startsWith(prefix)) continue;
        const arr = scopes.get(k)!;
        for (const w of [...arr]) { try { w.dispose(); } catch { /* */ } }
    }
}

// ── ② 기여 버전 구독 — 등록물이 바뀌면(활성·비활성·등록·회수) 이 버전이 오른다 ──
// 🔴 리본·설정·새 탭을 그리는 React 컴포넌트가 이걸 구독해 다시 그린다(P2 토글이 라이브인 이유).
const contribListeners = new Set<() => void>();
let contribVersion = 0;
function emitContrib(): void { contribVersion += 1; for (const l of contribListeners) l(); }
function subscribeContrib(l: () => void): () => void { contribListeners.add(l); return () => { contribListeners.delete(l); }; }
function contribSnapshot(): number { return contribVersion; }
/** 바깥(호스트)에서 기여 버전을 올린다 — 뷰 등록/해제는 리본·뷰 목록을 바꾸니 다시 그리게 한다. */
export function touchContrib(): void { emitContrib(); }
/** React 구독 — 기여물(리본·명령·설정·새 탭)이 바뀌면 다시 그린다. */
export function useContribVersion(): number {
    return useSyncExternalStore(subscribeContrib, contribSnapshot, contribSnapshot);
}

// ── 기여 장부(읽기 전용 거울) ──
// 🔴 ⛔ 등록소가 아니다 — 실제 등록은 위 스토어(명령·리본·설정·상태바·뷰 레지스트리)가 한다.
//    declareOne 이 꽂을 때 한 줄을 남기고, 그 Disposable 이 불리면(개별 dispose·disposeOwner) 뺀다.
//    주인(플러그인 id)별 목록. 꺼지면 그 주인 Disposable 이 전부 회수되며 장부도 비므로, 「켜져 있을 때의 값」을 비춘다.
const ledger = new Map<string, ContributionRecord[]>();

/** 장부에 한 줄 남긴다 — Disposable 을 돌려준다(declareOne 이 track 해, 개별 dispose·disposeOwner 때 빠진다). */
export function recordContribution(owner: string, rec: ContributionRecord): Disposable {
    const arr = ledger.get(owner) ?? [];
    arr.push(rec);
    ledger.set(owner, arr);
    emitContrib();
    return {
        dispose() {
            const a = ledger.get(owner);
            if (!a) return;
            const i = a.indexOf(rec);
            if (i >= 0) { a.splice(i, 1); emitContrib(); }
        },
    };
}

/** 이 플러그인이 지금 호스트에 꽂아 둔 기여 전부(등록 순). 꺼진·안 꽂은 플러그인은 빈 배열. */
export function listContributions(owner: string): ContributionRecord[] {
    return [...(ledger.get(owner) ?? [])];
}

// ── 리본 동작 스토어 ──
let ribbonSeq = 0;
const ribbonActions: (RibbonAction & { owner: string; seq: number })[] = [];

/** 리본 동작을 꽂는다 — 「뷰 열기」가 아니라 명령을 가리키는 동작(호스트가 명령에서 label·icon·run 을 푼다). */
export function addRibbonAction(owner: string, a: RibbonAction): Disposable {
    const entry = { ...a, owner, seq: ribbonSeq++ };
    ribbonActions.push(entry);
    emitContrib();
    return { dispose() { const i = ribbonActions.indexOf(entry); if (i >= 0) { ribbonActions.splice(i, 1); emitContrib(); } } };
}

/** order 오름차순, 같으면 등록 순(안정). Rail·RibbonSheet 가 뷰 설탕과 합쳐 그린다. */
export function listRibbonActions(): RibbonAction[] {
    return [...ribbonActions].sort((x, y) => (x.order ?? 0) - (y.order ?? 0) || x.seq - y.seq);
}

// ── 명령 스토어(P1 자리 — 팔레트·단축키는 ⏸️) ──
const commands = new Map<string, CommandDef & { owner: string }>();

export function addCommand(owner: string, c: CommandDef): Disposable {
    commands.set(c.id, { ...c, owner });
    emitContrib();
    return { dispose() { if (commands.get(c.id)?.owner === owner) { commands.delete(c.id); emitContrib(); } } };
}

export function getCommand(id: string): (CommandDef & { owner: string }) | undefined { return commands.get(id); }
export function listCommands(): (CommandDef & { owner: string })[] { return [...commands.values()]; }
/** 지금 이 맥락으로 부를 수 있나 — 없는 명령은 false · enabled 가 없으면 true · 판정이 던지면 false. */
export function commandEnabled(id: string, ctx?: CommandContext): boolean {
    const c = commands.get(id);
    if (!c) return false;
    try { return c.enabled ? c.enabled(ctx) : true; } catch { return false; }
}

/**
 * 🔴 ⭐ 명령 실행 — 「모든 동작은 명령」(쥔님). 단추·메뉴·팔레트가 전부 이 한 길로 동작을 부른다.
 *   ctx 로 「어느 탭에」를 넘긴다(우클릭 메뉴). 팔레트처럼 ctx 없이 부르면 명령이 활성 탭을 쓴다.
 *   없는 id 는 경고하고 false(조용히 삼키지 않는다).
 */
export function runCommand(id: string, ctx?: CommandContext): boolean {
    const c = commands.get(id);
    if (!c) { console.warn(`[plugin] 없는 명령을 부름: ${id}`); return false; }
    if (!commandEnabled(id, ctx)) return false;   // 🔴 낡은 맥락(지난 되돌리기 토큰 등) — 안 부른다
    try { c.run(ctx); } catch (e) { console.error(`[plugin] 명령 "${id}" 실행 실패`, e); }
    return true;
}

// ── 설정 섹션/항목 스토어 ──
export interface SettingsSectionEntry { id: string; title: string; icon?: IconName; owner: string; seq: number }
export interface SettingsItemEntry {
    section: string; id: string; title: string; icon: IconName; Pane: ComponentType; owner: string; seq: number;
}
let settingsSeq = 0;
const settingsSections = new Map<string, SettingsSectionEntry>();
const settingsItems: SettingsItemEntry[] = [];

/** 섹션을 연다 — 제목은 첫 등록이 이긴다(이미 있으면 안 덮는다). */
export function addSettingsSection(owner: string, id: string, title: string, icon?: IconName): Disposable {
    if (!settingsSections.has(id)) {
        settingsSections.set(id, { id, title, icon, owner, seq: settingsSeq++ });
        emitContrib();
    }
    return { dispose() { if (settingsSections.get(id)?.owner === owner) { settingsSections.delete(id); emitContrib(); } } };
}

/** 항목을 꽂는다 — 섹션이 없으면 암묵 생성(제목=sectionTitle ?? section). */
export function addSettingsItem(
    owner: string,
    i: { section: string; sectionTitle?: string; id: string; title: string; icon: IconName; Pane: ComponentType },
): Disposable {
    if (!settingsSections.has(i.section)) {
        settingsSections.set(i.section, { id: i.section, title: i.sectionTitle ?? i.section, owner, seq: settingsSeq++ });
    }
    const entry: SettingsItemEntry = {
        section: i.section, id: i.id, title: i.title, icon: i.icon, Pane: i.Pane, owner, seq: settingsSeq++,
    };
    settingsItems.push(entry);
    emitContrib();
    return { dispose() { const k = settingsItems.indexOf(entry); if (k >= 0) { settingsItems.splice(k, 1); emitContrib(); } } };
}

/** 그릴 설정 — 항목이 있는 섹션만(빈 섹션은 안 그린다), 섹션·항목 모두 등록 순. */
export function listSettings(): { id: string; title: string; icon?: IconName; owner: string; items: SettingsItemEntry[] }[] {
    const sections = [...settingsSections.values()].sort((a, b) => a.seq - b.seq);
    const items = [...settingsItems].sort((a, b) => a.seq - b.seq);
    // owner 를 같이 준다 — 설정 화면이 「앱 설정」과 「플러그인이 띄운 설정」을 갈라 그린다(쥔님 2026-11-01 13:39)
    return sections
        .map((s) => ({ id: s.id, title: s.title, icon: s.icon, owner: s.owner, items: items.filter((it) => it.section === s.id) }))
        .filter((s) => s.items.length > 0);
}

// ── 인스펙터 칸 스토어 — 인스펙터 패널이 「고른 대상」의 종류로 모아 그린다 ──
export interface PropertiesEntry { target: string; id: string; title: string; order: number; Pane: ComponentType<{ target: PropertiesTarget }>; owner: string; seq: number }
let propSeq = 0;
const propEntries: PropertiesEntry[] = [];

export function addPropertiesPane(owner: string, p: Omit<PropertiesEntry, 'owner' | 'seq'>): Disposable {
    const entry: PropertiesEntry = { ...p, owner, seq: propSeq++ };
    propEntries.push(entry);
    emitContrib();
    return { dispose() { const k = propEntries.indexOf(entry); if (k >= 0) { propEntries.splice(k, 1); emitContrib(); } } };
}

/** 이 종류에 꽂힌 인스펙터 칸 — order 작은 것 먼저, 같으면 등록 순. */
export function listPropertiesPanes(target: string): PropertiesEntry[] {
    return propEntries.filter((e) => e.target === target).sort((a, b) => a.order - b.order || a.seq - b.seq);
}

// ── 탭 메뉴 기여(모든 탭의 우클릭 메뉴에 붙는다) ──
type TabMenuFactory = (ctx: TabMenuContext) => MenuEntry[];
const tabMenuFactories: { owner: string; fn: TabMenuFactory }[] = [];

export function addTabMenuItem(owner: string, fn: TabMenuFactory): Disposable {
    const entry = { owner, fn };
    tabMenuFactories.push(entry);
    emitContrib();
    return { dispose() { const i = tabMenuFactories.indexOf(entry); if (i >= 0) { tabMenuFactories.splice(i, 1); emitContrib(); } } };
}

/** 이 탭에 붙는 플러그인 메뉴 항목들 — WorkspaceView 가 틀 메뉴 뒤에 붙인다. */
export function listTabMenu(ctx: TabMenuContext): MenuEntry[] {
    return tabMenuFactories.flatMap((e) => { try { return e.fn(ctx); } catch { return []; } });
}

// ── 새 탭이 여는 것(한 칸, 뒤가 이긴다 + 콘솔 경고) ──
export interface NewTabContribution { owner: string; viewId: string; label: string }
let newTab: NewTabContribution | null = null;

export function setNewTab(owner: string, viewId: string, label: string): Disposable {
    if (newTab && (newTab.owner !== owner || newTab.viewId !== viewId)) {
        console.warn(`[plugin] "새 탭" 이 이미 등록돼 있다(${newTab.owner}:${newTab.viewId}) — ${owner}:${viewId} 가 덮는다`);
    }
    newTab = { owner, viewId, label };
    emitContrib();
    return { dispose() { if (newTab?.owner === owner && newTab.viewId === viewId) { newTab = null; emitContrib(); } } };
}
export function getNewTab(): NewTabContribution | null { return newTab; }

// ── ③ 상태바 스토어 ──
export interface StatusEntry extends StatusContribution { owner: string; seq: number }
let statusSeq = 0;
const statusItems = new Map<string, StatusEntry>();   // key: owner \0 id
let statusCache: StatusEntry[] | null = null;
const statusListeners = new Set<() => void>();
function emitStatus(): void { statusCache = null; for (const l of statusListeners) l(); }

export function addStatusItem(owner: string, item: StatusContribution): Disposable {
    const key = `${owner}\u0000${item.id}`;
    const prev = statusItems.get(key);
    statusItems.set(key, { ...item, owner, seq: prev ? prev.seq : statusSeq++ });
    emitStatus();
    return { dispose() { if (statusItems.delete(key)) emitStatus(); } };
}

function statusSnapshot(): StatusEntry[] {
    if (!statusCache) statusCache = [...statusItems.values()].sort((a, b) => a.seq - b.seq);
    return statusCache;
}
function subscribeStatus(l: () => void): () => void { statusListeners.add(l); return () => { statusListeners.delete(l); }; }
/** React 구독 — 상태바 항목(또는 작업대 변화로 인한 다시 그림). */
export function useStatusItems(): StatusEntry[] {
    return useSyncExternalStore(subscribeStatus, statusSnapshot, statusSnapshot);
}
/** 비(非)React 조회 — 지금 등록된 상태바 항목(등록 순). listSettings·listCommands 와 대칭. */
export function listStatusItems(): StatusEntry[] {
    return statusSnapshot();
}

// ── ④ 작업대 다리 ──
export interface WorkspaceBridge {
    open(viewId: string, o?: WorkspaceOpenOptions): string | null;
    close(leafId: string): void;
    setTitle(leafId: string, title: string): void;
    /** 탭 글자 아이콘(노드 머리가 고른 이모지) — 없으면 뷰 기본 아이콘으로 돌아간다 */
    setGlyph?(leafId: string, glyph: string | undefined): void;
}
let bridge: WorkspaceBridge | null = null;
// 🔴 다리가 서기를 기다리는 일감. activateAll 은 React 렌더보다 먼저 돈다(main.tsx) — 그때는 다리가 없고,
//    거기서 workspace.open 을 부르면 조용히 null 만 주고 사라진다. 그래서 「서면 돌린다」를 따로 둔다.
const bridgeWaiters: (() => void)[] = [];
export function setWorkspaceBridge(b: WorkspaceBridge | null): void {
    bridge = b;
    if (!b || bridgeWaiters.length === 0) return;
    // ⛔ 큐를 먼저 비우고 돈다 — 콜백 안에서 또 등록해도 이번 판에 섞이지 않는다.
    const pending = bridgeWaiters.splice(0);
    for (const fn of pending) {
        try { fn(); } catch (e) { console.error('[plugin] 작업대 대기 일감 실패', e); }
    }
}
export function getWorkspaceBridge(): WorkspaceBridge | null { return bridge; }
/** 탭 제목 바꾸기 — host.workspace.setTitle 과 노드 머리(nodes.Header)가 같이 쓴다. 다리가 없으면 조용히 건너뛴다. */
export function setLeafTitle(leafId: string, title: string): void { bridge?.setTitle(leafId, title); }
/** 탭 아이콘 바꾸기 — 노드 머리(nodes.Header)가 쓴다. 제목(setLeafTitle)과 같은 자리에서 같이 부른다. */
export function setLeafGlyph(leafId: string, glyph: string | undefined): void { bridge?.setGlyph?.(leafId, glyph); }
/** 다리가 이미 서 있으면 지금, 아니면 설 때 한 번 돌린다. */
export function whenWorkspaceReady(fn: () => void): void {
    if (bridge) { fn(); return; }
    bridgeWaiters.push(fn);
}

// ── ⑤ 작업대 이벤트 ──
const wsListeners: { owner: string; ev: WorkspaceEvent; fn: (leaf: WorkspaceLeafInfo) => void }[] = [];

export function onWorkspace(owner: string, ev: WorkspaceEvent, fn: (leaf: WorkspaceLeafInfo) => void): Disposable {
    const entry = { owner, ev, fn };
    wsListeners.push(entry);
    return { dispose() { const i = wsListeners.indexOf(entry); if (i >= 0) wsListeners.splice(i, 1); } };
}

/**
 * 작업대 이벤트를 쏜다 — Workbench 가 트리 변화를 재서 부른다.
 * 🔴 리스너를 돌린 뒤 상태바를 다시 그린다 — 상태바는 흔히 작업대를 비추니(열린 탭 N 등),
 *    플러그인이 제 카운트를 갱신한 직후 바가 새로 그려지게 한다.
 */
export function fireWorkspace(ev: WorkspaceEvent, leaf: WorkspaceLeafInfo): void {
    for (const e of wsListeners) if (e.ev === ev) { try { e.fn(leaf); } catch { /* 하나가 던져도 나머지는 */ } }
    emitStatus();
}
