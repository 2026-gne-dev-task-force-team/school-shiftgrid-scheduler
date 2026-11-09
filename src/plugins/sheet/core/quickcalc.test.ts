import { describe, expect, it } from 'vitest';
import { quickCalc, toNumber } from './quickcalc';

describe('quick-calc', () => {
    it('숫자만 모아 합·평균·최소·최대를 낸다', () => {
        const q = quickCalc(['1', '2,000', '', '가', '-3', '50%'])!;
        expect(q.nums).toBe(4);
        expect(q.count).toBe(5);            // 빈 칸만 빠진다
        expect(q.sum).toBeCloseTo(1998.5);
        expect(q.min).toBe(-3);
        expect(q.max).toBe(2000);
        expect(q.avg).toBeCloseTo(1998.5 / 4);
    });
    it('숫자가 없으면 개수만, 다 비면 null', () => {
        expect(quickCalc(['가', '나'])).toMatchObject({ nums: 0, count: 2 });
        expect(quickCalc(['', ' '])).toBeNull();
    });
    it('toNumber 는 글자를 숫자로 안 읽는다', () => {
        expect(toNumber('12abc')).toBeNull();
        expect(toNumber(' 7 ')).toBe(7);
    });
});
