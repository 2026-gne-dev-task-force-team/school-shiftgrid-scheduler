// 서랍 열림 기억과 닫기 조건 — DOM 없이 시험할 수 있게 따로 둔다.
export const OPEN_KEY = 'board.open'
type Store = Pick<Storage, 'getItem' | 'setItem'>

export const loadOpen = (s: Store): boolean => s.getItem(OPEN_KEY) === '1'
export const saveOpen = (s: Store, on: boolean): void => s.setItem(OPEN_KEY, on ? '1' : '0')
// Esc 한 번에 하나만 닫는다 — ⋯ 메뉴가 열려 있으면 메뉴만, 아니면 서랍.
export const escTarget = (key: string, menuOpen: boolean, drawerOpen: boolean): 'menu' | 'drawer' | null =>
  key !== 'Escape' ? null : menuOpen ? 'menu' : drawerOpen ? 'drawer' : null
export const closesOnKey = (key: string, open: boolean): boolean => open && key === 'Escape'
