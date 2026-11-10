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
import type { NodesApi, PublicNode } from '../../pane-ui-system/core/nodes/contracts/nodes';
import { frameHost } from './test-frame-host';
import type { Page } from './core/types';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const store = new Map<string, { id: string; type: string; name: string; children: string[]; body?: unknown }>();
let notifyFn: () => void = () => {};
const fakeNodes = {
    version: 1,
    get: (id: string) => store.get(id) as unknown as PublicNode | undefined,
    setBody: (id: string, body: unknown) => { const n = store.get(id); if (n) n.body = body; },
    subscribe: (fn: () => void) => { notifyFn = fn; return { dispose() {} }; },
    byType: () => [], parent: () => null, children: () => [], batch: (fn: () => void) => fn(),
    isTrashed: () => false, liveByType: () => [], roots: { main: 'main', trash: 'trash' },
} as unknown as NodesApi;
const host = frameHost(fakeNodes);

let root: Root; let container: HTMLDivElement;
afterEach(() => { act(() => root.unmount()); container.remove(); setActivePage(null); store.clear(); });

describe('새로고침 직후 늦게 올라온 본문', () => {
    it('빈 채로 열린 편집기가 저장소가 채워지면 본문을 다시 읽는다', () => {
        store.set('p1', { id: 'p1', type: 'page.page', name: '늦은 노트', children: [] });   // 아직 본문 없음(로딩 전)
        initPageNodes(fakeNodes);
        act(() => { setActivePage('p1'); });
        container = document.createElement('div'); document.body.appendChild(container);
        root = createRoot(container);
        act(() => { root.render(<PageView host={host} />); });
        expect(container.textContent).not.toContain('첫째 블록');
        const page: Page = { blocks: [{ id: 'a', type: 'paragraph', text: '첫째 블록' }, { id: 'b', type: 'paragraph', text: '둘째 블록' }] };
        store.get('p1')!.body = page;
        act(() => { notifyFn(); });
        expect(container.textContent).toContain('첫째 블록');
        expect(container.textContent).toContain('둘째 블록');
    });
});
