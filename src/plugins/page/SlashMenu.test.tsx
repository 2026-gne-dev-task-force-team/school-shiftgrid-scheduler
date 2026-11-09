// @vitest-environment jsdom
/** W4 — `/` 메뉴: 방향키로 고른 항목을 늘 보이게 굴린다 · 높이 상한 안에서 스크롤. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SlashMenu, SLASH_ITEMS } from './views/SlashMenu';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root; let box: HTMLDivElement;
afterEach(() => { act(() => root.unmount()); box.remove(); });

describe('SlashMenu 스크롤', () => {
    it('고른 항목이 바뀌면 그 항목을 nearest 로 굴린다', () => {
        const spy = vi.fn();
        Element.prototype.scrollIntoView = spy;
        box = document.createElement('div'); document.body.appendChild(box); root = createRoot(box);
        act(() => { root.render(<SlashMenu items={SLASH_ITEMS} active={0} onPick={() => {}} />); });
        spy.mockClear();
        act(() => { root.render(<SlashMenu items={SLASH_ITEMS} active={9} onPick={() => {}} />); });
        expect(spy).toHaveBeenCalledWith({ block: 'nearest' });
        const target = spy.mock.contexts.at(-1) as HTMLElement;
        expect(target.dataset.slashIndex).toBe('9');
    });
    it('메뉴는 높이 상한 + 세로 스크롤 + 휠이 페이지로 새지 않는다', () => {
        box = document.createElement('div'); document.body.appendChild(box); root = createRoot(box);
        act(() => { root.render(<SlashMenu items={SLASH_ITEMS} active={0} onPick={() => {}} />); });
        const list = box.querySelector('[role="listbox"]') as HTMLElement;
        expect(list.className).toContain('max-h-72');
        expect(list.className).toContain('overflow-y-auto');
        const outer = vi.fn();
        document.body.addEventListener("wheel", outer);
        list.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
        expect(outer).not.toHaveBeenCalled();
    });
});
