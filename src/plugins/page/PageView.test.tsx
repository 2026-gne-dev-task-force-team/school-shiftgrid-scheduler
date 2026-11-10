// @vitest-environment jsdom
/**
 * 편집 화면 통합 — 노드 다리에 페이지를 얹고 뷰가 블록을 그리는지, 표 약속이 없을 때
 *   읽기 전용 표로 버티는지(최소 대체)를 본다. 깊은 contentEditable 조작은 jsdom 이 약하니
 *   「됐다」의 뼈대(모델·키·마크다운)는 core 테스트가 박고, 여기선 뷰가 뜨는지를 본다.
 */
import { setPlatform } from '../../pane-ui-system/platform-keys';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PageView } from './views/PageView';
import { setActivePage } from './store';
import { initPageNodes } from './nodes';
import type { NodesApi, PublicNode } from '../../pane-ui-system/core/nodes/contracts/nodes';
import { frameHost } from './test-frame-host';
import type { Page } from './core/types';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const trashed = new Set<string>();
const store = new Map<string, { id: string; type: string; name: string; children: string[]; body?: unknown }>();
const fakeNodes = {
    version: 1,
    get: (id: string) => store.get(id) as unknown as PublicNode | undefined,
    setBody: (id: string, body: unknown) => { const n = store.get(id); if (n) n.body = body; },
    subscribe: () => ({ dispose() {} }),
    // 시작 화면(StartScreen)이 쓰는 최소 표면 — 타입별 목록·부모·루트.
    byType: (type: string) => [...store.values()].filter((n) => n.type === type) as unknown as PublicNode[],
    parent: () => null,
    children: () => [],   // Q8: 본문의 하위 페이지 줄을 맞추느라 자식을 묻는다 — 이 테스트의 페이지엔 자식이 없다
    batch: (fn: () => void) => fn(),
    isTrashed: (id: string) => trashed.has(id),   // R5-8 정식 휴지통 판정 — 기본은 휴지통 밖
    liveByType: (type: string) => [...store.values()].filter((n) => n.type === type) as unknown as PublicNode[],
    roots: { main: 'main', trash: 'trash' },
} as unknown as NodesApi;

const host = frameHost(fakeNodes);   // table 약속 없음 → 읽기 전용 표

let root: Root; let container: HTMLDivElement;
afterEach(() => { act(() => root.unmount()); container.remove(); setActivePage(null); store.clear(); trashed.clear(); });

function render() {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(<PageView host={host} />); });
}

