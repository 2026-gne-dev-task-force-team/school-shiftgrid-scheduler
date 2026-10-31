/**
 * 옆 패널(탐색기·속성)의 폭과 접힘 — 순수 계산 + 기기별 보관.
 *
 * 🔴 기기별 localStorage 에 둔다(프로젝트 파일에 안 넣는다). 화면 크기는 기기의 성질이지
 *    자료의 성질이 아니다 — 폰에서 접어 둔 것이 학교 PC 로 따라가면 안 된다.
 *    (같은 결: 연표 뷰가 보기 설정을 기기별 localStorage 에 두는 것)
 */

export const MIN_PANEL = 150;
export const MAX_PANEL = 520;
export const DEFAULT_LEFT = 224;  // 옛 w-56
export const DEFAULT_RIGHT = 288; // 옛 w-72

/** 접었을 때 남기는 레일 폭(px) — 넓은 화면에서만 그린다 */
export const RAIL = 28;

/** 이 폭 아래는 「좁은 화면」 — 두 패널이 자리를 비집고 들어오면 가운데가 죽는다(224+288=512px) */
export const NARROW_PX = 860;

export interface PanelState {
    leftW: number;
    rightW: number;
    leftOpen: boolean;
    rightOpen: boolean;
}

export const PANELS_KEY = 'shiftgrid.v2.panels';

export function defaultPanels(): PanelState {
    return { leftW: DEFAULT_LEFT, rightW: DEFAULT_RIGHT, leftOpen: true, rightOpen: true };
}

export function clampWidth(n: number): number {
    if (!Number.isFinite(n)) return DEFAULT_LEFT;
    return Math.round(Math.max(MIN_PANEL, Math.min(MAX_PANEL, n)));
}

/** 저장된 값을 안전하게 받아들인다 — 모양이 틀렸으면 그 칸만 기본값으로 */
export function normalizePanels(raw: unknown): PanelState {
    const d = defaultPanels();
    if (!raw || typeof raw !== 'object') return d;
    const o = raw as Record<string, unknown>;
    return {
        leftW: typeof o.leftW === 'number' ? clampWidth(o.leftW) : d.leftW,
        rightW: typeof o.rightW === 'number' ? clampWidth(o.rightW) : d.rightW,
        leftOpen: typeof o.leftOpen === 'boolean' ? o.leftOpen : d.leftOpen,
        rightOpen: typeof o.rightOpen === 'boolean' ? o.rightOpen : d.rightOpen,
    };
}

export function loadPanels(): PanelState {
    try {
        if (typeof localStorage === 'undefined') return defaultPanels();
        const s = localStorage.getItem(PANELS_KEY);
        if (!s) return defaultPanels();
        return normalizePanels(JSON.parse(s));
    } catch { return defaultPanels(); }
}

export function savePanels(s: PanelState): void {
    try {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(PANELS_KEY, JSON.stringify(s));
    } catch { /* 조용히 */ }
}

/**
 * 끄는 동안의 새 폭 — 손잡이를 잡고 움직인 거리로 센다.
 * 왼쪽 패널은 오른쪽으로 끌면 넓어지고, 오른쪽 패널은 그 반대다.
 */
export function widthFromDrag(side: 'left' | 'right', startW: number, dx: number): number {
    return clampWidth(side === 'left' ? startW + dx : startW - dx);
}

/** 좁은 화면에서는 서랍이 한 번에 하나만 열린다 — 하나를 열면 다른 쪽은 닫는다 */
export function openOne(s: PanelState, side: 'left' | 'right', open: boolean): PanelState {
    if (side === 'left') return { ...s, leftOpen: open, rightOpen: open ? false : s.rightOpen };
    return { ...s, rightOpen: open, leftOpen: open ? false : s.leftOpen };
}
