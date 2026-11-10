// @vitest-environment jsdom
/** 휴지통에 든 시트는 편집 화면(Frame) 대신 시작 화면을 보여 준다 — 판정은 nodes.isTrashed (R5-8 회귀). */
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TableNodeView } from './TableNodeView';
import { setActiveTable } from '../store';
import { initTableNodes, TABLE_TYPE, blankTable } from '../nodes';
import type { NodesApi, PublicNode } from '../../../pane-ui-system/core/nodes/contracts/nodes';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const trashed = new Set<string>();
const store = new Map<string, { id: string; type: string; name: string; children: string[]; data?: unknown }>();
const fake = {
    version: 1,
    get: (id: string) => store.get(id) as unknown as PublicNode | undefined,
    subscribe: () => ({ dispose() {} }),
    byType: (t: string) => [...store.values()].filter((n) => n.type === t) as unknown as PublicNode[],
    liveByType: (t: string) => [...store.values()].filter((n) => n.type === t && !trashed.has(n.id)) as unknown as PublicNode[],
    isTrashed: (id: string) => trashed.has(id),
    parent: () => null,
    children: () => [],
    batch: (fn: () => void) => fn(),
    roots: { main: 'main', trash: 'trash' },
    Frame: ({ children }: { children: unknown }) => <div data-testid="frame">{typeof children === 'function' ? null : (children as never)}</div>,
} as unknown as NodesApi;

let root: Root; let container: HTMLDivElement;
afterEach(() => { act(() => root.unmount()); container.remove(); setActiveTable(null); store.clear(); trashed.clear(); });

function render() {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(<TableNodeView />); });
}

describe('TableNodeView — 휴지통 판정', () => {
    it('휴지통 밖 시트는 틀(Frame)로 그린다', () => {
        store.set('s1', { id: 's1', type: TABLE_TYPE, name: 'S', children: [], data: blankTable() });
        initTableNodes(fake);
        act(() => { setActiveTable('s1'); });
        render();
        expect(container.querySelector('[data-testid="frame"]')).not.toBeNull();
    });

    it('휴지통에 든 시트는 시작 화면(새 시트)을 보여 준다', () => {
        store.set('s2', { id: 's2', type: TABLE_TYPE, name: '버린 시트', children: [], data: blankTable() });
        trashed.add('s2');
        initTableNodes(fake);
        act(() => { setActiveTable('s2'); });
        render();
        expect(container.querySelector('[data-testid="frame"]')).toBeNull();
        expect(container.textContent).toContain('새 시트');
    });
});
