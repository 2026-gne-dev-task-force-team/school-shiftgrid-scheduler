// @vitest-environment jsdom
/**
 * R3-E 끼우기 두 모양 — 링크 카드(card · 기본) / 본문 펼침(inline). 노션 「링크로 / 인라인으로」 전환과 같은 결.
 *   전환 저장·불러오기 · inline 렌더(nodes.Embed 에 view 'inline') · 자기·조상 끼움 차단 · 옛 card 블록 호환 · 페이지 펼침 미리보기.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PageView } from './views/PageView';
import { NodeBlock } from './views/NodeBlock';
import { PageCard } from './views/PageCard';
import { setActivePage } from './store';
import { initPageNodes, inlineBlocked, pageViewOf } from './nodes';
import { changeType, setNodeDisplay } from './core/blocks';
import type { EmbedProps, NodesApi, PublicNode } from '../../pane-ui-system/core/nodes/contracts/nodes';
import { frameHost } from './test-frame-host';
import type { Page } from './core/types';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type N = { id: string; type: string; name: string; children: string[]; body?: unknown; parent: string | null };
const store = new Map<string, N>();
/** 가짜 nodes.Embed — 받은 view 를 DOM 에 적는다(약속 창구로 무엇이 갔나를 잰다). */
const Embed = ({ nodeId, view }: EmbedProps) => <div data-embed={nodeId} data-view={view ?? 'card'}>{store.get(nodeId)?.name}</div>;
const fakeNodes = {
    version: 1,
    get: (id: string) => store.get(id) as unknown as PublicNode | undefined,
    children: (id: string) => (store.get(id)?.children ?? []).map((c) => store.get(c)) as unknown as PublicNode[],
    parent: (id: string) => store.get(id)?.parent ?? null,
    setBody: (id: string, body: unknown) => { const n = store.get(id); if (n) n.body = JSON.parse(JSON.stringify(body)); },
    remove: () => {}, move: () => {}, open: () => {},
    batch: (fn: () => void) => fn(),
    subscribe: () => ({ dispose() {} }),
    find: () => [], byType: () => [], liveByType: () => [],
    isTrashed: () => false,
    roots: { main: 'main', trash: 'trash' },
    Embed,
} as unknown as NodesApi;

let root: Root | null = null; let container: HTMLDivElement | null = null;
afterEach(() => { act(() => root?.unmount()); container?.remove(); root = null; container = null; setActivePage(null); store.clear(); initPageNodes(null); document.body.innerHTML = ''; });

/** main ─ top(페이지) ─ p1(페이지) · main ─ c1(컬렉션) */
function seed(page: Page) {
    store.set('main', { id: 'main', type: 'folder', name: '', children: ['top', 'c1'], parent: null });
    store.set('top', { id: 'top', type: 'page.page', name: '윗', children: ['p1'], parent: 'main', body: { blocks: [{ id: 't1', type: 'paragraph', text: '윗 본문' }] } });
    store.set('p1', { id: 'p1', type: 'page.page', name: '본', children: [], parent: 'top', body: page });
    store.set('c1', { id: 'c1', type: 'collection.db', name: '명단', children: [], parent: 'main' });
}
function render(el: React.ReactElement) {
    container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root!.render(el); });
}
function openPage() {
    initPageNodes(fakeNodes);
    act(() => { setActivePage('p1'); });
    render(<PageView host={frameHost(fakeNodes)} />);
}
const nodeBlock = (nodeId: string, display?: 'inline'): Page['blocks'][number] => ({ id: 'n1', type: 'node', text: '', nodeId, ...(display ? { display } : {}) });
const embedView = () => container!.querySelector('[data-embed]')?.getAttribute('data-view');
const clickText = (label: string) => {
    const item = [...document.querySelectorAll('[role="menuitem"]')].find((e) => e.textContent?.includes(label)) as HTMLElement | undefined;
    expect(item, label).toBeTruthy();
    act(() => { item!.click(); });
};
const menuItem = (label: string) => [...document.querySelectorAll('[role="menuitem"]')].find((e) => e.textContent?.includes(label)) as HTMLButtonElement | undefined;
const openHandleMenu = () => act(() => { (container!.querySelector('[aria-label="블록 손잡이"]') as HTMLElement).click(); });

