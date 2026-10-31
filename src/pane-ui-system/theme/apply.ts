/**
 * applyTheme — 설정 하나를 받아 document.documentElement 에 꽂는다.
 *
 * ⛔ 컴포넌트는 한 줄도 안 바뀐다 — 색은 전부 --c-* 변수, 치수는 --density 배율로만 간다.
 * 🔴 색은 인라인 --c-* 로 "덮어" 쓴다(resolved 모드의 값 + 강조색 프리셋 + custom).
 * 🔴 밀도는 --density 하나만 꽂는다 — ⛔ --s-* 를 직접 꽂지 않는다(index.css 주석 참조:
 *    인라인이 손가락 바닥 media 를 이겨 깨뜨린다).
 */
import type { CSSProperties } from 'react';
import {
    COLOR_TOKENS, COLOR_DEFS, findAccent, densityScale,
    type ColorToken, type AccentPreset,
} from './tokens';
import type { ThemeMode, ThemeSettings } from './settings';

export type ResolvedMode = 'light' | 'dark';

/** 시스템이 어둡게인가 */
export function prefersDark(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** mode: 'system' 이면 지금 시스템 설정을 읽어 실제 밝기로 떨어뜨린다 */
export function resolveMode(mode: ThemeMode): ResolvedMode {
    if (mode === 'light' || mode === 'dark') return mode;
    return prefersDark() ? 'dark' : 'light';
}

/** resolved 모드에서의 색 전체 값 — 기본 + 강조색 프리셋 + custom 순으로 덮는다 */
function resolvedColors(s: ThemeSettings, resolved: ResolvedMode): Record<ColorToken, string> {
    const accent: AccentPreset = findAccent(s.accent);
    const out = {} as Record<ColorToken, string>;
    for (const t of COLOR_TOKENS) out[t] = COLOR_DEFS[t][resolved];
    out.accent = accent[resolved].accent;
    out.accenth = accent[resolved].accenth;
    if (s.custom) {
        for (const t of COLOR_TOKENS) {
            const v = s.custom[t];
            if (v) out[t] = v;
        }
    }
    return out;
}

export function applyTheme(s: ThemeSettings): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const resolved = resolveMode(s.mode);
    const colors = resolvedColors(s, resolved);
    for (const t of COLOR_TOKENS) {
        root.style.setProperty(`--c-${t}`, colors[t]);
    }
    root.style.setProperty('--density', String(densityScale(s.density)));
    // 브라우저 기본 UI(스크롤바·폼)도 밝기를 따르게
    root.style.colorScheme = resolved;
    root.dataset.theme = resolved;
}

/**
 * 강조색 동그라미(swatch) 용 인라인 스타일.
 * 🔴 features/ 쪽은 하드코딩 색 검사가 "rgb(" 글자를 막는다 — 그래서 그 글자를 품는 이 헬퍼를
 *    검사 밖(theme/)에 두고, 설정 화면은 이 함수만 부른다.
 */
export function accentSwatchStyle(accentId: string, resolved: ResolvedMode): CSSProperties {
    const a = findAccent(accentId)[resolved].accent;
    return { backgroundColor: `rgb(${a})` };
}
