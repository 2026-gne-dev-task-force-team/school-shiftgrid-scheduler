// @vitest-environment jsdom
/**
 * 편집 화면 통합 — 노드 다리에 페이지를 얹고 뷰가 블록을 그리는지, 표 약속이 없을 때
 *   읽기 전용 표로 버티는지(최소 대체)를 본다. 깊은 contentEditable 조작은 jsdom 이 약하니
 *   「됐다」의 뼈대(모델·키·마크다운)는 core 테스트가 박고, 여기선 뷰가 뜨는지를 본다.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PageView } from './views/PageView';
import { setActivePage } from './store';
import { initPageNodes } from './nodes';
import type { NodesApi, PublicNode } from '../explorer/contracts/nodes';
import { frameHost } from './test-frame-host';
import type { Page } from './core/types';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const store = new Map<string, { id: string; type: string; name: string; children: string[]; body?: unknown }>();
const fakeNodes = {
    version: 1,
    get: (id: string) => store.get(id) as unknown as PublicNode | undefined,
    setBody: (id: string, body: unknown) => { const n = store.get(id); if (n) n.body = body; },
    subscribe: () => ({ dispose() {} }),
    // 시작 화면(StartScreen)이 쓰는 최소 표면 — 타입별 목록·부모·루트.
    byType: (type: string) => [...store.values()].filter((n) => n.type === type) as unknown as PublicNode[],
    parent: () => null,
    roots: { main: 'main', trash: 'trash' },
} as unknown as NodesApi;

const host = frameHost(fakeNodes);   // table 약속 없음 → 읽기 전용 표

let root: Root; let container: HTMLDivElement;
afterEach(() => { act(() => root.unmount()); container.remove(); setActivePage(null); store.clear(); });

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
        expect(container.textContent).toContain('새 페이지');
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
});
