/**
 * 멀티 셀렉트 순수 계산 검사(쥔님 2026-11-02 *"쉬프트 컨트롤 알지?"*) — rowsOrder·지금 선택만 보는 순수 함수.
 */
import { describe, it, expect } from 'vitest';
import { applyClick, selectAll, single, emptySelection, type Selection } from './selection';

const order = ['a', 'b', 'c', 'd', 'e'];

describe('applyClick — 맨 클릭', () => {
    it('수식어 없으면 하나만 · anchor·focus 가 그 줄', () => {
        const r = applyClick(single('a'), order, 'c', {});
        expect(r).toEqual({ ids: ['c'], anchorId: 'c', focusId: 'c' });
    });
});

describe('applyClick — Ctrl/⌘ 토글', () => {
    it('없으면 더한다(누른 줄이 anchor·focus)', () => {
        const r = applyClick(single('a'), order, 'c', { ctrl: true });
        expect(r.ids).toEqual(['a', 'c']);
        expect(r.anchorId).toBe('c');
        expect(r.focusId).toBe('c');
    });
    it('있으면 뺀다(focus 는 남은 마지막)', () => {
        const sel: Selection = { ids: ['a', 'c'], anchorId: 'c', focusId: 'c' };
        const r = applyClick(sel, order, 'c', { ctrl: true });
        expect(r.ids).toEqual(['a']);
        expect(r.focusId).toBe('a');
    });
    it('마지막 하나를 빼면 빈 선택', () => {
        const r = applyClick(single('a'), order, 'a', { ctrl: true });
        expect(r).toEqual(emptySelection());
    });
});

describe('applyClick — Shift 범위', () => {
    it('anchor~누른 줄을 rowsOrder 순서로(anchor 유지)', () => {
        const sel: Selection = { ids: ['b'], anchorId: 'b', focusId: 'b' };
        const r = applyClick(sel, order, 'd', { shift: true });
        expect(r.ids).toEqual(['b', 'c', 'd']);
        expect(r.anchorId).toBe('b');     // anchor 유지
        expect(r.focusId).toBe('d');
    });
    it('🔴 범위는 anchor 를 포함한다(버그 심기 ⓑ 자리 — anchor 를 빼먹으면 빨강)', () => {
        const sel: Selection = { ids: ['d'], anchorId: 'd', focusId: 'd' };
        const r = applyClick(sel, order, 'b', { shift: true });   // 위로 — d..b
        expect(r.ids).toEqual(['b', 'c', 'd']);
        expect(r.ids).toContain('d');     // anchor
    });
    it('anchor 가 없으면 누른 줄 하나(= 새 anchor)', () => {
        const r = applyClick(emptySelection(), order, 'c', { shift: true });
        expect(r).toEqual(single('c'));
    });
    it('anchor 가 보이는 줄에 없으면 누른 줄 하나', () => {
        const sel: Selection = { ids: ['z'], anchorId: 'z', focusId: 'z' };
        const r = applyClick(sel, order, 'c', { shift: true });
        expect(r).toEqual(single('c'));
    });
});

describe('selectAll', () => {
    it('보이는 줄 전부 · anchor 첫 줄 · focus 마지막 줄', () => {
        expect(selectAll(order)).toEqual({ ids: [...order], anchorId: 'a', focusId: 'e' });
    });
    it('빈 목록이면 빈 선택', () => {
        expect(selectAll([])).toEqual(emptySelection());
    });
});
