/**
 * 탭 드래그의 「어디에 떨어지나」 — 순수 기하 계산만. DOM·React 0줄(검산이 쉽게, 그림과 따로 낡지 않게).
 *
 * 🔴 두 가지만 담는다(DOM 더듬기·moveLeaf 번역은 DropZones 가 한다):
 *   ① paneZone  — 칸 몸통 안 포인터가 「가장자리 4방」인지 「가운데」인지. 바깥 BAND(기본 25%) 띠가 4방.
 *   ② tabDropSide — 탭 하나 위 포인터가 그 탭의 왼쪽 절반(before)인지 오른쪽 절반(after)인지.
 *
 * ⛔ 도메인은 모른다 · ⛔ 트리도 모른다 — 좌표와 사각형만 받는다.
 */

/** 칸 몸통 안 네 가장자리 띠의 폭(0..0.5). 이 띠 안이면 그쪽으로 가르기, 안쪽이면 가운데(탭으로) */
export const EDGE_BAND = 0.25;

export type PaneZone = 'left' | 'right' | 'up' | 'down' | 'center';

export interface Rect {
    left: number;
    top: number;
    width: number;
    height: number;
}

/**
 * 포인터가 칸 몸통의 어느 존인가.
 * 🔴 네 가장자리까지의 거리(0..1)를 재서 그중 가장 가까운 게 BAND 보다 안쪽이면 가운데,
 *    아니면 가장 가까운 가장자리 쪽. 모서리에서는 더 가까운 변이 이긴다(동률이면 좌·우·상·하 순).
 * ⚠️ 경계값: 거리가 정확히 BAND 면 「가운데」다(바깥 띠는 BAND '미만'). 테스트가 이 선을 집는다.
 */
export function paneZone(px: number, py: number, rect: Rect, band = EDGE_BAND): PaneZone {
    if (!(rect.width > 0) || !(rect.height > 0)) return 'center';
    const rx = (px - rect.left) / rect.width;    // 0(왼끝)..1(오른끝)
    const ry = (py - rect.top) / rect.height;    // 0(위끝)..1(아래끝)
    const dl = rx;          // 왼쪽 변까지
    const dr = 1 - rx;      // 오른쪽 변까지
    const dt = ry;          // 위 변까지
    const db = 1 - ry;      // 아래 변까지
    const min = Math.min(dl, dr, dt, db);
    if (min >= band) return 'center';
    if (min === dl) return 'left';
    if (min === dr) return 'right';
    if (min === dt) return 'up';
    return 'down';
}

/**
 * 탭 하나 위에서 「앞에 꽂나 뒤에 꽂나」 — 탭의 가운데 세로선 기준.
 * ⚠️ 경계값: 정확히 한가운데면 after(왼쪽 절반은 '미만').
 */
export function tabDropSide(px: number, rect: { left: number; width: number }): 'before' | 'after' {
    if (!(rect.width > 0)) return 'after';
    return px - rect.left < rect.width / 2 ? 'before' : 'after';
}
