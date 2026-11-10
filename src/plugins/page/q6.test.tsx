// @vitest-environment jsdom
/**
 * Q6 — 페이지 블록 우클릭: 손잡이·빈 곳은 창틀 메뉴(복제·위/아래·삭제), 글 쓰는 줄은 기본 메뉴.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PageView } from './views/PageView';
import { setActivePage } from './store';
import { initPageNodes } from './nodes';
import type { NodesApi, PublicNode } from '../../pane-ui-system/core/nodes/contracts/nodes';
import { frameHost } from './test-frame-host';
import type { Page } from './core/types';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const store = new Map<string, { id: string; type: string; name: string; children: string[]; body?: unknown }>();
const fakeNodes = {
    version: 1,
    get: (id: string) => store.get(id) as unknown as PublicNode | undefined,
    setBody: (id: string, body: unknown) => { const n = store.get(id); if (n) n.body = body; },
    subscribe: () => ({ dispose() {} }),
    byType: () => [],
    parent: () => null,
    children: () => [],   // Q8: 본문의 하위 페이지 줄을 맞추느라 자식을 묻는다 — 이 테스트의 페이지엔 자식이 없다
    batch: (fn: () => void) => fn(),
    isTrashed: () => false,   // R5-8 정식 휴지통 판정 — 이 테스트의 페이지는 휴지통 밖
    liveByType: () => [],
    roots: { main: 'main', trash: 'trash' },
} as unknown as NodesApi;

let root: Root; let container: HTMLDivElement;
afterEach(() => { act(() => root.unmount()); container.remove(); setActivePage(null); store.clear(); document.body.innerHTML = ''; });

function open(page: Page) {
    store.set('p1', { id: 'p1', type: 'page.page', name: '페이지', children: [], body: page });
    initPageNodes(fakeNodes);
    act(() => { setActivePage('p1'); });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(<PageView host={frameHost(fakeNodes)} />); });
}
function rightClick(el: Element): MouseEvent {
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    act(() => { el.dispatchEvent(e); });
    return e;
}
const items = () => [...document.querySelectorAll('[role="menuitem"]')].map((x) => x.textContent);

describe('블록 우클릭 (R6)', () => {
    it('손잡이 자리(빈 곳) 우클릭 → 메뉴(복제·위로·아래로·삭제) · 복제하면 블록이 늘어난다', () => {
        open({ blocks: [{ id: 'a', type: 'paragraph', text: '첫' }, { id: 'b', type: 'paragraph', text: '둘' }] });
        const row = container.querySelector('[data-block-row="a"]')!;
        const e = rightClick(row);
        expect(e.defaultPrevented).toBe(true);
        expect(items()).toEqual(expect.arrayContaining(['복제', '위로', '아래로', '삭제']));
        act(() => { ([...document.querySelectorAll('[role="menuitem"]')].find((x) => x.textContent === '복제') as HTMLElement).click(); });
        expect(container.querySelectorAll('[data-block-row]').length).toBe(3);
    });
    it('글 쓰는 줄 안 우클릭 → 우리 메뉴는 안 뜨고 기본 메뉴를 막지도 않는다', () => {
        open({ blocks: [{ id: 'a', type: 'paragraph', text: '첫' }] });
        const editable = container.querySelector('[data-block-row="a"] [contenteditable]') as HTMLElement;
        expect(editable).toBeTruthy();
        const e = rightClick(editable);
        expect(items()).toEqual([]);
        expect(e.defaultPrevented).toBe(false);
    });
});
