/**
 * useTheme — 테마 설정을 쥐고, 바뀔 때마다 적용하고 기기에 보관한다.
 * mode: 'system' 이면 시스템 밝기 변화를 구독해 따라 바뀐다.
 *
 * 🔴 상태는 모듈 하나에 산다(외부 스토어) — ⛔ 컴포넌트마다 useState 로 제 사본을 들지 않는다.
 *    2026-11-01 13:1x 쥔님 지적 *"시스템 따라 밝기가 안 변경되는 것 같아"* 의 뿌리: Workbench 와 설정 「모양」 판이
 *    각자 useTheme() 를 불러 **사본 둘**이 생겼고, 판에서 바꾼 테마를 Workbench 사본은 몰랐다 → 시스템 밝기가 바뀌면
 *    Workbench 의 낡은 사본이 applyTheme 를 다시 불러 **판에서 고른 것을 되돌렸다**. 사본이 하나면 이 경합이 없다.
 * 🔴 시스템 밝기 구독은 모듈이 **한 번만** 건다(마운트 횟수와 무관) — mode 가 system 일 때만 다시 적용한다.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { applyTheme } from './apply';
import {
    defaultThemeSettings, loadThemeSettings, normalizeThemeSettings, saveThemeSettings,
    type ThemeSettings,
} from './settings';

export interface ThemeControls {
    settings: ThemeSettings;
    /** 일부 칸만 바꾼다 — 받아들이기(normalize)를 한 번 더 거친다 */
    setSettings: (patch: Partial<ThemeSettings>) => void;
    /** 전부 기본값으로 */
    reset: () => void;
}

// ── 모듈 단일 스토어 ──
let current: ThemeSettings = loadThemeSettings();
const listeners = new Set<() => void>();

function commit(next: ThemeSettings): void {
    current = next;
    applyTheme(current);
    saveThemeSettings(current);
    for (const l of listeners) l();
}

/** 바깥(설정 판·플러그인)이 직접 읽을 때 */
export function getThemeSettings(): ThemeSettings { return current; }
export function setThemeSettings(patch: Partial<ThemeSettings>): void {
    commit(normalizeThemeSettings({ ...current, ...patch }));
}
export function resetThemeSettings(): void { commit(defaultThemeSettings()); }

// 시스템 밝기 구독 — 모듈이 한 번만. 값이 바뀌면 mode:'system' 일 때만 다시 적용(저장값은 그대로)
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (current.mode === 'system') applyTheme(current); };
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onChange);
    else (mq as MediaQueryList & { addListener?: (cb: () => void) => void }).addListener?.(onChange);
}

function subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}

export function useTheme(): ThemeControls {
    const settings = useSyncExternalStore(subscribe, getThemeSettings, getThemeSettings);
    const setSettings = useCallback((patch: Partial<ThemeSettings>) => setThemeSettings(patch), []);
    const reset = useCallback(() => resetThemeSettings(), []);
    return { settings, setSettings, reset };
}
