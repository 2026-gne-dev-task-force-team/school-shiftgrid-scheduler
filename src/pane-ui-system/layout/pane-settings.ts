/**
 * 창틀 설정 — 설정창의 「창틀」·「뷰」 섹션이 바꾸는 값. 기기별 localStorage.
 *
 * 🔴 ⛔ 도메인 낱말·뷰 id 의 뜻을 모른다 — 뷰 덮어쓰기는 id 를 "키" 로만 들고, 뜻은 등록소가 안다.
 * 🔴 상수(최소 150 등)의 단일 원본이 여기다 — clamp 는 숫자를 모르고 여기서 받아 쓴다(쥔님: "코드에 박지 말고 창구를").
 * 🔴 ⛔ localStorage 를 import 시점에 읽지 않는다 — 앱이 setStoragePrefix 를 부르기 전이라 키가 'pane-ui-system.*' 로 굳는다.
 *    외부 스토어는 첫 구독·조회 때 늦게 읽는다(ensure).
 *
 * 받아들이기(normalize)는 panels.ts·theme/settings.ts 와 같은 태도 — 모양 틀린 "그 칸만" 기본값으로.
 */
import { useSyncExternalStore } from 'react';
import { storageKey } from '../storage';
import { getView } from '../view-registry';
import { mergeLayout, type ViewLayout, type Squeeze } from './clamp';

export interface PaneSettings {
    /** 사이드바 기본 폭(px) */
    sidebarWidth: number;
    /** 사이드바가 못 내려가는 최소 폭(px) — 그 안 뷰 힌트가 더 크면 뷰가 이긴다 */
    sidebarMinWidth: number;
    /** 사이드바 최대 폭(px) */
    sidebarMaxWidth: number;
    /** 덮는 서랍(고정 풀림)에서 바깥을 누르면 자동으로 접나 */
    autoClose: boolean;
    /** 탭 한 칸 최소/최대 폭(px) */
    tabMinWidth: number;
    tabMaxWidth: number;
    /** 이 폭 아래는 좁은 화면(붙박이 대신 서랍) */
    narrowWidth: number;
    /** 🔴 틀 두 줄 보이기(판 A) — 상단 타이틀바 · 하단 상태바. 기기별 저장(화면의 성질) */
    showTitleBar: boolean;
    showStatusBar: boolean;
    /**
     * 🔴 좁은 화면 상태바(판 A) — ⛔ 좁은 화면은 설정값(showStatusBar)과 별개로 기본 숨김이다(쥔님).
     *    기본 false, 켜면 좁은 화면에도 뜬다(그때 하단 플로팅 바와 안 겹치게 바 마진을 올린다).
     */
    statusBarNarrow: boolean;
    /**
     * 🔴 리본 자리 — 'left'(기본, 옵시디언식 세로 띠) · 'top'(엑셀식 가로 줄 — 상단에 선다).
     *    쥔님 2026-11-01 13:39: *"엑셀 쓰는 사람들은 아이콘이 상단 앱바에 있는 게 익숙할 수도 — 옵션으로"*
     */
    ribbonPosition: 'left' | 'top';
    /** 🔴 앱을 켤 때마다 띄워 둘 뷰 id(쥔님 2026-11-09). 닫아 뒀어도 다음 시작에 다시 연다 · 빈 배열 = 저장된 배치 그대로 */
    startupViews: string[];
}

/** 뷰별 레이아웃 덮어쓰기 — 키는 viewId(뜻은 모름), 값은 ViewLayout 의 일부 */
export type ViewOverrides = Record<string, Partial<ViewLayout>>;

/**
 * 리본(왼쪽 아이콘 띠) 기기별 배치 — order 는 아이콘 세운 순서, hidden 은 끈 것(W8).
 * 🔴 ⛔ 창틀은 이게 무슨 아이콘인지 모른다 — id 를 "키" 로만 들고, 등록소가 뜻을 안다.
 *    order 에는 "지금 등록된 것만" 들 필요가 없다(옛 id 가 남아 있어도 resolveRibbon 이 걸러 준다).
 */
export interface Ribbon {
    /** 사용자가 끌어 바꾼 순서 — 여기 없는 등록 뷰는 등록 순서대로 뒤에 붙는다 */
    order: string[];
    /** 끈 아이콘 id — 리본에서 빠지되 "숨긴 아이콘" 으로 되살릴 수 있다 */
    hidden: string[];
}

