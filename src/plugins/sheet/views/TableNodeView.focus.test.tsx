// @vitest-environment jsdom
/** V6 #7 — 새 시트를 열면 첫 칸(A1)이 선택되고 격자(키 받는 요소)가 초점을 받아, 바로 화살표 키가 칸을 움직인다. */
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TableNodeView } from './TableNodeView';
import { setActiveTable } from '../store';
import { initTableNodes, TABLE_TYPE, blankTable } from '../nodes';
import { focusWhenReady } from '../../../pane-ui-system';
import type { NodesApi, PublicNode } from '../../explorer/contracts/nodes';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const store = new Map<string, { id: string; type: string; name: string; children: string[]; data?: unknown }>();
const fake = {
    version: 1,
    get: (id: string) => store.get(id) as unknown as PublicNode | undefined,
    subscribe: () => ({ dispose() {} }),
    byType: (t: string) => [...store.values()].filter((n) => n.type === t) as unknown as PublicNode[],
    liveByType: (t: string) => [...store.values()].filter((n) => n.type === t) as unknown as PublicNode[],
    isTrashed: () => false,
    parent: () => null,
    children: () => [],
    batch: (fn: () => void) => fn(),
    roots: { main: 'main', trash: 'trash' },
    Frame: ({ children }: { children: unknown }) => <div data-testid="frame">{children as never}</div>,
} as unknown as NodesApi;

let root: Root; let container: HTMLDivElement;
afterEach(() => { act(() => root.unmount()); container.remove(); setActiveTable(null); store.clear(); });

describe('새 시트 초점', () => {
    it('열린 직후 격자가 초점을 받고 A1 이 선택돼 있다 · 화살표가 칸을 옮긴다', async () => {
        store.set('s1', { id: 's1', type: TABLE_TYPE, name: 'S', children: [], data: blankTable() });
        initTableNodes(fake);
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        act(() => { root.render(<TableNodeView />); });
        act(() => { setActiveTable('s1'); });
        HTMLElement.prototype.getClientRects = function () { return [{}] as unknown as DOMRectList; };   // jsdom 은 배치가 없다 — 보이는 것으로 친다
        focusWhenReady('[data-testid="table-grid"]');
        await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
        const grid = container.querySelector<HTMLElement>('[data-testid="table-grid"]')!;
        expect(document.activeElement).toBe(grid);
        expect(container.querySelector('[data-rc="0:0"]')?.getAttribute('data-active')).toBe('true');
        act(() => { grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
        expect(container.querySelector('[data-rc="0:1"]')?.getAttribute('data-active')).toBe('true');
    });
});
