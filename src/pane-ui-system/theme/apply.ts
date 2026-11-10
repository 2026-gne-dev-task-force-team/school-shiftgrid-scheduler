/**
 * applyTheme — 설정 하나를 받아 document.documentElement 에 꽂는다.
 *
 * ⛔ 컴포넌트는 한 줄도 안 바뀐다 — 색은 전부 --c-* 변수, 치수는 --density 배율로만 간다.
 * 🔴 색은 인라인 --c-* 로 "덮어" 쓴다(고른 테마 프리셋의 팔레트 + custom).
 * 🔴 밀도는 --density 하나만 꽂는다 — ⛔ --s-* 를 직접 꽂지 않는다(index.css 주석 참조:
 *    인라인이 손가락 바닥 media 를 이겨 깨뜨린다).
 */
import type { CSSProperties } from 'react';
import {
    COLOR_TOKENS, findTheme, presetForMode, densityScale, fontScale,
    type Palette,
} from './tokens';
import type { ThemeMode, ThemeSettings } from './settings';
import { indentPx } from './settings';

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

/** 지금 설정으로 쓸 실제 색 — 고른 테마(+모드 짝) 팔레트에 custom 을 덮는다 */
function resolvedColors(s: ThemeSettings, resolved: ResolvedMode): { colors: Palette; scheme: ResolvedMode } {
    const preset = presetForMode(s.theme, resolved);
    const out = { ...preset.palette } as Palette;
    if (s.custom) {
        for (const t of COLOR_TOKENS) {
            const v = s.custom[t];
            if (v) out[t] = v;
        }
    }
    return { colors: out, scheme: preset.base };
}

/** 지금 설정으로 실제 쓰이는 색 한 벌 — 고른 테마(+모드 짝) 팔레트 위에 custom 을 덮은 결과. 편집 화면이 현재값으로 읽는다 */
export function effectiveColors(s: ThemeSettings): Palette {
    return resolvedColors(s, resolveMode(s.mode)).colors;
}

/**
 * 테마가 적용될 때마다 알림 — 플러그인 host.theme.on 이 이걸 구독한다(밝기가 바뀌면 깨운다).
 * 🔴 설정 화면이 테마를 바꾸거나 시스템 밝기가 바뀌면 applyTheme 가 다시 돌고, 여기서 리스너를 부른다.
 */
type ThemeAppliedListener = (mode: ResolvedMode) => void;
const themeListeners = new Set<ThemeAppliedListener>();
export function onThemeApplied(fn: ThemeAppliedListener): () => void {
    themeListeners.add(fn);
    return () => { themeListeners.delete(fn); };
}

export function applyTheme(s: ThemeSettings): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const resolved = resolveMode(s.mode);
    const { colors, scheme } = resolvedColors(s, resolved);
    for (const t of COLOR_TOKENS) {
        root.style.setProperty(`--c-${t}`, colors[t]);
    }
    root.style.setProperty('--density', String(densityScale(s.density)));
    root.style.setProperty('--fs-scale', String(fontScale(s.fontSize)));
    root.style.setProperty('--indent-step', `${indentPx(s.indent)}px`);
    root.dataset.density = s.density;   // 하단 바가 「빽빽일 때만 좁게」를 CSS 로 가른다
    // 브라우저 기본 UI(스크롤바·폼)도 실제 테마 밝기를 따르게 — 단일 테마(nord 등)는 그 테마의 밝기다
    root.style.colorScheme = scheme;
    root.dataset.theme = scheme;
    for (const l of themeListeners) l(resolved);
}

/**
 * 테마 견본(swatch) 용 색 — 설정 「모양」의 네모가 쓴다.
 * 🔴 features/ 쪽은 하드코딩 색 검사가 "rgb(" 글자를 막는다 — 그래서 그 글자를 품는 이 헬퍼를
 *    검사 밖(theme/)에 두고, 설정 화면은 이 함수만 부른다.
 */
export function themeSwatchStyle(themeId: string): { bg: CSSProperties; panel: CSSProperties; accent: CSSProperties; text: CSSProperties; border: string } {
    const p = findTheme(themeId).palette;
    return {
        bg: { backgroundColor: `rgb(${p.bg})` },
        panel: { backgroundColor: `rgb(${p.panel})` },
        accent: { backgroundColor: `rgb(${p.accent})` },
        text: { backgroundColor: `rgb(${p.text})` },
        border: `rgb(${p.line})`,
    };
}
