/**
 * time-grid 검산 — 순수 계산이라 종료코드로 전부 잰다(React·DOM 0).
 *   열 길이·연속성 · 달 넘김 · 범위 시작(주는 일요일로 당김) · 범위 글자 네 꼴 · 시 눈금 · 하루 중 분.
 */
import { describe, it, expect } from 'vitest';
import { dayColumns, rangeStart, rangeLabel, hourLabel, minutesOfDay } from './time-grid';

describe('dayColumns — days 개 열', () => {
    it('length === days', () => {
        expect(dayColumns(new Date(2026, 10, 1), 7).length).toBe(7);
        expect(dayColumns(new Date(2026, 10, 1), 3).length).toBe(3);
        expect(dayColumns(new Date(2026, 10, 1), 1).length).toBe(1);
    });

    it('날이 연속한다(하루씩)', () => {
        const cols = dayColumns(new Date(2026, 10, 1), 7);
        expect(cols.map((c) => c.iso)).toEqual([
            '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04',
            '2026-11-05', '2026-11-06', '2026-11-07',
        ]);
    });

    it('달을 넘긴다 — 11/29 + 7열 → 마지막이 12/5', () => {
        const cols = dayColumns(new Date(2026, 10, 29), 7);
        expect(cols[0].iso).toBe('2026-11-29');
        expect(cols[6].iso).toBe('2026-12-05');
        expect(cols[6].m).toBe(12);
        expect(cols[6].d).toBe(5);
    });

    it('weekday 는 0=일 ~ 6=토 — 11/1(일)은 0, 11/4(수)는 3', () => {
        const cols = dayColumns(new Date(2026, 10, 1), 7);
        expect(cols[0].weekday).toBe(0);
        expect(cols[3].weekday).toBe(3);
    });

    it('isToday 는 today 인자로 갈린다(안 주면 전부 false)', () => {
        const cols = dayColumns(new Date(2026, 10, 1), 7, new Date(2026, 10, 4));
        expect(cols.map((c) => c.isToday)).toEqual([false, false, false, true, false, false, false]);
        expect(dayColumns(new Date(2026, 10, 1), 7).some((c) => c.isToday)).toBe(false);
    });
});

describe('rangeStart — 주는 일요일로 당김, 3·1 은 그날', () => {
    it('주(7)는 그 주 시작(일요일)으로 당긴다 — 11/4(수) → 11/1(일)', () => {
        const s = rangeStart(new Date(2026, 10, 4), 7);
        expect(s.getFullYear()).toBe(2026);
        expect(s.getMonth() + 1).toBe(11);
        expect(s.getDate()).toBe(1);
        expect(s.getDay()).toBe(0);
    });

    it('3·1 은 anchor 그날 자정(당기지 않는다)', () => {
        const a = new Date(2026, 10, 4, 15, 30);
        for (const days of [3, 1] as const) {
            const s = rangeStart(a, days);
            expect(s.getDate()).toBe(4);
            expect(s.getHours()).toBe(0);
            expect(s.getMinutes()).toBe(0);
        }
    });

    it('일요일 자체는 주에서도 그대로', () => {
        expect(rangeStart(new Date(2026, 10, 1), 7).getDate()).toBe(1);
    });

    it('weekStart=1(월요일 시작)이면 주를 월요일로 당긴다 — 11/4(수) → 11/2(월)', () => {
        expect(rangeStart(new Date(2026, 10, 4), 7, 1).getDate()).toBe(2);
    });
});

describe('rangeLabel — 네 꼴', () => {
    it('하루 — 요일 꼬리', () => {
        expect(rangeLabel(dayColumns(new Date(2026, 10, 4), 1))).toBe('2026년 11월 4일 (수)');
    });
    it('같은 달 여러 날', () => {
        expect(rangeLabel(dayColumns(new Date(2026, 10, 1), 7))).toBe('2026년 11월 1일 – 7일');
    });
    it('달 걸침', () => {
        expect(rangeLabel(dayColumns(new Date(2026, 10, 29), 7))).toBe('2026년 11월 29일 – 12월 5일');
    });
    it('해 걸침', () => {
        expect(rangeLabel(dayColumns(new Date(2026, 11, 28), 7))).toBe('2026년 12월 28일 – 2027년 1월 3일');
    });
});

describe('hourLabel · minutesOfDay', () => {
    it('hourLabel — 24시간, 0 채움', () => {
        expect(hourLabel(0)).toBe('00:00');
        expect(hourLabel(9)).toBe('09:00');
        expect(hourLabel(13)).toBe('13:00');
        expect(hourLabel(24)).toBe('24:00');
    });
    it('minutesOfDay — 0~1439', () => {
        expect(minutesOfDay(new Date(2026, 10, 4, 0, 0))).toBe(0);
        expect(minutesOfDay(new Date(2026, 10, 4, 9, 30))).toBe(570);
        expect(minutesOfDay(new Date(2026, 10, 4, 23, 59))).toBe(1439);
    });
});
