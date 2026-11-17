/**
 * 요일 변환 한 쌍 — 엔진 dayIndex(0=월) ↔ 바깥 weekday(1=월). 약속 solver 의 toWeekday·toDayIndex 실체.
 *   엔진 안은 안 고친다(경계에서만 바꾼다 · 설계 3-1 맞출 틈).
 */
import type { SolverDayIndex, Weekday } from './contracts/solver';

export const toWeekday = (dayIndex: SolverDayIndex): Weekday => dayIndex + 1;
export const toDayIndex = (weekday: Weekday): SolverDayIndex => weekday - 1;
