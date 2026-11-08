/**
 * 되돌리기/다시하기 — 블록 단위(명세 요구 10).
 */
import { describe, it, expect } from 'vitest';
import { initHistory, commit, undo, redo, canUndo, canRedo } from './history';

describe('되돌리기 스택', () => {
    it('확정 → 되돌리기 → 다시하기', () => {
        let h = initHistory('A');
        h = commit(h, 'B');
        h = commit(h, 'C');
        expect(h.present).toBe('C');
        expect(canUndo(h)).toBe(true);

        h = undo(h);
        expect(h.present).toBe('B');
        h = undo(h);
        expect(h.present).toBe('A');
        expect(canUndo(h)).toBe(false);

        h = redo(h);
        expect(h.present).toBe('B');
        expect(canRedo(h)).toBe(true);
    });
    it('되돌린 뒤 새로 확정하면 다시하기 가지가 버려진다', () => {
        let h = initHistory('A');
        h = commit(h, 'B');
        h = undo(h);                 // present A
        h = commit(h, 'X');         // 새 가지
        expect(h.present).toBe('X');
        expect(canRedo(h)).toBe(false);
    });
    it('같은 값은 확정해도 쌓이지 않는다', () => {
        let h = initHistory('A');
        h = commit(h, 'A');
        expect(canUndo(h)).toBe(false);
    });
    it('상한을 넘기면 오래된 것부터 버린다', () => {
        let h = initHistory(0, 3);
        for (let i = 1; i <= 5; i++) h = commit(h, i);
        expect(h.past.length).toBeLessThanOrEqual(3);
        expect(h.present).toBe(5);
    });
});
