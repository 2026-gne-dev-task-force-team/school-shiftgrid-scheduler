import { describe, it, expect } from 'vitest';
import { dateText, toDateValue } from './dates';

describe('dateText · toDateValue', () => {
    it('패턴 보존 · ↻ 요약', () => {
        const v = { start: '2026-11-03', pattern: { rules: [{ freq: 'weekly' }] } };
        expect(toDateValue(v)).toEqual(v);
        expect(toDateValue({ start: '2026-11-03', pattern: { freq: 'weekly' } })).toEqual({ start: '2026-11-03' });
        expect(dateText(v)).toBe('↻ 매주 화 · 11/3부터');
    });
});
