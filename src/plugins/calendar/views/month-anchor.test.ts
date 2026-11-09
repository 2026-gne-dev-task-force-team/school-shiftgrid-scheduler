import { describe, it, expect } from 'vitest';
import { anchorForMonth } from './MonthView';
import { startOfWeek } from '../../../pane-ui-system';

describe('S4 — 월 보기에서 넘기는 날(주 보기가 오늘이 든 주로 열린다)', () => {
    const today = new Date(2026, 10, 9);   // 2026-11-09 월
    it('오늘이 든 달이면 오늘 — 주 보기 정렬 결과가 오늘이 든 주(11/8 일)', () => {
        const a = anchorForMonth(2026, 11, today);
        expect(a.getTime()).toBe(today.getTime());
        expect(startOfWeek(a, 0).getDate()).toBe(8);
    });
    it('다른 달이면 그 달 1일', () => {
        expect(anchorForMonth(2026, 12, today)).toEqual(new Date(2026, 11, 1));
        expect(anchorForMonth(2025, 11, today)).toEqual(new Date(2025, 10, 1));
    });
});
