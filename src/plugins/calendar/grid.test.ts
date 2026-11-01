/**
 * 월 그리드 계산 검사 — 실제 달력으로 손계산한 값을 그대로 단언한다(도구가 되받아 적게 두지 않는다).
 */
import { describe, it, expect } from 'vitest';
import { monthGrid, shiftMonth, monthLabel } from './grid';

describe('monthGrid', () => {
    it('2026-11 → 1일이 일요일: 앞 이웃 0칸 · 42칸 · 뒤는 12월 1~12일', () => {
        // 🔴 today 를 멀리 고정한다 — 안 그러면 실제 오늘이 2026-11-01 일 때 isToday 가 시계로 흔들린다(구조 단언이라 시계와 떼어낸다).
        const g = monthGrid(2026, 11, 0, new Date(2000, 0, 1));
        expect(g).toHaveLength(42);

        // 첫 칸이 11월 1일(앞쪽 이웃 0칸) — 첫 주 7칸 전부 이달
        expect(g[0]).toMatchObject({ y: 2026, m: 11, d: 1, inMonth: true, isToday: false, iso: '2026-11-01' });
        expect(g.slice(0, 7).every((c) => c.inMonth)).toBe(true);

        // 11월은 30일 → 이달 칸 30개
        expect(g.filter((c) => c.inMonth)).toHaveLength(30);

        // 뒤쪽 12칸은 12월 1~12일(이웃 달)
        const tail = g.slice(30);
        expect(tail).toHaveLength(12);
        tail.forEach((c, i) => {
            expect(c).toMatchObject({
                y: 2026, m: 12, d: i + 1, inMonth: false,
                iso: `2026-12-${String(i + 1).padStart(2, '0')}`,
            });
        });
    });

    it('2026-02 → 이달 28칸(평년)', () => {
        expect(monthGrid(2026, 2, 0).filter((c) => c.inMonth)).toHaveLength(28);
    });

    it('2028-02 → 이달 29칸(윤년)', () => {
        expect(monthGrid(2028, 2, 0).filter((c) => c.inMonth)).toHaveLength(29);
    });

    it('어느 달이든 항상 42칸', () => {
        expect(monthGrid(2028, 2, 0)).toHaveLength(42);
        expect(monthGrid(2026, 1, 0)).toHaveLength(42);
        expect(monthGrid(2026, 12, 0)).toHaveLength(42);
    });

    it('isToday 는 today 인자로 갈린다', () => {
        const a = monthGrid(2026, 11, 0, new Date(2026, 10, 15));   // 11/15 을 오늘로
        expect(a.find((c) => c.iso === '2026-11-15')!.isToday).toBe(true);
        expect(a.filter((c) => c.isToday)).toHaveLength(1);

        const b = monthGrid(2026, 11, 0, new Date(2025, 0, 1));     // 보는 달 밖 → 표시 없음
        expect(b.some((c) => c.isToday)).toBe(false);
    });
});

describe('shiftMonth', () => {
    it('연말 넘김: 12 +1 → 다음 해 1월', () => {
        expect(shiftMonth(2026, 12, 1)).toEqual([2027, 1]);
    });
    it('연초 넘김: 1 −1 → 전 해 12월', () => {
        expect(shiftMonth(2026, 1, -1)).toEqual([2025, 12]);
    });
    it('같은 해 안에서의 이동', () => {
        expect(shiftMonth(2026, 5, 2)).toEqual([2026, 7]);
    });
});

describe('monthLabel', () => {
    it("'YYYY년 M월' 꼴", () => {
        expect(monthLabel(2026, 11)).toBe('2026년 11월');
        expect(monthLabel(2027, 1)).toBe('2027년 1월');
    });
});
