/**
 * 테마 — 밝은 화면 / 어두운 화면. 값은 CSS 변수(src/index.css 의 html[data-theme])가 갖고,
 * 여기서는 어느 테마인지만 정하고 <html data-theme> 와 <meta name="theme-color"> 를 맞춘다.
 *   · 저장: localStorage['shiftgrid.theme'] (없으면 밝음)
 *   · main.tsx 가 첫 그리기 전에 applyTheme(getTheme()) 를 불러 깜빡임을 막는다.
 */
export type Theme = 'light' | 'dark';

const KEY = 'shiftgrid.theme';

/** 두 테마의 배경색 — 상태 표시줄(<meta theme-color>)·PWA 매니페스트와 같은 값 */
export const THEME_COLOR: Record<Theme, string> = { light: '#f4f6f9', dark: '#10151c' };

export function getTheme(): Theme {
    try {
        const v = localStorage.getItem(KEY);
        if (v === 'light' || v === 'dark') return v;
    } catch { /* 저장소를 못 읽어도 기본값으로 간다 */ }
    return 'light';
}

export function applyTheme(theme: Theme): void {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLOR[theme]);
}

export function setTheme(theme: Theme): void {
    try { localStorage.setItem(KEY, theme); } catch { /* 저장 실패는 조용히 */ }
    applyTheme(theme);
}

export function toggleTheme(): Theme {
    const next: Theme = getTheme() === 'light' ? 'dark' : 'light';
    setTheme(next);
    return next;
}
