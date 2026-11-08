/**
 * 🔴 인터페이스 「clock」 0.1.0 — 교시 ↔ 실제 시각 · 급식 교대 · 학년별 하교.
 *   ⭐ 벽시계 모델: 학년마다 점심이 어긋나서 「4교시」의 실제 시각이 학년마다 다르다. 충돌은 시각으로 판정한다.
 *      (선생님 시간표 생성기와 보결 GAS 가 독립적으로 같은 답에 왔다 — [[김은지 선생님 코드 요구 해부]] 5-2)
 *   ⭐ 급식 교대는 **시각 구간**으로 낸다 — 「교사 식사용 빈 칸 1개 이상」 하드 제약·보결 「급식지도 중」 제외가 이걸 쓴다.
 *   소비자: host.modules.use<Clock>('clock'). ⛔ 값 0.
 */
import type { Weekday, Minute, TimeRange, PeriodRef, Subscribe } from './common';

/** 교시 하나의 실제 시각. */
export interface PeriodSlot {
    period: number;
    range: TimeRange;
}

/** 급식 교대 한 줄 — 「1교대: 3·4학년 11:30–12:10」. */
export interface LunchShift {
    id: string;
    name: string;
    range: TimeRange;
    grades: number[];
}

export interface Clock {
    /** 수업하는 요일(오름차순). */
    days(): Weekday[];
    /** 그 학년 그 요일의 교시들(시각순). 수업이 없는 날이면 빈 배열. */
    periods(grade: number, day: Weekday): readonly PeriodSlot[];
    /** 그 학년 그 요일 교시 하나의 시각. 없는 교시면 null. */
    rangeOf(grade: number, ref: PeriodRef): TimeRange | null;
    /** 그 시각에 그 학년이 몇 교시인가 — 쉬는 시간·점심·하교 뒤면 null. */
    periodAt(grade: number, day: Weekday, at: Minute): number | null;
    /** 급식 교대 전부. 통일 급식이면 하나. */
    lunchShifts(): readonly LunchShift[];
    /** 그 학년의 점심 시각(요일마다 같다고 본다 — 1차). 교대에 안 묶였으면 null. */
    lunchOf(grade: number): TimeRange | null;
    /** 그 학년 그 요일 하교 시각 = 마지막 교시 끝. 수업 없으면 null. */
    dismissalOf(grade: number, day: Weekday): Minute | null;
    /** 두 구간이 겹치나([start,end) 기준 — 맞닿기만 하면 안 겹친다). */
    overlaps(a: TimeRange, b: TimeRange): boolean;
    onChange: Subscribe;
}
