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
}

/** 뷰별 레이아웃 덮어쓰기 — 키는 viewId(뜻은 모름), 값은 ViewLayout 의 일부 */
export type ViewOverrides = Record<string, Partial<ViewLayout>>;

const DEFAULTS: PaneSettings = {
    sidebarWidth: 240,
    sidebarMinWidth: 150,
    sidebarMaxWidth: 520,
    autoClose: true,
    tabMinWidth: 96,
    tabMaxWidth: 200,
    narrowWidth: 860,
    showTitleBar: true,
    showStatusBar: true,
    statusBarNarrow: false,
};

export function defaultPaneSettings(): PaneSettings {
    return { ...DEFAULTS };
}

export const paneKey = () => storageKey('pane');
export const viewOverrideKey = () => storageKey('view-overrides');

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

// ─────────────────────────── 외부 스토어 ───────────────────────────
// 🔴 한 곳에서 쥐고 바뀌면 전부(클램프·EditorArea 접힘·설정창)가 같이 다시 그린다.

interface Store { settings: PaneSettings; overrides: ViewOverrides; }
let store: Store | null = null;
const listeners = new Set<() => void>();

function ensure(): Store {
    if (!store) store = { settings: loadPaneSettings(), overrides: loadViewOverrides() };
    return store;
}
function emit(): void { for (const l of listeners) l(); }

function subscribePane(l: () => void): () => void { listeners.add(l); return () => { listeners.delete(l); }; }
function paneSnapshot(): Store { return ensure(); }

export function setPaneSettings(patch: Partial<PaneSettings>): void {
    const s = ensure();
    const settings = normalizePaneSettings({ ...s.settings, ...patch });
    store = { settings, overrides: s.overrides };
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
    store = { settings: s.settings, overrides };
    saveViewOverrides(overrides);
    emit();
}

export function resetPaneSettings(): void {
    store = { settings: defaultPaneSettings(), overrides: {} };
    savePaneSettings(store.settings);
    saveViewOverrides(store.overrides);
    emit();
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
