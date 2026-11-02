/**
 * 모드 순서(C3) — 년·분기·월·주·3일·하루·일정·간트. 「일정」은 하루 뒤·간트 앞(쥔님 2026-11-01 22:17).
 */
import { describe, it, expect } from 'vitest';
import { MODE_ORDER } from './modes';

describe('달력 모드 순서', () => {
    it('전체 순서가 그대로다', () => {
        expect(MODE_ORDER).toEqual(['year', 'dense', 'month', 'week', '3day', 'day', 'list', 'gantt']);
    });
    it('「일정」(list)은 하루 바로 뒤, 간트 앞', () => {
        expect(MODE_ORDER.indexOf('list')).toBe(MODE_ORDER.indexOf('day') + 1);
        expect(MODE_ORDER.indexOf('list')).toBeLessThan(MODE_ORDER.indexOf('gantt'));
    });
});
