// 서랍 열림 기억과 닫기 조건 — DOM 없이 시험할 수 있게 따로 둔다.
export const OPEN_KEY = 'board.open'
type Store = Pick<Storage, 'getItem' | 'setItem'>

export const loadOpen = (s: Store): boolean => s.getItem(OPEN_KEY) === '1'
export const saveOpen = (s: Store, on: boolean): void => s.setItem(OPEN_KEY, on ? '1' : '0')
// Esc 한 번에 하나만 닫는다 — ⋯ 메뉴 → 상세(폰 시트 포함) → 서랍 차례.
export const escTarget = (key: string, menuOpen: boolean, detailOpen: boolean, drawerOpen: boolean): 'menu' | 'detail' | 'drawer' | null =>
  key !== 'Escape' ? null : menuOpen ? 'menu' : detailOpen ? 'detail' : drawerOpen ? 'drawer' : null
export const closesOnKey = (key: string, open: boolean): boolean => open && key === 'Escape'
// 첫 방문 서랍 — 저장값이 있으면 그대로. 없으면 단독 실행(1.2v)은 열고, 주입된 v1·v2 는 닫아 둔다.
export const seedOpen = (s: Store, injected: boolean): void => { if (s.getItem(OPEN_KEY) === null) saveOpen(s, !injected) }