const DEFAULTS: PaneSettings = {
    sidebarWidth: 240,
    sidebarMinWidth: 150,
    sidebarMaxWidth: 520,
    autoClose: true,
    tabMinWidth: 96,
    tabMaxWidth: 200,
    narrowWidth: 860,
    // 🔴 상단 타이틀바는 기본 꺼짐(쥔님 2026-11-01 ⑥ *"상단에 … 바는 없애도록 하자"*). ⛔ 코드는 안 지운다 —
    //    설정 「창틀 > 상단 바 보이기」에서 켤 수 있다. 모바일 얇은 제목줄은 이 값과 무관하게 그대로.
    showTitleBar: false,
    showStatusBar: true,
    statusBarNarrow: false,
    ribbonPosition: 'left',
    startupViews: [],
};

export function defaultPaneSettings(): PaneSettings {
    return { ...DEFAULTS, startupViews: [] };
}

export const paneKey = () => storageKey('pane');
export const viewOverrideKey = () => storageKey('view-overrides');
export const ribbonKey = () => storageKey('ribbon');

export function defaultRibbon(): Ribbon {
    return { order: [], hidden: [] };
}

// ─────────────────────────── 받아들이기 ───────────────────────────

function num(v: unknown, d: number, lo = 1, hi = 100000): number {
    return typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.max(lo, Math.min(hi, v))) : d;
}

export function normalizePaneSettings(raw: unknown): PaneSettings {
    const d = defaultPaneSettings();
    if (!raw || typeof raw !== 'object') return d;
    const o = raw as Record<string, unknown>;
    return {
        sidebarWidth: num(o.sidebarWidth, d.sidebarWidth),
        sidebarMinWidth: num(o.sidebarMinWidth, d.sidebarMinWidth),
        sidebarMaxWidth: num(o.sidebarMaxWidth, d.sidebarMaxWidth),
        autoClose: typeof o.autoClose === 'boolean' ? o.autoClose : d.autoClose,
        tabMinWidth: num(o.tabMinWidth, d.tabMinWidth),
        tabMaxWidth: num(o.tabMaxWidth, d.tabMaxWidth),
        narrowWidth: num(o.narrowWidth, d.narrowWidth),
        showTitleBar: typeof o.showTitleBar === 'boolean' ? o.showTitleBar : d.showTitleBar,
        showStatusBar: typeof o.showStatusBar === 'boolean' ? o.showStatusBar : d.showStatusBar,
        statusBarNarrow: typeof o.statusBarNarrow === 'boolean' ? o.statusBarNarrow : d.statusBarNarrow,
        ribbonPosition: o.ribbonPosition === 'top' || o.ribbonPosition === 'left' ? o.ribbonPosition : d.ribbonPosition,
        startupViews: Array.isArray(o.startupViews) ? [...new Set(o.startupViews.filter((x): x is string => typeof x === 'string'))] : d.startupViews,
    };
}

const SQUEEZES: Squeeze[] = ['shrink', 'scroll', 'collapse'];

/** 뷰 덮어쓰기 하나를 성한 꼴로 — 아는 칸·성한 값만, 없으면 null */
function normLayoutPatch(raw: unknown): Partial<ViewLayout> | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const out: Partial<ViewLayout> = {};
    if (typeof o.minWidth === 'number' && Number.isFinite(o.minWidth)) out.minWidth = Math.round(Math.max(0, o.minWidth));
    if (typeof o.minHeight === 'number' && Number.isFinite(o.minHeight)) out.minHeight = Math.round(Math.max(0, o.minHeight));
    if (SQUEEZES.includes(o.squeeze as Squeeze)) out.squeeze = o.squeeze as Squeeze;
    if (typeof o.collapseBelow === 'number' && Number.isFinite(o.collapseBelow)) out.collapseBelow = Math.round(Math.max(0, o.collapseBelow));
    return Object.keys(out).length ? out : null;
}

export function normalizeViewOverrides(raw: unknown): ViewOverrides {
    if (!raw || typeof raw !== 'object') return {};
    const out: ViewOverrides = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        const p = normLayoutPatch(v);
        if (p) out[k] = p;
    }
    return out;
}

