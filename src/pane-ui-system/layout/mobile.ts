/**
 * 좁은 화면 손짓·하단 바 배치 — 순수 계산만. DOM·React 0줄(검산이 쉽게, 그림과 따로 낡지 않게).
 *
 * 🔴 두 가지를 담는다:
 *   ① 가장자리 스와이프 판정 — 데드존(세로 스크롤과 안 싸우게)·방향 잠금·0..1 진행도·절반값 확정
 *   ② 하단 바 항목 가르기 — 가운데 스크롤 묶음과 오른쪽 고정(pinned) 묶음
 *
 * ⛔ 도메인(무엇을 여는 서랍인지)은 모른다 — 'left'|'right' 라는 「자리」만 안다.
 */

/** 가장자리에서 스와이프를 가로채는 띠 폭(px) — ⛔ 본문·시트와 겹치지 않게 좁게 */
export const SWIPE_EDGE = 20;
/** 방향을 잡기 전 죽은 구간(px) — 이만큼 움직이기 전엔 세로 스크롤인지 가로 스와이프인지 안 가른다 */
export const SWIPE_DEADZONE = 10;
/** 놓는 순간 열림/닫힘을 가르는 문턱(0..1) */
export const SWIPE_SNAP = 0.5;

export type SwipeAxis = 'none' | 'horizontal' | 'vertical';

/**
 * 이번 이동이 가로 스와이프인가 세로 스크롤인가.
 * 🔴 데드존을 넘기 전엔 'none'(아직 판정 안 함). 넘으면 더 큰 축으로 잡는다 —
 *    가로가 세로보다 확실히 클 때만 'horizontal'(안 그러면 세로 스크롤이 서랍에 먹힌다).
 */
export function classifySwipe(dx: number, dy: number, deadzone = SWIPE_DEADZONE): SwipeAxis {
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ax < deadzone && ay < deadzone) return 'none';
    return ax > ay ? 'horizontal' : 'vertical';
}

/** 가장자리 띠 안에서 시작했나 — 왼쪽/오른쪽 중 어느 서랍을 여는 스와이프인지(아니면 null) */
export function edgeStart(x: number, viewportW: number, band = SWIPE_EDGE): 'left' | 'right' | null {
    if (x <= band) return 'left';
    if (x >= viewportW - band) return 'right';
    return null;
}

/**
 * 끌린 거리를 0..1 진행도로. side·여는지/닫는지에 따라 부호가 다르다.
 *   열기: 왼쪽 서랍은 오른쪽(+dx)으로 끌면 열리고, 오른쪽 서랍은 왼쪽(-dx)으로.
 *   닫기: 열린 서랍을 바깥으로 끌면 1 에서 줄어든다.
 * 🔴 width<=0(아직 못 잼)이면 지금 상태를 지킨다 — 0 으로 나눠 NaN 이 되지 않게.
 */
export function swipeProgress(
    side: 'left' | 'right',
    opening: boolean,
    dx: number,
    width: number,
): number {
    if (!(width > 0)) return opening ? 0 : 1;
    const openSign = side === 'left' ? 1 : -1;   // 여는 방향의 부호
    const moved = (dx * openSign) / width;        // +면 여는 쪽, -면 닫는 쪽
    const base = opening ? 0 : 1;
    return clamp01(base + moved);
}

/**
 * 놓는 순간의 확정 — 진행도가 절반(문턱)을 넘었으면 열림.
 * 🔴 이 한 줄이 「절반값 판정」이다(버그 심기 검산 지점).
 */
export function settleOpen(progress: number, threshold = SWIPE_SNAP): boolean {
    return progress >= threshold;
}

function clamp01(n: number): number {
    if (!Number.isFinite(n)) return 0;
    return n < 0 ? 0 : n > 1 ? 1 : n;
}

// ─────────────────────────── 하단 바 항목 가르기 ───────────────────────────

/**
 * 하단 바 항목을 「가운데 스크롤」과 「오른쪽 고정」으로 가른다.
 *   - pinned 가 아닌 것은 가운데 스크롤 묶음으로(넘치면 가로로 스크롤)
 *   - pinned 는 오른쪽에 순서를 지킨 채 고정(스크롤 안 함) — 쥔님 *"오른쪽에 스크롤 안 하고 고정하는 버튼"*
 * ⭐ 제네릭이다 — 항목이 무엇을 들고 있든(아이콘·콜백) 이 계산은 모른다.
 */
export function splitBarItems<T extends { pinned?: boolean }>(items: T[]): { scroll: T[]; pinned: T[] } {
    const scroll: T[] = [];
    const pinned: T[] = [];
    for (const it of items) (it.pinned ? pinned : scroll).push(it);
    return { scroll, pinned };
}