describe('PageView 통합', () => {
    it('페이지가 없으면 안내를 보여 준다', () => {
        setActivePage(null);
        initPageNodes(fakeNodes);
        render();
        expect(container.textContent).toContain('새 노트');
    });

    it('휴지통에 든 페이지는 편집 화면 대신 시작 화면을 보여 준다(nodes.isTrashed)', () => {
        store.set('pt', { id: 'pt', type: 'page.page', name: '버린 페이지', children: [], body: { blocks: [{ id: 'p', type: 'paragraph', text: '비밀 본문' }] } });
        trashed.add('pt');
        initPageNodes(fakeNodes);
        act(() => { setActivePage('pt'); });
        render();
        expect(container.querySelector('input[aria-label="페이지 제목"]')).toBeNull();
        expect(container.textContent).not.toContain('비밀 본문');
        expect(container.textContent).toContain('새 노트');
    });

    it('페이지를 열면 블록 글자가 보이고, 표 약속이 없으면 읽기 전용 표로 버틴다', () => {
        const page: Page = {
            blocks: [
                { id: 'h', type: 'heading1', text: '안녕하세요' },
                { id: 'p', type: 'paragraph', text: '첫 문단' },
                {
                    id: 't', type: 'table', text: '',
                    table: { columns: [{ key: 'c1', title: '이름' }], rows: [{ id: 'r1', cells: { c1: '값하나' } }] },
                },
            ],
        };
        store.set('p1', { id: 'p1', type: 'page.page', name: '테스트 페이지', children: [], body: page });
        initPageNodes(fakeNodes);
        act(() => { setActivePage('p1'); });
        render();

        expect((container.querySelector('input[aria-label="페이지 제목"]') as HTMLInputElement).value).toBe('테스트 페이지');   // 제목줄(노드 이름 = 틀 머리의 제목 칸)
        expect(container.textContent).toContain('안녕하세요');
        expect(container.textContent).toContain('첫 문단');
        expect(container.textContent).toContain('이름');           // 표 머리
        expect(container.textContent).toContain('값하나');         // 표 칸(읽기 전용 대체)
        expect(container.querySelector('table')).not.toBeNull();   // 읽기 전용 HTML 표
    });

    // ── Q9 W3 — 여러 블록 고르기 ──
    const open3 = () => {
        const page: Page = { blocks: [
            { id: 'a', type: 'paragraph', text: '가' },
            { id: 'b', type: 'paragraph', text: '나' },
            { id: 'c', type: 'paragraph', text: '다' },
        ] };
        store.set('p3', { id: 'p3', type: 'page.page', name: 'P', children: [], body: page });
        initPageNodes(fakeNodes);
        act(() => { setActivePage('p3'); });
        render();
    };
    const rows = () => [...container.querySelectorAll<HTMLElement>('[data-block-row]')];
    const key = (el: Element, k: string, init: KeyboardEventInit = {}) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...init })); });
    const bodyIds = () => ((store.get('p3')!.body as Page).blocks.map((b) => b.id));

    it('Esc 로 블록을 고르고 Backspace 로 지운다 · 저장된다', () => {
        open3();
        const tb = rows()[1].querySelector('[role="textbox"]')!;
        key(tb, 'Escape');
        expect(rows().map((r) => r.getAttribute('aria-selected'))).toEqual([null, 'true', null]);
        key(container.querySelector('[tabindex="-1"]')!, 'Backspace');
        expect(rows()).toHaveLength(2);
        expect(bodyIds()).toEqual(['a', 'c']);
    });

    it('Shift+클릭으로 범위를 고르고 Esc 로 풀린다', () => {
        open3();
        act(() => { rows()[0].querySelector('[role="textbox"]')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); });
        const tb0 = rows()[0].querySelector<HTMLElement>('[role="textbox"]')!;
        act(() => { tb0.focus(); });
        act(() => { rows()[2].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, shiftKey: true, button: 0 })); });
        expect(rows().map((r) => r.getAttribute('aria-selected'))).toEqual(['true', 'true', 'true']);
        key(container.querySelector('[tabindex="-1"]')!, 'Escape');
        expect(rows().map((r) => r.getAttribute('aria-selected'))).toEqual([null, null, null]);
    });

    it('고른 뒤 ⌘Z 로 되돌린다(기존 더미)', () => {
        open3();
        key(rows()[0].querySelector('[role="textbox"]')!, 'Escape');
        const root = container.querySelector('[tabindex="-1"]')!;
        key(root, 'Backspace');
        expect(bodyIds()).toEqual(['b', 'c']);
        key(container.querySelector('[role="textbox"]')!, 'z', { metaKey: true });
        expect(bodyIds()).toEqual(['a', 'b', 'c']);
    });

    // ── R5-7 — 고른 블록 상태의 키: 공통 undoKey · ⌘X 는 클립보드 쓰기가 끝난 뒤에만 지운다 ──
    it('고른 뒤 ⌘Z 로 되돌리고 Ctrl+Y 로 다시 한다(공통 undoKey) · 조합 중엔 안 받는다', () => {
        setPlatform('win');   // Ctrl 이 Mod — 윈도우 흉내(W14)
        open3();
        key(rows()[0].querySelector('[role="textbox"]')!, 'Escape');
        key(container.querySelector('[tabindex="-1"]')!, 'Backspace');
        expect(bodyIds()).toEqual(['b', 'c']);
        const tb = () => container.querySelector('[role="textbox"]')!;
        key(tb(), 'z', { ctrlKey: true, isComposing: true });
        expect(bodyIds()).toEqual(['b', 'c']);
        key(tb(), 'z', { ctrlKey: true });
        expect(bodyIds()).toEqual(['a', 'b', 'c']);
        key(tb(), 'y', { ctrlKey: true });
        expect(bodyIds()).toEqual(['b', 'c']);
    });

    it('⌘X — 클립보드 쓰기가 끝나기 전엔 지우지 않고, 끝나면 지운다 · 쓰기가 막히면 지우지 않는다', async () => {
        const orig = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
        let done!: () => void;
        const write = vi.fn(() => new Promise<void>((res) => { done = res; }));
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
        try {
            open3();
            key(rows()[1].querySelector('[role="textbox"]')!, 'Escape');
            key(container.querySelector('[tabindex="-1"]')!, 'x', { metaKey: true });
            expect(write).toHaveBeenCalledTimes(1);
            expect(bodyIds()).toEqual(['a', 'b', 'c']);   // 아직 안 지운다
            await act(async () => { done(); await Promise.resolve(); });
            expect(bodyIds()).toEqual(['a', 'c']);

            // 쓰기 실패 → 글이 남는다
            write.mockImplementationOnce(() => Promise.reject(new Error('denied')));
            key(rows()[0].querySelector('[role="textbox"]')!, 'Escape');
            key(container.querySelector('[tabindex="-1"]')!, 'x', { metaKey: true });
            await act(async () => { await Promise.resolve(); await Promise.resolve(); });
            expect(bodyIds()).toEqual(['a', 'c']);
        } finally {
            if (orig) Object.defineProperty(navigator, 'clipboard', orig); else delete (navigator as unknown as Record<string, unknown>).clipboard;
        }
    });
});
