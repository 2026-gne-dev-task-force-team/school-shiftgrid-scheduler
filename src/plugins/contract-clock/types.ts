/**
 * 🔴 약속 「clock」 0.1.0 — **얇은 약속**(쥔님 2026-11-08 16:28: *"clock 은 얇은 약속 — 행 시각을 내주는 창구"*).
 *   ⭐ 시각의 원본은 **시간표 그리드의 행 시각**이다(쥔님 16:03 *"클럭은 행 간 조정으로 설정할 수 있는 애"*).
 *      이 약속은 그 행 시각을 남에게 **내주는 창구**뿐이다 — ⛔ 교시·급식·하교 같은 학교 낱말은 걷었다(16:28 판정).
 *   ⭐ 공용 시각 낱말(Weekday·Minute·TimeRange·IsoDate)은 시각의 가장 아래 약속인 clock 이 갖는다 —
 *      timetable·absence 가 이걸 import 한다(⛔ 그래서 이 넷은 손대지 않는다: 바꾸면 그 둘이 깨진다).
 *   소비자: host.modules 로 clock 모듈을 받는다. ⛔ 값 0.
 */
import type { Disposable } from '../../pane-ui-system/plugin';

// ── 공용 시각 낱말 — 시각의 가장 아래 약속(clock)이 쥔다. ⛔ timetable·absence 가 기대니 손대지 않는다. ──

/** 요일 — 1=월 … 5=금(주 5일). 토·일은 여기 없다(그리드가 토를 쓸 땐 제 낱말로 넓힌다). */
export type Weekday = 1 | 2 | 3 | 4 | 5;

/** 하루 안의 시각 — 자정부터 센 분(08:50 = 530). */
export type Minute = number;

/** 시각 구간 — [start, end) · 분 단위(맞닿기만 하면 안 겹친다). */
export interface TimeRange {
    start: Minute;
    end: Minute;
}

/** 날짜 — 'YYYY-MM-DD'(현지 날짜 · 시간대 없음). */
export type IsoDate = string;

// ── 얇은 약속 — 행 시각을 내주는 창구 하나 ──

/** 행 하나의 시각 — 시간표 행 이름 + [start,end). 원본은 그리드의 행 시각이고, 이 약속은 그걸 내준다. */
export interface RowTime {
    /** 행 id(그리드 RowSpec.id 와 같다). */
    id: string;
    /** 사람이 지은 행 이름(빈 문자열 가능 — ⛔ 「1교시」를 박지 않는다). */
    name: string;
    range: TimeRange;
}

/**
 * clock — 행 시각을 남에게 내주는 창구. 🔴 얇다: 교시↔시각 변환·급식 교대·하교 같은 학교 개념은 없다.
 *   제공자(나중의 그리드·school-clock)가 자기 행 시각을 이 꼴로 노출한다.
 */
export interface Clock {
    /** 행 시각 전부(시작 이른 순). */
    rows(): readonly RowTime[];
    /** 그 시각(분)에 걸린 행 — 어느 행에도 안 걸리면 null. */
    rowAt(at: Minute): RowTime | null;
    /** 두 구간이 겹치나([start,end) 기준 — 맞닿기만 하면 안 겹친다). */
    overlaps(a: TimeRange, b: TimeRange): boolean;
    onChange(listener: () => void): Disposable;
}
