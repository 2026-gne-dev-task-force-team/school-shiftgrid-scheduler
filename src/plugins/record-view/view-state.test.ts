/**
 * 보기 상태 정규화 검사 — 아무 JSON(옛 판·깨진 값)을 안전한 RecordViewState 로 떨구는지.
 */
import { describe, it, expect } from 'vitest';
import { defaultState, normalizeState } from './view-state';

describe('normalizeState', () => {
    it('객체가 아니면 기본값', () => {
        expect(normalizeState(null)).toEqual(defaultState());
        expect(normalizeState(42)).toEqual(defaultState());
        expect(normalizeState('x')).toEqual(defaultState());
    });

    it('정상 값은 그대로 받는다', () => {
        const s = normalizeState({
            kind: 'table', search: '김', filters: [{ key: 'a', op: 'eq', value: '1' }],
            sorts: [{ key: 'a', dir: 'desc' }], hidden: ['b'], widths: { a: 200 },
        });
        expect(s.search).toBe('김');
        expect(s.filters).toEqual([{ key: 'a', op: 'eq', value: '1' }]);
        expect(s.sorts).toEqual([{ key: 'a', dir: 'desc' }]);
        expect(s.hidden).toEqual(['b']);
        expect(s.widths).toEqual({ a: 200 });
    });

    it('깨진 필터·정렬 줄은 버린다', () => {
        const s = normalizeState({
            filters: [{ key: 'a' }, { op: 'eq' }, { key: 'b', op: 'contains', value: 'x' }, null],
            sorts: [{ key: 'a', dir: 'sideways' }, { key: 'b', dir: 'asc' }],
        });
        expect(s.filters).toEqual([{ key: 'b', op: 'contains', value: 'x' }]);
        expect(s.sorts).toEqual([{ key: 'b', dir: 'asc' }]);
    });

    it('값 없는 연산자는 value 를 안 붙인다', () => {
        const s = normalizeState({ filters: [{ key: 'a', op: 'empty' }] });
        expect(s.filters[0]).toEqual({ key: 'a', op: 'empty' });
        expect('value' in s.filters[0]).toBe(false);
    });

    it('이상한 widths 는 거른다(음수·0·문자열)', () => {
        const s = normalizeState({ widths: { a: 100, b: -5, c: 0, d: 'wide' } });
        expect(s.widths).toEqual({ a: 100 });
    });

    it('hidden 의 비문자열은 거른다', () => {
        const s = normalizeState({ hidden: ['a', 3, null, 'b'] });
        expect(s.hidden).toEqual(['a', 'b']);
    });
});
