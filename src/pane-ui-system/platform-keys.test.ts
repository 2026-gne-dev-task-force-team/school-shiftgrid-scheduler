// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { isMod, isAlt, keyLabel, modClickLabel, setPlatform, platform } from './platform-keys';
import { undoKey } from './history';
import { decideKey } from '../plugins/page/core/keys';
import { eventToKey } from './keybindings';

const ev = (o: Record<string, unknown>) => ({ key: '', code: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...o }) as never;

describe('platform-keys', () => {
    afterEach(() => setPlatform('mac'));

    it('isMod — 맥은 ⌘ 만, 윈도우는 Ctrl 만(Win 키 오인 없음)', () => {
        setPlatform('mac');
        expect(isMod({ metaKey: true, ctrlKey: false })).toBe(true);
        expect(isMod({ metaKey: false, ctrlKey: true })).toBe(false);
        setPlatform('win');
        expect(isMod({ metaKey: false, ctrlKey: true })).toBe(true);
        expect(isMod({ metaKey: true, ctrlKey: false })).toBe(false);
        expect(isAlt({ altKey: true })).toBe(true);
    });
    it('keyLabel — 양 플랫폼', () => {
        expect(keyLabel('Mod+Shift+Z', true)).toBe('⌘⇧Z');
        expect(keyLabel('Mod+Shift+Z', false)).toBe('Ctrl+Shift+Z');
        expect(keyLabel('Mod+Alt+Enter', false)).toBe('Ctrl+Alt+Enter');
        setPlatform('win'); expect(keyLabel('Mod+K')).toBe('Ctrl+K'); expect(modClickLabel()).toBe('Ctrl+클릭');
        setPlatform('mac'); expect(keyLabel('Mod+K')).toBe('⌘K'); expect(modClickLabel()).toBe('⌘클릭');
        expect(platform()).toBe('mac');
    });
    it('윈도우 흉내 ① 되돌리기·다시하기(Ctrl+Z · Ctrl+Shift+Z · Ctrl+Y), Win+Z 는 무시', () => {
        setPlatform('win');
        expect(undoKey(ev({ key: 'z', ctrlKey: true }))).toBe('undo');
        expect(undoKey(ev({ key: 'z', ctrlKey: true, shiftKey: true }))).toBe('redo');
        expect(undoKey(ev({ key: 'y', ctrlKey: true }))).toBe('redo');
        expect(undoKey(ev({ key: 'z', metaKey: true }))).toBeNull();
        setPlatform('mac');
        expect(undoKey(ev({ key: 'z', metaKey: true }))).toBe('undo');
        expect(undoKey(ev({ key: 'y', metaKey: true }))).toBeNull();
    });
    it('윈도우 흉내 ② 탭으로 열기 = Ctrl+Enter(전역 키 글자)', () => {
        setPlatform('win');
        expect(eventToKey(ev({ key: 'Enter', ctrlKey: true }), false)).toBe('Mod+Enter');
        expect(eventToKey(ev({ key: 'Enter', metaKey: true }), false)).toBe('Enter');
    });
    it('윈도우 흉내 ③ 시트 복사 Ctrl+C 는 Mod, 페이지 Ctrl+D 복제', () => {
        setPlatform('win');
        expect(eventToKey(ev({ key: 'c', code: 'KeyC', ctrlKey: true }), false)).toBe('Mod+C');
        expect(decideKey({ key: 'd', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false } as never)).toBe('duplicate');
        expect(decideKey({ key: 'd', ctrlKey: false, metaKey: true, shiftKey: false, altKey: false } as never)).not.toBe('duplicate');
    });
});
