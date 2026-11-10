// @vitest-environment jsdom
/** R1 새 부품 — InlineRename · TextInput onEnter/onEscape · EmptyState · useFrameToolbar · isImeEnter */
import { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TitleField } from './IconPicker';
import { InlineRename } from './InlineRename';
import { TextInput } from './TextInput';
import { EmptyState } from './EmptyState';
import { useFrameToolbar } from './FrameToolbar';
import { isImeEnter } from './ime';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let roots: Root[] = [];
afterEach(() => { act(() => roots.forEach((r) => r.unmount())); roots = []; document.body.innerHTML = ''; });
function mount(node: React.ReactNode) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    act(() => root.render(node));
    return root;
}
const input = () => document.querySelector('input') as HTMLInputElement;
const setValue = (el: HTMLInputElement, v: string) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => { set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const keydown = (el: Element, k: string, extra: Record<string, unknown> = {}) => act(() => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra });
    if ('keyCode' in extra) Object.defineProperty(e, 'keyCode', { value: extra.keyCode });
    el.dispatchEvent(e);
});

describe('InlineRename', () => {
    const setup = (value = '옛 이름') => {
        const onCommit = vi.fn();
        const onCancel = vi.fn();
        mount(h(InlineRename, { value, onCommit, onCancel }));
        return { onCommit, onCancel, el: input() };
    };

    it('뜨면 초점 + 전체 선택', () => {
        const { el } = setup();
        expect(document.activeElement).toBe(el);
        expect([el.selectionStart, el.selectionEnd]).toEqual([0, '옛 이름'.length]);
    });
    it('Enter 확정(앞뒤 공백 다듬기) — 뒤따르는 blur 가 두 번 부르지 않는다', () => {
        const { onCommit, onCancel, el } = setup();
        setValue(el, '  새 이름 ');
        keydown(el, 'Enter');
        act(() => el.blur());
        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(onCommit).toHaveBeenCalledWith('새 이름');
        expect(onCancel).not.toHaveBeenCalled();
    });
    it('Esc 취소', () => {
        const { onCommit, onCancel, el } = setup();
        setValue(el, '새');
        keydown(el, 'Escape');
        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onCommit).not.toHaveBeenCalled();
    });
    it('blur 는 확정', () => {
        const { onCommit, el } = setup();
        setValue(el, '새');
        act(() => el.blur());
        expect(onCommit).toHaveBeenCalledWith('새');
    });
    it('한글 조합 중 Enter 는 무시(isComposing · keyCode 229)', () => {
        const { onCommit, onCancel, el } = setup();
        setValue(el, '새이');
        keydown(el, 'Enter', { isComposing: true });
        keydown(el, 'Enter', { keyCode: 229 });
        expect(onCommit).not.toHaveBeenCalled();
        expect(onCancel).not.toHaveBeenCalled();
        keydown(el, 'Enter');
        expect(onCommit).toHaveBeenCalledWith('새이');
    });
    it('빈 값·같은 값이면 취소', () => {
        const a = setup();
        setValue(a.el, '   ');
        keydown(a.el, 'Enter');
        expect(a.onCancel).toHaveBeenCalledTimes(1);
        expect(a.onCommit).not.toHaveBeenCalled();
    });
});

describe('TextInput onEnter/onEscape', () => {
    it('Enter 는 값을 넘기고 조합 중 Enter 는 무시 · Esc 는 onEscape', () => {
        const onEnter = vi.fn();
        const onEscape = vi.fn();
        mount(h(TextInput, { defaultValue: '가', onEnter, onEscape }));
        keydown(input(), 'Enter', { isComposing: true });
        expect(onEnter).not.toHaveBeenCalled();
        keydown(input(), 'Enter');
        expect(onEnter.mock.calls[0][0]).toBe('가');
        keydown(input(), 'Escape');
        expect(onEscape).toHaveBeenCalledTimes(1);
    });
});

describe('isImeEnter', () => {
    it('조합 Enter 만 true', () => {
        expect(isImeEnter({ key: 'Enter', isComposing: true })).toBe(true);
        expect(isImeEnter({ key: 'Enter', keyCode: 229 })).toBe(true);
        expect(isImeEnter({ key: 'Enter', nativeEvent: { isComposing: true } })).toBe(true);
        expect(isImeEnter({ key: 'Enter' })).toBe(false);
        expect(isImeEnter({ key: 'a', isComposing: true })).toBe(false);
    });
});

describe('EmptyState', () => {
    it('제목·설명·동작 단추', () => {
        const onClick = vi.fn();
        mount(h(EmptyState, { icon: 'info', title: '꺼져 있다', description: '설정에서 켠다', action: { label: '켜기', onClick } }));
        expect(document.body.textContent).toContain('꺼져 있다');
        expect(document.body.textContent).toContain('설정에서 켠다');
        const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('켜기'))!;
        act(() => btn.click());
        expect(onClick).toHaveBeenCalledTimes(1);
    });
});

describe('useFrameToolbar', () => {
    it('slot 자리에 Portal 내용이 꽂히고 host 가 그 칸이다', () => {
        let seen: HTMLElement | null = null;
        function View() {
            const bar = useFrameToolbar();
            seen = bar.host;
            return h('div', null,
                h('header', { id: 'frame-head' }, bar.slot),
                h('main', null, h(bar.Portal, null, h('span', { id: 'tool' }, '막대'))));
        }
        mount(h(View));
        const tool = document.getElementById('tool')!;
        expect(tool.closest('#frame-head')).not.toBeNull();
        expect(seen).toBe(tool.parentElement);
    });
});

describe('TitleField — 기본 이름 전체 선택', () => {
    it('「페이지 2」 같은 기본 이름이면 포커스에 전체 선택, 직접 지은 이름이면 아니다', () => {
        mount(h(TitleField, { value: '페이지 2', onRename: () => {} }));
        const el = document.querySelector("textarea")!; const spy = vi.spyOn(el, 'select');
        act(() => { el.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); });
        expect(spy).toHaveBeenCalled();
        document.body.innerHTML = '';
        mount(h(TitleField, { value: '내 글', onRename: () => {} }));
        const e2 = document.querySelector("textarea")!; const s2 = vi.spyOn(e2, 'select');
        act(() => { e2.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); });
        expect(s2).not.toHaveBeenCalled();
    });
});
