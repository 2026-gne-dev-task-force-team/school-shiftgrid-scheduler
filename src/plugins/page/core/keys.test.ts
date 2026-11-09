/**
 * 키 판정 — Enter/Backspace/Tab/화살표·⌘단축 · 🔴 IME 조합 중 무변환(명세 요구 6·11).
 */
import { describe, it, expect } from 'vitest';
import { decideKey, type KeyInput } from './keys';

const base: KeyInput = {
    key: '', shiftKey: false, metaKey: false, ctrlKey: false,
    isComposing: false, atStart: false, atEnd: false, isEmpty: false,
    isListBlock: false, isCodeBlock: false,
};
const k = (over: Partial<KeyInput>): KeyInput => ({ ...base, ...over });

describe('🔴 IME 조합 중엔 무변환(요구 11)', () => {
    it('조합 중 Enter 는 default(가르지 않는다)', () => {
        expect(decideKey(k({ key: 'Enter', isComposing: true }))).toBe('default');
    });
    it('조합 중 Backspace(맨 앞)도 default(합치지 않는다)', () => {
        expect(decideKey(k({ key: 'Backspace', atStart: true, isComposing: true }))).toBe('default');
    });
    it('조합 중 Tab 도 default', () => {
        expect(decideKey(k({ key: 'Tab', isListBlock: true, isComposing: true }))).toBe('default');
    });
});

describe('Enter', () => {
    it('문단 Enter → 가르기', () => {
        expect(decideKey(k({ key: 'Enter' }))).toBe('split');
    });
    it('빈 목록 Enter → list-break', () => {
        expect(decideKey(k({ key: 'Enter', isListBlock: true, isEmpty: true }))).toBe('list-break');
    });
    it('내용 있는 목록 Enter → 가르기', () => {
        expect(decideKey(k({ key: 'Enter', isListBlock: true, isEmpty: false }))).toBe('split');
    });
    it('코드 블록 Enter → default(줄바꿈)', () => {
        expect(decideKey(k({ key: 'Enter', isCodeBlock: true }))).toBe('default');
    });
});

describe('Backspace / Tab / 화살표', () => {
    it('맨 앞 Backspace → merge-prev', () => {
        expect(decideKey(k({ key: 'Backspace', atStart: true }))).toBe('merge-prev');
    });
    it('중간 Backspace → default', () => {
        expect(decideKey(k({ key: 'Backspace', atStart: false }))).toBe('default');
    });
    it('Tab / ⇧Tab', () => {
        expect(decideKey(k({ key: 'Tab' }))).toBe('indent');
        expect(decideKey(k({ key: 'Tab', shiftKey: true }))).toBe('outdent');
    });
    it('↑ 맨 앞 → 앞 블록 · ↓ 맨 끝 → 뒤 블록', () => {
        expect(decideKey(k({ key: 'ArrowUp', atStart: true }))).toBe('nav-prev');
        expect(decideKey(k({ key: 'ArrowDown', atEnd: true }))).toBe('nav-next');
        expect(decideKey(k({ key: 'ArrowUp', atStart: false }))).toBe('default');
    });
});

describe('⌘ 단축', () => {
    it('⌘B/⌘I', () => {
        expect(decideKey(k({ key: 'b', metaKey: true }))).toBe('bold');
        expect(decideKey(k({ key: 'i', metaKey: true }))).toBe('italic');
    });
    it('⌘E → code · ⌘⇧S → strike', () => {
        expect(decideKey(k({ key: 'e', metaKey: true }))).toBe('code');
        expect(decideKey(k({ key: 's', metaKey: true, shiftKey: true }))).toBe('strike');
    });
    it('⌘S(시프트 없음)는 서식이 아니다(default)', () => {
        expect(decideKey(k({ key: 's', metaKey: true }))).toBe('default');
    });
    it('⌘Z / ⇧⌘Z', () => {
        expect(decideKey(k({ key: 'z', metaKey: true }))).toBe('undo');
        expect(decideKey(k({ key: 'z', metaKey: true, shiftKey: true }))).toBe('redo');
    });
    it('Ctrl 로도 된다(윈도우)', () => {
        expect(decideKey(k({ key: 'z', ctrlKey: true }))).toBe('undo');
    });
});