/** 문자열 배열만 추린다(중복 제거) — order·hidden 둘 다 "틀린 값은 그 칸만 기본([])" */
function strList(v: unknown): string[] {
    if (!Array.isArray(v)) return [];
    const out: string[] = [];
    for (const x of v) if (typeof x === 'string' && x && !out.includes(x)) out.push(x);
    return out;
}

export function normalizeRibbon(raw: unknown): Ribbon {
    if (!raw || typeof raw !== 'object') return defaultRibbon();
    const o = raw as Record<string, unknown>;
    return { order: strList(o.order), hidden: strList(o.hidden) };
}

/**
 * 저장된 리본 배치를 "지금 등록된 것" 에 적용한다(순수) — 세 단계(요구명세 W8):
 *   ① 등록 순서(base) 에서 출발 → ② 저장 order 가 가리키는 것부터 그 순서로, 나머지 등록분은 뒤에
 *      (저장 order 에 있지만 더는 등록 안 된 id 는 자동으로 빠진다) → ③ hidden 은 visible 에서 뺀다.
 * 🔴 base 가 진실의 원천이다 — 새로 등록된 뷰는 order 에 없어도 꼭 나온다(뒤에 붙는다).
 */
export function resolveRibbon<T extends { id: string }>(
    base: T[], ribbon: Ribbon,
): { ordered: T[]; visible: T[]; hidden: T[] } {
    const byId = new Map(base.map((b) => [b.id, b]));
    const seen = new Set<string>();
    const ordered: T[] = [];
    // ② 저장 order 가 가리키는 등록분부터
    for (const id of ribbon.order) {
        const b = byId.get(id);
        if (b && !seen.has(id)) { ordered.push(b); seen.add(id); }
    }
    // 나머지 등록분은 등록 순서대로 뒤에
    for (const b of base) {
        if (!seen.has(b.id)) { ordered.push(b); seen.add(b.id); }
    }
    const hiddenSet = new Set(ribbon.hidden);
    return {
        ordered,
        visible: ordered.filter((b) => !hiddenSet.has(b.id)),
        hidden: ordered.filter((b) => hiddenSet.has(b.id)),
    };
}

/** id 하나를 target 의 앞/뒤로 옮긴 새 순서 배열(순수) — 드래그 재배치가 쓴다 */
export function reorderIds(ids: string[], dragId: string, targetId: string, pos: 'before' | 'after'): string[] {
    if (dragId === targetId) return ids.slice();
    const rest = ids.filter((x) => x !== dragId);
    const at = rest.indexOf(targetId);
    if (at < 0) return ids.slice();
    const insertAt = pos === 'before' ? at : at + 1;
    return [...rest.slice(0, insertAt), dragId, ...rest.slice(insertAt)];
}

/** id 를 delta(−1 위/+1 아래) 만큼 민 새 순서 배열(순수) — 설정 표의 위/아래 단추가 쓴다 */
export function nudgeId(ids: string[], id: string, delta: -1 | 1): string[] {
    const i = ids.indexOf(id);
    if (i < 0) return ids.slice();
    const j = i + delta;
    if (j < 0 || j >= ids.length) return ids.slice();
    const out = ids.slice();
    [out[i], out[j]] = [out[j], out[i]];
    return out;
}

// ─────────────────────────── 보관 ───────────────────────────

function loadPaneSettings(): PaneSettings {
    try {
        if (typeof localStorage === 'undefined') return defaultPaneSettings();
        const s = localStorage.getItem(paneKey());
        return s ? normalizePaneSettings(JSON.parse(s)) : defaultPaneSettings();
    } catch { return defaultPaneSettings(); }
}
function savePaneSettings(s: PaneSettings): void {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(paneKey(), JSON.stringify(s)); } catch { /* 조용히 */ }
}
function loadViewOverrides(): ViewOverrides {
    try {
        if (typeof localStorage === 'undefined') return {};
        const s = localStorage.getItem(viewOverrideKey());
        return s ? normalizeViewOverrides(JSON.parse(s)) : {};
    } catch { return {}; }
}
function saveViewOverrides(o: ViewOverrides): void {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(viewOverrideKey(), JSON.stringify(o)); } catch { /* 조용히 */ }
}
function loadRibbon(): Ribbon {
    try {
        if (typeof localStorage === 'undefined') return defaultRibbon();
        const s = localStorage.getItem(ribbonKey());
        return s ? normalizeRibbon(JSON.parse(s)) : defaultRibbon();
    } catch { return defaultRibbon(); }
}
function saveRibbon(r: Ribbon): void {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(ribbonKey(), JSON.stringify(r)); } catch { /* 조용히 */ }
}

