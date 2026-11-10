// @vitest-environment jsdom
/**
 * 슬래시 「하위 페이지」 — 고르면 이 페이지 밑에 새 페이지가 생기고 줄이 그 자리에 놓인다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PageView } from './views/PageView';
import { setActivePage } from './store';
import { initPageNodes } from './nodes';
import type { NodesApi, PublicNode } from '../../pane-ui-system/core/nodes/contracts/nodes';
import { frameHost } from './test-frame-host';
import type { Page } from './core/types';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type N = { id: string; type: string; name: string; children: string[]; body?: unknown; parent: string | null; trashedFrom?: string };
const store = new Map<string, N>();
const calls = { remove: [] as string[], move: [] as [string, string][], open: [] as string[] };
const fakeNodes = {
    version: 1,
    get: (id: string) => store.get(id) as unknown as PublicNode | undefined,
    children: (id: string) => (store.get(id)?.children ?? []).map((c) => store.get(c)) as unknown as PublicNode[],
    parent: (id: string) => store.get(id)?.parent ?? null,
    setBody: (id: string, body: unknown) => { const n = store.get(id); if (n) n.body = body; },
    remove: (id: string) => { calls.remove.push(id); const n = store.get(id); if (!n) return; store.get(n.parent!)!.children = store.get(n.parent!)!.children.filter((c) => c !== id); n.trashedFrom = n.parent!; n.parent = 'trash'; },
    move: (id: string, to: string) => { calls.move.push([id, to]); const n = store.get(id); if (!n) return; n.parent = to; n.trashedFrom = undefined; store.get(to)!.children.push(id); },
    open: (id: string) => { calls.open.push(id); },
    batch: (fn: () => void) => fn(),
    subscribe: () => ({ dispose() {} }),
    find: () => [],
    byType: () => [],
    liveByType: () => [],
    isTrashed: (id: string) => { for (let p: string | null | undefined = id; p; p = store.get(p)?.parent) if (p === 'trash') return true; return false; },   // 정식 판정 흉내(자기·조상이 휴지통)
    create: (parent: string, o: { type: string; name: string }) => { const id = `new${store.size}`; store.set(id, { id, type: o.type, name: o.name, children: [], parent }); store.get(parent)!.children.push(id); return id; },
    roots: { main: 'main', trash: 'trash' },
} as unknown as NodesApi;

let root: Root; let container: HTMLDivElement;
beforeEach(() => { calls.remove = []; calls.move = []; calls.open = []; });
afterEach(() => { act(() => root.unmount()); container.remove(); setActivePage(null); store.clear(); document.body.innerHTML = ''; vi.useRealTimers(); });

function open(page: Page) {
    store.set('main', { id: 'main', type: 'folder', name: '', children: ['p1'], parent: null });
    store.set('trash', { id: 'trash', type: 'trash', name: '', children: [], parent: null });
    store.set('p1', { id: 'p1', type: 'page.page', name: '부모', children: [], parent: 'main', body: page });
    initPageNodes(fakeNodes);
    act(() => { setActivePage('p1'); });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(<PageView host={frameHost(fakeNodes)} />); });
}

describe('슬래시 하위 페이지', () => {
    it('/ → 「하위 페이지」 고르기 → 밑에 새 페이지 + 그 줄', () => {
        open({ blocks: [{ id: 'a', type: 'paragraph', text: '' }, { id: 'b', type: 'paragraph', text: '뒤' }] });
        const ed = container.querySelector('[data-block-row="a"] [contenteditable]') as HTMLElement;
        act(() => { ed.focus(); ed.textContent = '/'; ed.dispatchEvent(new InputEvent('input', { bubbles: true })); });
        const item = [...container.querySelectorAll('[role="listbox"] button')].find((x) => x.textContent === '하위 페이지') as HTMLElement;
        expect(item).toBeTruthy();
        act(() => { item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); });
        const kids = store.get('p1')!.children;
        expect(kids.length).toBe(1);
        expect(store.get(kids[0])!.type).toBe('page.page');
        const links = [...container.querySelectorAll('[data-child-page]')].map((l) => l.getAttribute('data-child-page'));
        expect(links).toEqual([kids[0]]);
        expect(container.querySelector('[data-block-row="a"] [data-child-page]')).toBeTruthy();   // 줄은 / 를 친 그 자리
    });

    it('만든 직후 → 새 하위 페이지를 열고 그 제목 입력에 초점(이름 전체 선택)', async () => {
        open({ blocks: [{ id: 'a', type: 'paragraph', text: '' }] });
        // 열리면 그려지는 새 페이지의 제목 입력 흉내 — 열기(open)가 불리면 붙인다
        fakeNodes.open = (id: string) => {
            calls.open.push(id);
            const t = document.createElement('input');
            t.setAttribute('aria-label', '페이지 제목'); t.value = '페이지';
            t.getClientRects = () => [{}] as unknown as DOMRectList;   // jsdom 은 배치가 없어 「보이는 칸」 판정을 흉내
            document.body.appendChild(t);
        };
        const ed = container.querySelector('[data-block-row="a"] [contenteditable]') as HTMLElement;
        act(() => { ed.focus(); ed.textContent = '/'; ed.dispatchEvent(new InputEvent('input', { bubbles: true })); });
        const item = [...container.querySelectorAll('[role="listbox"] button')].find((x) => x.textContent === '하위 페이지') as HTMLElement;
        act(() => { item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); });
        expect(calls.open).toEqual([store.get('p1')!.children[0]]);
        await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
        const ae = document.activeElement as HTMLInputElement;
        expect(ae.getAttribute('aria-label')).toBe('페이지 제목');
        expect([ae.selectionStart, ae.selectionEnd]).toEqual([0, 3]);
    });

    it('Q17b 빈 줄에 [[ → 항목 끼워 넣기 고르기(그 줄이 노드 블록)', () => {
        open({ blocks: [{ id: 'a', type: 'paragraph', text: '' }] });
        const ed = container.querySelector('[data-block-row="a"] [contenteditable]') as HTMLElement;
        act(() => { ed.focus(); ed.textContent = '[['; ed.dispatchEvent(new InputEvent('input', { bubbles: true })); });
        expect(container.querySelector('[data-block-row="a"] [role="combobox"]')).toBeTruthy();   // 고르기 칸
        expect(container.querySelector('[data-block-row="a"] [contenteditable]')).toBeNull();
    });
});
