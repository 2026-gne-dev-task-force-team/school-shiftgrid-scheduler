// @vitest-environment jsdom
/** #48 보기 탭 롤빙 tabindex — 활성 탭만 Tab 정차 · ←/→ 로 이동 · Alt+←/→ 는 건드리지 않는다. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { ViewTabs } from './ViewTabs';
import type { ViewDef } from './contracts/collection';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const views = ['a', 'b', 'c'].map((id) => ({ id, name: id, type: 'table' }) as unknown as ViewDef);

function mount() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => { root.render(<ViewTabs views={views} activeId="b" fields={[]} onSelect={vi.fn()} onChange={vi.fn()} />); });
    const tabs = Array.from(host.querySelectorAll<HTMLElement>('[data-rv-view-tab]'));
    return { host, tabs, done: () => { act(() => root.unmount()); host.remove(); } };
}
const key = (el: HTMLElement, k: string, init: KeyboardEventInit = {}) =>
    act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...init })); });

describe('ViewTabs 롤빙 tabindex', () => {
    it('활성 탭만 tabindex 0, 나머지는 -1', () => {
        const { tabs, done } = mount();
        expect(tabs.map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
        done();
    });
    it('→ ← 로 초점이 옮겨 가고 끝에서 돈다', () => {
        const { tabs, done } = mount();
        tabs[1].focus();
        key(tabs[1], 'ArrowRight'); expect(document.activeElement).toBe(tabs[2]);
        key(tabs[2], 'ArrowRight'); expect(document.activeElement).toBe(tabs[0]);
        key(tabs[0], 'ArrowLeft'); expect(document.activeElement).toBe(tabs[2]);
        key(tabs[2], 'Home'); expect(document.activeElement).toBe(tabs[0]);
        done();
    });
});
