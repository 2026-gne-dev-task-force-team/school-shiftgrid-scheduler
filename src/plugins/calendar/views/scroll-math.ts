/**
 * scroll-math — 가상 스크롤의 「어느 offset 을 맨 위/왼쪽에 둘까」 + 「값(Date) → offset」 순수 계산. 🔴 React 0 · DOM 0.
 *   달력 네 뷰(연·월·시간축·간트)가 하나의 anchor(Date) 를 쓰게 올리면서, 「날짜 ↔ 스크롤 위치」 변환을 여기 한 곳에 모은다.
 *   쥔님 2026-11-01 21:47: *"월이 왜 계속 2024년에 가가있노 … 다른 뷰도 다 다른데로 가가 있네"* —
 *   뷰마다 제 날짜를 쥐던 걸 탭으로 끌어올리고, 각 뷰는 이 함수로 「받은 날짜」를 스크롤 위치로 번역한다.
 *
 * ⭐ 날짜 산수 바닥은 창틀 부품(primitives/date-grid)과 한 벌 — 사본을 두지 않는다.
 */
import { startOfWeek, weeksBetween } from '../../../pane-ui-system';
import { daysBetween } from './time-grid';

/**
 * offset 을 맨 위/왼쪽에 두기 위한 스크롤 위치(px) — (offset − 깔린 범위의 시작) × 한 칸 크기.
 *   🔴 `- rangeFrom` 을 빼먹으면 늘 깔린 범위의 맨 앞(= 2년 전 과거)으로 튄다 — 그게 「2024년에 가 있던」 버그였다.
 */
export function offsetToScroll(offset: number, rangeFrom: number, size: number): number {
    return (offset - rangeFrom) * size;
}

/** anchor 주(weekStart 기준)에서 target 이 든 주가 몇 주 떨어졌나 — 세로 달력(월 보기)의 offset. */
export function weekOffsetBetween(anchor: Date, target: Date, weekStart = 0): number {
    return weeksBetween(startOfWeek(anchor, weekStart), startOfWeek(target, weekStart));
}

/** anchor 날(자정)에서 target 이 며칠 떨어졌나 — 가로 달력(시간축·간트)의 offset. */
export function dayOffsetBetween(anchor: Date, target: Date): number {
    return daysBetween(anchor, target);
}