// ─────────────────────────── 외부 스토어 ───────────────────────────
// 🔴 한 곳에서 쥐고 바뀌면 전부(클램프·EditorArea 접힘·설정창)가 같이 다시 그린다.

interface Store { settings: PaneSettings; overrides: ViewOverrides; ribbon: Ribbon; }
let store: Store | null = null;
const listeners = new Set<() => void>();

function ensure(): Store {
    if (!store) store = { settings: loadPaneSettings(), overrides: loadViewOverrides(), ribbon: loadRibbon() };
    return store;
}
function emit(): void { for (const l of listeners) l(); }

function subscribePane(l: () => void): () => void { listeners.add(l); return () => { listeners.delete(l); }; }
function paneSnapshot(): Store { return ensure(); }

export function setPaneSettings(patch: Partial<PaneSettings>): void {
    const s = ensure();
    const settings = normalizePaneSettings({ ...s.settings, ...patch });
    store = { ...s, settings };
    savePaneSettings(settings);
    emit();
}

/** 한 뷰의 레이아웃 덮어쓰기 — patch=null 이면 덮어쓰기 자체를 지운다(등록값으로 돌아간다) */
export function setViewOverride(id: string, patch: Partial<ViewLayout> | null): void {
    const s = ensure();
    const overrides = { ...s.overrides };
    if (patch === null) {
        delete overrides[id];
    } else {
        const merged = normalizeViewOverrides({ [id]: { ...overrides[id], ...patch } })[id];
        if (merged) overrides[id] = merged; else delete overrides[id];
    }
    store = { ...s, overrides };
    saveViewOverrides(overrides);
    emit();
}

/** 뷰 덮어쓰기만 전부 지운다(등록값으로) — 설정 「등록된 뷰」 판의 「전부 되돌리기」가 쓴다. 다른 설정은 안 건드린다 */
export function resetViewOverrides(): void {
    const s = ensure();
    store = { ...s, overrides: {} };
    saveViewOverrides({});
    emit();
}

export function resetPaneSettings(): void {
    store = { settings: defaultPaneSettings(), overrides: {}, ribbon: defaultRibbon() };
    savePaneSettings(store.settings);
    saveViewOverrides(store.overrides);
    saveRibbon(store.ribbon);
    emit();
}

// ─────────────────────────── 리본 뮤테이터 ───────────────────────────

function setRibbon(r: Ribbon): void {
    const s = ensure();
    const ribbon = normalizeRibbon(r);
    store = { ...s, ribbon };
    saveRibbon(ribbon);
    emit();
}

/** 새 순서로 통째 바꾼다(드래그 드롭·설정 표의 위/아래가 만든 배열) */
export function setRibbonOrder(order: string[]): void {
    setRibbon({ ...ensure().ribbon, order });
}

/** 한 아이콘을 끄거나(hidden 에 넣고) 다시 켠다(hidden 에서 뺀다) */
export function toggleRibbonHidden(id: string, hide: boolean): void {
    const { order, hidden } = ensure().ribbon;
    const next = hidden.filter((h) => h !== id);
    if (hide) next.push(id);
    setRibbon({ order, hidden: next });
}

/** 기본(등록 순서·전부 보임)으로 되돌린다 */
export function resetRibbon(): void {
    setRibbon(defaultRibbon());
}

/** 지금 설정값 — React 밖(시작 때 한 번 읽기 등)에서 */
export function getPaneSettings(): PaneSettings {
    return ensure().settings;
}

export function getRibbon(): Ribbon {
    return ensure().ribbon;
}

export function getViewOverride(id: string): Partial<ViewLayout> | undefined {
    return ensure().overrides[id];
}

/** 등록값(기본) 위에 설정 덮어쓰기를 얹은, 지금 유효한 레이아웃 */
export function effectiveViewLayout(viewId: string): ViewLayout {
    return mergeLayout(getView(viewId)?.layout, getViewOverride(viewId));
}

/** React 구독 — 설정·덮어쓰기가 바뀌면 다시 그린다 */
export function usePaneSettings(): Store {
    return useSyncExternalStore(subscribePane, paneSnapshot, paneSnapshot);
}
