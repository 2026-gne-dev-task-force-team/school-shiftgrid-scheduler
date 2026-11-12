// 화면 밝기 선택 — 밝게 · 어둡게 · 기기 따라(기본). DOM 없이 시험할 수 있게 저장·판정만 따로 둔다.
export const THEME_KEY = 'board.theme'
export type Theme = 'light' | 'dark' | 'auto'
export const THEMES: readonly Theme[] = ['auto', 'light', 'dark']
export const THEME_LABEL: Record<Theme, string> = { auto: '기기 따라', light: '밝게', dark: '어둡게' }
type Store = Pick<Storage, 'getItem' | 'setItem'>

export const parseTheme = (v: string | null): Theme => (v === 'light' || v === 'dark' ? v : 'auto')
export const loadTheme = (s: Store): Theme => parseTheme(s.getItem(THEME_KEY))
export const saveTheme = (s: Store, t: Theme): void => s.setItem(THEME_KEY, t)
// 실제로 어두운 판이 쓰이는가 — auto 면 기기 설정(matchMedia)을 따른다. CSS 의 @media 와 같은 판정.
export const isDark = (t: Theme, systemDark: boolean): boolean => (t === 'auto' ? systemDark : t === 'dark')
