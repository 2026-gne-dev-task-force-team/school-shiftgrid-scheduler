// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { normalizeKey, eventToKey, formatKey, effectiveKey, keyMap, handleKeydown, setKeyOverride, resetAllKeyOverrides } from './keybindings';
import { addCommand } from './plugin/store';

const ev = (o: Partial<KeyboardEvent>) => ({ key: '', code: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...o });

describe('keybindings', () => {
    beforeEach(() => resetAllKeyOverrides());

    it('normalizeKey — 수식 키 순서·대문자·+ 키', () => {
        expect(normalizeKey('shift+mod+p')).toBe('Mod+Shift+P');
        expect(normalizeKey('Alt+Mod+b')).toBe('Mod+Alt+B');
        expect(normalizeKey('Mod++')).toBe('Mod++');
        expect(normalizeKey('Mod')).toBe('');
    });

    it('eventToKey — 한글 입력 중에도 code 로 글자를 읽는다 · 맥 ⌘=Mod', () => {
        expect(eventToKey(ev({ key: 'ㅔ', code: 'KeyP', ctrlKey: true }), false)).toBe('Mod+P');
        expect(eventToKey(ev({ key: 'p', code: 'KeyP', metaKey: true }), true)).toBe('Mod+P');
        expect(eventToKey(ev({ key: 'p', code: 'KeyP', ctrlKey: true }), true)).toBe('Ctrl+P');
        expect(eventToKey(ev({ key: '\\', code: 'Backslash', ctrlKey: true }), false)).toBe('Mod+\\');
        expect(eventToKey(ev({ key: 'Control', code: 'ControlLeft', ctrlKey: true }), false)).toBeNull();
    });

    it('formatKey', () => {
        expect(formatKey('Mod+Alt+B', false)).toBe('Ctrl+Alt+B');
        expect(formatKey('Mod+Shift+P', true)).toBe('⌘⇧P');
    });

    it('재지정이 기본을 이기고 · 지우면 꺼지고 · 겹침이 보이고 · 디스패처가 부른다', () => {
        let ran = 0;
        const a = addCommand('t', { id: 't.a', title: 'A', keys: 'Mod+J', run: () => { ran++; } });
        const b = addCommand('t', { id: 't.b', title: 'B', run: () => {} });
        expect(effectiveKey('t.a', 'Mod+J')).toBe('Mod+J');

        const e = new KeyboardEvent('keydown', { key: 'j', code: 'KeyJ', ctrlKey: true, metaKey: true, cancelable: true });
        expect(handleKeydown(e)).toBe(true);
        expect(ran).toBe(1);
        expect(e.defaultPrevented).toBe(true);

        setKeyOverride('t.b', 'Mod+J');
        expect(keyMap().get('Mod+J')).toEqual(['t.a', 't.b']);

        setKeyOverride('t.a', '');
        expect(effectiveKey('t.a', 'Mod+J')).toBe('');
        a.dispose(); b.dispose();
    });

    it('뷰가 먼저 preventDefault 하면 양보한다', () => {
        let ran = 0;
        const a = addCommand('t', { id: 't.c', title: 'C', keys: 'Mod+K', run: () => { ran++; } });
        const e = new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, metaKey: true, cancelable: true });
        e.preventDefault();
        expect(handleKeydown(e)).toBe(false);
        expect(ran).toBe(0);
        a.dispose();
    });
});
