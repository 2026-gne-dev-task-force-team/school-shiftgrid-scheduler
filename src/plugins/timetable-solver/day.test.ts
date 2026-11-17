import { describe, it, expect } from 'vitest';
import { toWeekday, toDayIndex } from './day';
import { solverApi } from './api';

describe('timetable-solver 요일 변환(0=월 ↔ 1=월)', () => {
    it('월~금 왕복', () => {
        expect([0, 1, 2, 3, 4].map(toWeekday)).toEqual([1, 2, 3, 4, 5]);
        expect([1, 2, 3, 4, 5].map(toDayIndex)).toEqual([0, 1, 2, 3, 4]);
        for (let d = 0; d < 7; d++) expect(toDayIndex(toWeekday(d))).toBe(d);
    });
    it('약속 모듈이 같은 변환과 엔진 함수를 싣는다', () => {
        expect(solverApi.version).toBe(1);
        expect(solverApi.toWeekday(0)).toBe(1);
        expect(solverApi.toDayIndex(1)).toBe(0);
        expect(solverApi.RULES.length).toBeGreaterThan(0);
    });
});
