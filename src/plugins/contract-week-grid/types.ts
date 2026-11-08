/**
 *   📌 약속 플러그인 contract-week-grid — 내용은 e38940a 그대로(쥔님 검토 전 초안 · 2026-11-08 14:59 「리버트」).
 *      구조만 바꿨다: import 자리(contract-*) · 공용 시각 낱말은 contract-clock · onChange 인라인.
 * 🔴 인터페이스 「week-grid」 0.1.0 — 요일×교시 격자를 그리고 칸을 가리키는 법.
 *   시간표·보결·특별실·보조인력 화면이 같은 격자를 그린다. 칸 열쇠(key)를 하나로 맞춰야 서로의 칸을 가리킬 수 있다.
 *   ⭐ 격자는 「교시」로 그린다(사람이 읽는 꼴). 실제 시각이 필요하면 clock 에 묻는다 — 격자는 시각을 모른다.
 *   소비자: host.modules 로 week-grid 모듈을 받는다. ⛔ 값 0.
 */
import type { Weekday, PeriodRef } from '../contract-clock/types';

/** 칸 열쇠 — 'd3p4'(수요일 4교시) 꼴. 제공자가 정하고 소비자는 key/parse 로만 다룬다(⛔ 문자열을 손으로 짓지 말 것). */
export type CellKey = string;

/** 한 학년(또는 여러 학년 합집합)의 격자 모양. */
export interface GridShape {
    days: Weekday[];
    /** 요일마다 교시 수 — 학년·요일마다 다를 수 있다(1·2학년 5교시). */
    periodsPerDay: Record<Weekday, number>;
}

export interface WeekGrid {
    key(ref: PeriodRef): CellKey;
    parse(key: CellKey): PeriodRef | null;
    /** 그 학년 격자 모양(clock 에서 만든다). 여러 학년을 한 격자에 그릴 땐 합집합(교시 수 최대). */
    shapeOf(grades: number[]): GridShape;
    /** 격자의 모든 칸(요일 → 교시 순). */
    cells(shape: GridShape): PeriodRef[];
    /** 요일 이름 '월'…'금'. */
    dayLabel(day: Weekday): string;
}
