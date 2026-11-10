/** 반복 규칙 꼴 — 순수 데이터(저장 가능한 JSON). 날짜 문자열은 달력 꼴: 종일 'YYYY-MM-DD' · 시각 'YYYY-MM-DDTHH:mm'. */
export type RecurFreq = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RecurRule {
    freq: RecurFreq;
    /** N 간격(일·주·달·해 단위). 기본 1. */
    interval?: number;
    /** weekly: 요일들(0=일 … 6=토). 없으면 시작일의 요일. */
    weekdays?: readonly number[];
    /** monthly: 매월 N일(음수는 끝에서 — -1 = 말일). 없고 nth 도 없으면 시작일의 일. */
    monthDay?: number;
    /** monthly: N째 요일(1~5 · 마지막 = -1). */
    nth?: { n: number; weekday: number };
    /** 끝 — 횟수(시작 회차 포함 · exdates 로 빠진 회차도 센다 = RFC5545). 둘 다 없으면 끝 없음. */
    count?: number;
    /** 끝 — 이 날짜까지 포함(앞 10자 'YYYY-MM-DD' 만 본다). */
    until?: string;
    /** 빠지는 날 — 'YYYY-MM-DD'(그날 전부) 또는 회차 시작 전체 문자열. */
    exdates?: readonly string[];
}