describe('core — 표시 모양 칸', () => {
    it('inline 은 칸을 적고 card 는 칸을 지운다(옛 블록과 같은 모양) · 종류 바꾸기에도 남는다 · node 아닌 블록은 그대로', () => {
        const p: Page = { blocks: [nodeBlock('c1'), { id: 'x', type: 'paragraph', text: '글' }] };
        const a = setNodeDisplay(p, 'n1', 'inline');
        expect(a.blocks[0].display).toBe('inline');
        expect(changeType(a, 'n1', 'node').blocks[0].display).toBe('inline');
        const b = setNodeDisplay(a, 'n1', 'card');
        expect('display' in b.blocks[0]).toBe(false);
        expect(b.blocks[0]).toEqual(p.blocks[0]);
        expect(setNodeDisplay(p, 'x', 'inline')).toBe(p);
    });
});

describe('페이지 화면 — 블록 메뉴로 전환 · 저장·불러오기', () => {
    it('옛 card 블록(칸 없음)은 카드로 그린다 · 「본문에 펼치기」 → 저장본에 inline · 다시 열어도 펼침 · 「링크 카드로」 → 칸이 빠진다', () => {
        seed({ blocks: [nodeBlock('c1')] });
        openPage();
        expect(embedView()).toBe('card');
        openHandleMenu();
        expect(menuItem('링크 카드로')!.disabled).toBe(true);   // 지금 모양은 흐리게
        clickText('본문에 펼치기');
        expect((store.get('p1')!.body as Page).blocks[0].display).toBe('inline');
        expect(embedView()).toBe('inline');
        expect(container!.querySelector('[data-node-inline="c1"]')).toBeTruthy();
        // 불러오기 — 저장본에서 다시 그린다
        act(() => root!.unmount()); container!.remove();
        openPage();
        expect(pageViewOf('p1').blocks[0].display).toBe('inline');
        expect(embedView()).toBe('inline');
        openHandleMenu();
        clickText('링크 카드로');
        expect('display' in (store.get('p1')!.body as Page).blocks[0]).toBe(false);
        expect(embedView()).toBe('card');
    });
    it('조상(윗 페이지)을 끼운 블록은 「본문에 펼치기」가 막혀 있다', () => {
        seed({ blocks: [nodeBlock('top')] });
        openPage();
        openHandleMenu();
        expect(menuItem('본문에 펼치기')!.disabled).toBe(true);
    });
});

describe('NodeBlock — 무한 끼움 막기', () => {
    it('inlineBlocked: 자기 자신·부모·조부모는 참 · 형제·남은 거짓', () => {
        seed({ blocks: [] }); initPageNodes(fakeNodes);
        expect(inlineBlocked('p1', 'p1')).toBe(true);
        expect(inlineBlocked('top', 'p1')).toBe(true);
        expect(inlineBlocked('main', 'p1')).toBe(true);
        expect(inlineBlocked('c1', 'p1')).toBe(false);
    });
    it('저장본이 자기·조상을 inline 으로 들고 있어도(옛 자료·옮긴 뒤) 카드로 물러서고 안내를 단다', () => {
        seed({ blocks: [] }); initPageNodes(fakeNodes);
        render(<NodeBlock nodeId="top" display="inline" selfId="p1" onPick={() => {}} />);
        expect(embedView()).toBe('card');
        expect(container!.querySelector('[data-node-inline-blocked]')).toBeTruthy();
        expect(container!.querySelector('[data-node-inline]')).toBeNull();
    });
});

describe('페이지 펼침 미리보기(PageCard view inline)', () => {
    it('본문 줄을 서식째 보이고 · 안쪽 끼움은 다시 펼치지 않고 이름 한 줄', () => {
        seed({ blocks: [{ id: 'h', type: 'heading1', text: '머리' }, { id: 'b', type: 'bulleted', text: '**굵게**', indent: 0 }, nodeBlock('c1', 'inline')] });
        initPageNodes(fakeNodes);
        render(<PageCard nodeId="p1" view="inline" />);
        const box = container!.querySelector('[data-page-inline="p1"]')!;
        expect(box.textContent).toContain('머리');
        expect(box.querySelector('strong')?.textContent).toBe('굵게');
        expect(box.textContent).toContain('명단');
        expect(box.querySelector('[data-embed]')).toBeNull();
    });
    it('view 없으면 옛 카드 그대로(첫 글 한 줄)', () => {
        seed({ blocks: [{ id: 'a', type: 'paragraph', text: '첫 글' }] });
        initPageNodes(fakeNodes);
        render(<PageCard nodeId="p1" />);
        expect(container!.querySelector('[data-page-inline]')).toBeNull();
        expect(container!.textContent).toContain('첫 글');
    });
});
