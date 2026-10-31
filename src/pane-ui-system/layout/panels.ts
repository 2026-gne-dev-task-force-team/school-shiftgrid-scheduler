/**
 * 레이아웃 상태 — 옆 패널의 폭·접힘·고정(📌).
 * 순수 계산 + 기기별 보관만 한다(도메인을 모른다).
 *
 * 🔴 기기별 localStorage 에 둔다(프로젝트 파일에 안 넣는다). 화면 크기·고정 여부는 기기의 성질이지
 *    자료의 성질이 아니다 — 폰에서 접어 둔 것이 사무실 PC 로 따라가면 안 된다.
 *
 * 📌 옛 leftSplit(사이드바 세로 분할 비율)은 뺐다 — 이제 사이드바도 패널 트리가 쥔다(W3).
 *    저장값에 leftSplit 이 남아 있어도 normalizePanels 가 조용히 버린다(그 칸을 안 읽는다).
 *
 * (출처: 옛 v2 `src/v2/panels.ts` — leftSplit 을 빼고 pinned 를 더했다.)
 */
import { storageKey } from '../storage';

export const MIN_PANEL = 150;
export const MAX_PANEL = 520;
export const DEFAULT_LEFT = 240;
export const DEFAULT_RIGHT = 280;

/** 접었을 때 남기는 레일 폭(px) — 넓은 화면에서만 그린다 */
export const RAIL = 28;

/** 이 폭 아래는 「좁은 화면」 — 두 패널이 자리를 비집고 들어오면 가운데가 죽는다 */
export const NARROW_PX = 860;

export interface PanelState {
    leftW: number;
    rightW: number;
    leftOpen: boolean;
    rightOpen: boolean;
    /** 고정(📌) — 풀리면 덮는 서랍처럼 뜨고 바깥을 누르면 자동으로 접힌다. 기본 true(붙박이) */
    leftPinned: boolean;
    rightPinned: boolean;
}

/** 🔴 앱 이름은 여기 안 박는다 — 접두사는 앱이 setStoragePrefix 로 알려 준다(storage.ts) */
/**
 * 🔴 ⛔ 상수로 굳히지 않는다 — 모듈을 import 하는 순간 값이 박혀서
 *    앱이 setStoragePrefix 를 부르기 전에 'pane-ui-system.*' 로 고정된다(실제로 그렇게 짰다가 잡았다).
 *    쓸 때마다 부른다. 이게 「먼저 읽히는 것」과 「나중에 설정되는 것」이 부딪히는 전형이다.
 */
export const layoutKey = () => storageKey('layout');

export function defaultPanels(): PanelState {
    return {
        leftW: DEFAULT_LEFT,
        rightW: DEFAULT_RIGHT,
        leftOpen: true,
        rightOpen: true,
        leftPinned: true,
        rightPinned: true,
    };
}

export function clampWidth(n: number): number {
    if (!Number.isFinite(n)) return DEFAULT_LEFT;
    return Math.round(Math.max(MIN_PANEL, Math.min(MAX_PANEL, n)));
}

/** 저장된 값을 안전하게 받아들인다 — 모양이 틀린 칸만 기본값으로 떨어뜨린다(모르는 칸은 버린다) */
export function normalizePanels(raw: unknown): PanelState {
    const d = defaultPanels();
    if (!raw || typeof raw !== 'object') return d;
    const o = raw as Record<string, unknown>;
    return {
        leftW: typeof o.leftW === 'number' ? clampWidth(o.leftW) : d.leftW,
        rightW: typeof o.rightW === 'number' ? clampWidth(o.rightW) : d.rightW,
        leftOpen: typeof o.leftOpen === 'boolean' ? o.leftOpen : d.leftOpen,
        rightOpen: typeof o.rightOpen === 'boolean' ? o.rightOpen : d.rightOpen,
        leftPinned: typeof o.leftPinned === 'boolean' ? o.leftPinned : d.leftPinned,
        rightPinned: typeof o.rightPinned === 'boolean' ? o.rightPinned : d.rightPinned,
    };
}

export function loadPanels(): PanelState {
    try {
        if (typeof localStorage === 'undefined') return defaultPanels();
        const s = localStorage.getItem(layoutKey());
        if (!s) return defaultPanels();
        return normalizePanels(JSON.parse(s));
    } catch { return defaultPanels(); }
}

export function savePanels(s: PanelState): void {
    try {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(layoutKey(), JSON.stringify(s));
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
