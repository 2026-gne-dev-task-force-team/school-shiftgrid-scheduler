// @vitest-environment jsdom
/**
 * 회귀 — 보고 있던 시간표가 휴지통으로 가면 GridTab 은 시작 화면으로 돌아온다(죽은 표에 갇히지 않는다).
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { NodesApi } from '../../explorer/contracts/nodes';
import { initGridNodes, SHEET_TYPE } from '../nodes';
import { setActiveSheet } from '../store';
import { GridTab } from './GridTab';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => { act(() => { root?.unmount(); }); root = null; document.body.innerHTML = ''; setActiveSheet(null); });

describe('GridTab 휴지통 회귀', () => {
    it('시간표를 보다가 휴지통으로 가면 시작 화면(새 시간표 단추)이 뜬다', () => {
        let trashed = false;
        const subs = new Set<() => void>();
        const node = { id: 's1', type: SHEET_TYPE, name: '시간표', data: undefined };
        const api = {
            roots: { main: 'm', trash: 't' },
            byType: () => [node], liveByType: () => (trashed ? [] : [node]),
            get: () => node, parent: () => 'm',
            isTrashed: () => trashed,
            subscribe: (fn: () => void) => { subs.add(fn); return { dispose() { subs.delete(fn); } }; },
            Frame: ({ children }: { children: React.ReactNode }) => <div data-testid="frame">{children}</div>,
        } as unknown as NodesApi;
        initGridNodes(api);
        setActiveSheet('s1');
        const host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
        act(() => { root!.render(<GridTab />); });
        expect(document.querySelector('[data-testid="frame"]')).not.toBeNull();

        trashed = true;
        act(() => { for (const s of subs) s(); });
        expect(document.querySelector('[data-testid="frame"]')).toBeNull();
        expect(document.body.textContent).toContain('새 시간표');
    });
});
