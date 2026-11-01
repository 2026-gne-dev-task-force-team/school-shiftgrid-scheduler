/**
 * date-grid 검산 — 순수 계산이라 종료코드로 전부 잰다(React·DOM 0).
 *   42칸 고정 · 이웃 달 채움 · 윤년 · 오늘 갈림 · 달 넘김 · 주 시작 요일.
 */
import { describe, it, expect } from 'vitest';
import { monthGrid, shiftMonth, monthLabel, isoOf } from './date-grid';

describe('monthGrid — 42칸 격자', () => {
    it('2026-11 은 1일이 일요일이라 앞쪽 이웃이 0칸이다', () => {
        expect(new Date(2026, 10, 1).getDay()).toBe(0);   // 일요일
        const g = monthGrid(2026, 11, 0);
        expect(g.length).toBe(42);
        expect(g[0].iso).toBe('2026-11-01');
        expect(g[0].inMonth).toBe(true);
        // 앞쪽 이웃(이전 달) 칸이 없다
        expect(g.filter((c) => !c.inMonth && c.m === 10).length).toBe(0);
    });

    it('2026-11 뒤쪽은 12월 1~12일로 채운다(30일 + 12칸 = 42)', () => {
        const g = monthGrid(2026, 11, 0);
        expect(g.filter((c) => c.inMonth).length).toBe(30);
        const tail = g.filter((c) => !c.inMonth);
        expect(tail.length).toBe(12);
        expect(tail.every((c) => c.m === 12)).toBe(true);
        expect(tail[0].iso).toBe('2026-12-01');
        expect(tail[11].iso).toBe('2026-12-12');
    });

    it('항상 42칸이다(다른 달도)', () => {
        expect(monthGrid(2026, 2, 0).length).toBe(42);
        expect(monthGrid(2028, 2, 0).length).toBe(42);
        expect(monthGrid(2026, 1, 0).length).toBe(42);
    });

    it('2026-02 는 28일(윤년 아님)', () => {
        expect(monthGrid(2026, 2, 0).filter((c) => c.inMonth).length).toBe(28);
    });

    it('2028-02 는 29일(윤년)', () => {
        expect(monthGrid(2028, 2, 0).filter((c) => c.inMonth).length).toBe(29);
    });

    it('isToday 는 today 인자로 갈린다', () => {
        const withToday = monthGrid(2026, 11, 0, new Date(2026, 10, 15));
        expect(withToday.find((c) => c.inMonth && c.d === 15)!.isToday).toBe(true);
        expect(withToday.filter((c) => c.isToday).length).toBe(1);

        const otherDay = monthGrid(2026, 11, 0, new Date(2026, 10, 16));
        expect(otherDay.find((c) => c.inMonth && c.d === 15)!.isToday).toBe(false);

        // today 를 안 주면 아무 칸도 오늘이 아니다(결정적)
        expect(monthGrid(2026, 11, 0).some((c) => c.isToday)).toBe(false);
    });

    it('weekStart=1(월요일 시작)이면 2026-11 앞쪽 이웃이 6칸(10/26~31)', () => {
        const g = monthGrid(2026, 11, 1);
        expect(g.length).toBe(42);
        const lead = g.slice(0, 6);
        expect(lead.every((c) => !c.inMonth && c.m === 10)).toBe(true);
        expect(lead[0].iso).toBe('2026-10-26');
        expect(lead[5].iso).toBe('2026-10-31');
        expect(g[6].iso).toBe('2026-11-01');   // 7번째 칸이 1일
    });
});

describe('shiftMonth — 해 넘김', () => {
    it('12월 +1 → 다음 해 1월', () => {
        expect(shiftMonth(2026, 12, 1)).toEqual([2027, 1]);
    });
    it('1월 -1 → 지난 해 12월', () => {
        expect(shiftMonth(2026, 1, -1)).toEqual([2025, 12]);
    });
    it('그대로(delta 0)', () => {
        expect(shiftMonth(2026, 11, 0)).toEqual([2026, 11]);
    });
    it('여러 달 건너뜀', () => {
        expect(shiftMonth(2026, 11, 3)).toEqual([2027, 2]);
        expect(shiftMonth(2026, 3, -5)).toEqual([2025, 10]);
    });
});

describe('monthLabel · isoOf', () => {
    it('monthLabel 은 한국어 꼴', () => {
        expect(monthLabel(2026, 11)).toBe('2026년 11월');
        expect(monthLabel(2026, 1)).toBe('2026년 1월');
    });
    it('isoOf 는 0 채움', () => {
        expect(isoOf(2026, 1, 1)).toBe('2026-01-01');
        expect(isoOf(2026, 11, 30)).toBe('2026-11-30');
    });
});
