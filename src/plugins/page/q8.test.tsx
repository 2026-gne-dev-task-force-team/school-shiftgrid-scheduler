// @vitest-environment jsdom
/**
 * Q8 — 하위 페이지 줄(V5): 페이지 밑 페이지가 본문에 줄로 나타나고, 줄을 지우면 페이지도 휴지통으로 간다.
 *       터치 끌기(V3): 손잡이를 길게 눌렀다 끌면 블록 순서가 바뀐다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PageView } from './views/PageView';
import { setActivePage } from './store';
import { initPageNodes, savePage } from './nodes';
import type { NodesApi, PublicNode } from '../../pane-ui-system/core/nodes/contracts/nodes';
import { frameHost, notices } from './test-frame-host';
import { undoBlocksRemoved, blocksRemovedUndoable } from './removed';
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
    byType: () => [],
    liveByType: () => [],
    isTrashed: (id: string) => { for (let p: string | null | undefined = id; p; p = store.get(p)?.parent) if (p === 'trash') return true; return false; },   // 정식 판정 흉내(자기·조상이 휴지통)
    roots: { main: 'main', trash: 'trash' },
} as unknown as NodesApi;

let root: Root; let container: HTMLDivElement;
beforeEach(() => { calls.remove = []; calls.move = []; calls.open = []; });
afterEach(() => { act(() => root.unmount()); container.remove(); setActivePage(null); store.clear(); document.body.innerHTML = ''; vi.useRealTimers(); });

function seed(page: Page, kids: string[] = []) {
    store.set('main', { id: 'main', type: 'folder', name: '', children: ['p1'], parent: null });
    store.set('trash', { id: 'trash', type: 'trash', name: '', children: [], parent: null });
    store.set('p1', { id: 'p1', type: 'page.page', name: '부모', children: kids, parent: 'main', body: page });
    for (const k of kids) store.set(k, { id: k, type: 'page.page', name: `아이 ${k}`, children: [], parent: 'p1' });
}
function open() {
    initPageNodes(fakeNodes);
    act(() => { setActivePage('p1'); });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(<PageView host={frameHost(fakeNodes)} />); });
}
const rowsText = () => [...container.querySelectorAll('[data-block-row]')].map((r) => r.getAttribute('data-block-row'));

describe('하위 페이지 줄 (V5)', () => {
    it('페이지 밑 페이지가 있으면 본문에 줄로 나타난다 — 누르면 그 페이지가 열린다', () => {
        seed({ blocks: [{ id: 'a', type: 'paragraph', text: '글' }] }, ['c1', 'c2']);
        open();
        const links = [...container.querySelectorAll('[data-child-page]')] as HTMLElement[];
        expect(links.map((l) => l.getAttribute('data-child-page'))).toEqual(['c1', 'c2']);
        expect(links[0].textContent).toContain('아이 c1');
        act(() => { links[1].click(); });
        expect(calls.open).toEqual(['c2']);
    });
    it('줄 메뉴에는 종류 바꾸기·복제가 없고 「삭제(페이지도 휴지통으로)」가 있다', () => {
        seed({ blocks: [{ id: 'k', type: 'childpage', text: '', nodeId: 'c1' }] }, ['c1']);
        open();
        act(() => { (container.querySelector('[aria-label="블록 손잡이"]') as HTMLElement).click(); });
        const items = [...document.querySelectorAll('[role="menuitem"]')].map((x) => x.textContent);
        expect(items).toEqual(['위로', '아래로', '삭제']);
    });
    it('줄을 지우면 그 페이지도 휴지통으로 — 다른 자식은 그대로', () => {
        seed({ blocks: [{ id: 'k1', type: 'childpage', text: '', nodeId: 'c1' }, { id: 'k2', type: 'childpage', text: '', nodeId: 'c2' }] }, ['c1', 'c2']);
        open();
        act(() => { (container.querySelector('[data-block-row="k1"] [aria-label="블록 손잡이"]') as HTMLElement).click(); });
        act(() => { ([...document.querySelectorAll('[role="menuitem"]')].find((x) => x.textContent?.startsWith('삭제')) as HTMLElement).click(); });
        expect(calls.remove).toEqual(['c1']);
        expect(store.get('c1')!.parent).toBe('trash');
        expect(container.querySelector('[data-child-page="c1"]')).toBeNull();
        expect(container.querySelector('[data-child-page="c2"]')).toBeTruthy();
    });
    it('줄 메뉴로 지우면 「되돌리기」 알림이 뜨고, 눌러 되돌리면 줄과 페이지가 돌아온다 · 뒤에 다른 편집이 쌓이면 회색', () => {
        seed({ blocks: [{ id: 'k1', type: 'childpage', text: '', nodeId: 'c1' }, { id: 'a', type: 'paragraph', text: '글' }] }, ['c1']);
        open();
        act(() => { (container.querySelector('[data-block-row="k1"] [aria-label="블록 손잡이"]') as HTMLElement).click(); });
        act(() => { ([...document.querySelectorAll('[role="menuitem"]')].find((x) => x.textContent?.startsWith('삭제')) as HTMLElement).click(); });
        expect(notices).toHaveLength(1);
        expect(notices[0].title).toContain('삭제했습니다');
        expect(notices[0].action?.commandId).toBe('page.undoRemoved');
        expect(blocksRemovedUndoable()).toBe(true);
        act(() => { undoBlocksRemoved(); });
        expect(container.querySelector('[data-child-page="c1"]')).toBeTruthy();
        expect(store.get('c1')!.parent).toBe('p1');
    });
    it('저장된 본문에 줄이 있는 채 그 페이지가 다른 곳으로 옮겨 가 있으면 줄은 안 보이고, 저장해도 그 페이지를 지우지 않는다', () => {
        seed({ blocks: [{ id: 'a', type: 'paragraph', text: '글' }, { id: 'k', type: 'childpage', text: '', nodeId: 'moved' }] }, []);
        store.set('moved', { id: 'moved', type: 'page.page', name: '옮겨 간 것', children: [], parent: 'main' });
        open();
        expect(container.querySelector('[data-child-page]')).toBeNull();
        savePage('p1', { blocks: [{ id: 'a', type: 'paragraph', text: '글2' }] });
        expect(calls.remove).toEqual([]);
    });
    it('savePage: 되돌리기로 줄이 돌아오면 휴지통의 그 페이지도 이 페이지 밑으로 돌아온다', () => {
        seed({ blocks: [{ id: 'k', type: 'childpage', text: '', nodeId: 'c1' }] }, ['c1']);
        open();
        savePage('p1', { blocks: [{ id: 'a', type: 'paragraph', text: '' }] });   // 줄을 지운 저장
        expect(store.get('c1')!.parent).toBe('trash');
        savePage('p1', { blocks: [{ id: 'k', type: 'childpage', text: '', nodeId: 'c1' }] });   // 되돌린 저장
        expect(calls.move).toEqual([['c1', 'p1']]);
        expect(store.get('c1')!.parent).toBe('p1');
    });
});

describe('터치 끌기 (V3)', () => {
    const touch = (el: Element, type: string, y: number) => {
        const e = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(e, 'pointerType', { value: 'touch' });
        Object.defineProperty(e, 'pointerId', { value: 7 });
        Object.defineProperty(e, 'clientX', { value: 5 });
        Object.defineProperty(e, 'clientY', { value: y });
        act(() => { el.dispatchEvent(e); });
    };
    const layout = () => [...container.querySelectorAll<HTMLElement>('[data-block-row]')].forEach((r, i) => {
        r.getBoundingClientRect = () => ({ top: i * 40, height: 40, bottom: i * 40 + 40, left: 0, right: 100, width: 100, x: 0, y: i * 40, toJSON() { return {}; } });
    });
    const three: Page = { blocks: [{ id: 'a', type: 'paragraph', text: 'A' }, { id: 'b', type: 'paragraph', text: 'B' }, { id: 'c', type: 'paragraph', text: 'C' }] };

    it('손잡이를 길게(350ms) 누르고 아래로 끌어 놓으면 그 자리로 옮겨진다', () => {
        vi.useFakeTimers();
        seed(three);
        open();
        layout();
        const handle = container.querySelector('[data-block-row="a"] [aria-label="블록 손잡이"]')!;
        expect(handle.className).toContain('touch-none');   // 손잡이에서 시작한 터치는 스크롤이 가로채지 않는다
        touch(handle, 'pointerdown', 20);
        act(() => { vi.advanceTimersByTime(400); });
        touch(handle, 'pointermove', 60);
        touch(handle, 'pointermove', 90);   // c(80~120) 위쪽 절반 = c 앞
        touch(handle, 'pointerup', 90);
        expect(rowsText()).toEqual(['b', 'a', 'c']);
    });
    it('길게 누르지 않고 움직이면(스크롤) 아무것도 안 옮긴다', () => {
        vi.useFakeTimers();
        seed(three);
        open();
        layout();
        const handle = container.querySelector('[data-block-row="a"] [aria-label="블록 손잡이"]')!;
        touch(handle, 'pointerdown', 20);
        touch(handle, 'pointermove', 100);
        act(() => { vi.advanceTimersByTime(400); });
        touch(handle, 'pointerup', 100);
        expect(rowsText()).toEqual(['a', 'b', 'c']);
    });
    it('끌기가 끝난 뒤 따라오는 click 은 메뉴를 열지 않는다', () => {
        vi.useFakeTimers();
        seed(three);
        open();
        layout();
        const handle = container.querySelector('[data-block-row="a"] [aria-label="블록 손잡이"]') as HTMLElement;
        touch(handle, 'pointerdown', 20);
        act(() => { vi.advanceTimersByTime(400); });
        touch(handle, 'pointermove', 60);
        touch(handle, 'pointerup', 130);
        act(() => { handle.click(); });
        expect(document.querySelector('[role="menu"]')).toBeNull();
    });
});
