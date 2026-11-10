import { setPlatform } from './platform-keys';
import { describe, it, expect } from 'vitest';
import { emptyHistory, record, undo, redo, undoKey } from './history';

describe('공용 되돌리기 더미', () => {
    it('record 는 limit 을 넘으면 오래된 것부터 버린다', () => {
        let h = emptyHistory<number>();
        for (let i = 0; i < 5; i++) h = record(h, i, 3);
        expect(h.past).toEqual([2, 3, 4]);
    });
    it('undo → redo 왕복', () => {
        const h = record(emptyHistory<string>(), 'a');
        const u = undo(h, 'b')!;
        expect(u.value).toBe('a');
        expect(redo(u.history, u.value)!.value).toBe('b');
        expect(undo(u.history, u.value)).toBeNull();
    });
});

describe('undoKey', () => {
    const k = (key: string, o: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; isComposing: boolean }> = {}) =>
        undoKey({ key, ctrlKey: false, metaKey: false, shiftKey: false, ...o });
    it('Ctrl+Z 되돌리기 · Shift 붙으면 다시 · Ctrl+Y 다시', () => {
        setPlatform('win');   // Ctrl 이 Mod — 윈도우 흉내(W14)
        expect(k('z', { ctrlKey: true })).toBe('undo');
        expect(k('Z', { ctrlKey: true, shiftKey: true })).toBe('redo');
        expect(k('y', { ctrlKey: true })).toBe('redo');
    });
    it('한글 자판(e.key 자모)이어도 e.code 로 판정 · 라틴 key 가 있으면 그것이 우선', () => {
        setPlatform('win');
        expect(undoKey({ key: 'ㅋ', code: 'KeyZ', ctrlKey: true, metaKey: false, shiftKey: false })).toBe('undo');
        expect(undoKey({ key: 'ㅛ', code: 'KeyY', ctrlKey: true, metaKey: false, shiftKey: false })).toBe('redo');
        // 드보락: 물리 KeyZ 위치에 라틴 ';' 가 아니라 'q' 등이 오면 key 를 따른다
        expect(undoKey({ key: 'q', code: 'KeyZ', ctrlKey: true, metaKey: false, shiftKey: false })).toBeNull();
    });
    it('수식키 없음·Alt·한글 조합 중·다른 글자는 null', () => {
        expect(k('z')).toBeNull();
        expect(k('z', { ctrlKey: true, altKey: true })).toBeNull();
        expect(k('z', { ctrlKey: true, isComposing: true })).toBeNull();
        expect(k('x', { ctrlKey: true })).toBeNull();
    });
});
