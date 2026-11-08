/**
 * 모드 순서(C3) — 년·분기·월·주·3일·하루·일정·간트. 「일정」은 하루 뒤·간트 앞(쥔님 2026-11-01 22:17).
 * 뷰 정리(2026-11-08) — 기본엔 년·월·주·일정 넷만, 나머지는 시험 기능. 숨긴 모드 저장값은 월로.
 */
import { describe, it, expect } from 'vitest';
import { MODE_ORDER, visibleModes, resolveMode } from './modes';

describe('달력 모드 순서', () => {
    it('전체 순서가 그대로다', () => {
        expect(MODE_ORDER).toEqual(['year', 'dense', 'month', 'week', '3day', 'day', 'list', 'gantt']);
    });
    it('「일정」(list)은 하루 바로 뒤, 간트 앞', () => {
        expect(MODE_ORDER.indexOf('list')).toBe(MODE_ORDER.indexOf('day') + 1);
        expect(MODE_ORDER.indexOf('list')).toBeLessThan(MODE_ORDER.indexOf('gantt'));
    });
});

describe('뷰 정리 — 기본엔 넷만, 시험 기능은 접는다(쥔님 2026-11-08)', () => {
    it('시험 기능 꺼짐: 년·월·주·일정 넷만 (순서 유지)', () => {
        expect(visibleModes(false).map((m) => m.id)).toEqual(['year', 'month', 'week', 'list']);
    });
    it('시험 기능 켜짐: 여덟 모두, 순서는 MODE_ORDER 그대로', () => {
        expect(visibleModes(true).map((m) => m.id)).toEqual(MODE_ORDER);
    });
    it('분기·3일·하루·간트는 experimental 로 접혔다', () => {
        const exp = visibleModes(true).filter((m) => m.experimental).map((m) => m.id);
        expect(exp).toEqual(['dense', '3day', 'day', 'gantt']);
    });
});

describe('숨긴 모드 저장값 → 월(resolveMode)', () => {
    it('시험 기능 꺼짐인데 저장값이 숨긴 모드면 월로', () => {
        for (const m of ['dense', '3day', 'day', 'gantt'] as const) {
            expect(resolveMode(m, false)).toBe('month');
        }
    });
    it('시험 기능 꺼짐이어도 보이는 모드는 그대로', () => {
        for (const m of ['year', 'month', 'week', 'list'] as const) {
            expect(resolveMode(m, false)).toBe(m);
        }
    });
    it('시험 기능 켜짐이면 숨긴 모드도 그대로 산다', () => {
        expect(resolveMode('day', true)).toBe('day');
        expect(resolveMode('gantt', true)).toBe('gantt');
    });
});
