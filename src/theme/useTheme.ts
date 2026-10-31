/**
 * useTheme — 테마 설정을 쥐고, 바뀔 때마다 적용하고 기기에 보관한다.
 * mode: 'system' 이면 시스템 밝기 변화를 구독해 따라 바뀐다.
 */
import { useCallback, useEffect, useState } from 'react';
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

export function useTheme(): ThemeControls {
    const [settings, setState] = useState<ThemeSettings>(loadThemeSettings);

    // 바뀌면 적용 + 보관 (첫 mount 에도 돈다 — 저장값을 그대로 꽂는다)
    useEffect(() => {
        applyTheme(settings);
        saveThemeSettings(settings);
    }, [settings]);

    // 시스템 밝기 구독 — mode 가 system 일 때만
    useEffect(() => {
        if (settings.mode !== 'system') return;
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const h = () => applyTheme(settings);
        mq.addEventListener('change', h);
        return () => mq.removeEventListener('change', h);
    }, [settings]);

    const setSettings = useCallback((patch: Partial<ThemeSettings>) => {
        setState((s) => normalizeThemeSettings({ ...s, ...patch }));
    }, []);

    const reset = useCallback(() => setState(defaultThemeSettings()), []);

    return { settings, setSettings, reset };
}
