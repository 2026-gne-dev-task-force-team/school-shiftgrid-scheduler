// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Tooltip } from './Tooltip';
import { LONG_PRESS_MS } from '../interactive/timing';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

function mount(text?: string) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => createRoot(host).render(createElement(Tooltip, { text, children: createElement('b', { id: 'x' }, '이름') })));
    return host.querySelector('span') as HTMLElement | null;
}
const bubble = () => document.querySelector('[data-tooltip]');
// jsdom PointerEvent 는 pointerType 을 못 받아 MouseEvent 에 얹는다
function pe(el: Element, type: string, pointerType: 'mouse' | 'touch') {
    const e = new MouseEvent(type, { bubbles: true });
    Object.defineProperty(e, 'pointerType', { value: pointerType });
    act(() => { el.dispatchEvent(e); });
}

describe('Tooltip', () => {
    it('마우스: 올리고 지연 뒤 뜨고, 벗어나면 사라진다', () => {
        const el = mount('설명이다')!;
        pe(el, 'pointerover', 'mouse');
        expect(bubble()).toBeNull();
        act(() => { vi.advanceTimersByTime(600); });
        expect(bubble()?.textContent).toBe('설명이다');
        pe(el, 'pointerout', 'mouse');
        expect(bubble()).toBeNull();
    });
    it('손가락: 길게 눌러야 뜨고 떼면 사라진다', () => {
        const el = mount('설명이다')!;
        pe(el, 'pointerdown', 'touch');
        act(() => { vi.advanceTimersByTime(LONG_PRESS_MS - 10); });
        expect(bubble()).toBeNull();
        act(() => { vi.advanceTimersByTime(20); });
        expect(bubble()).toBeTruthy();
        pe(el, 'pointerup', 'touch');
        expect(bubble()).toBeNull();
    });
    it('설명이 없으면 감싸지도 않는다', () => {
        mount(undefined);
        expect(document.querySelector('span')).toBeNull();
        expect(document.querySelector('#x')).toBeTruthy();
    });
});
