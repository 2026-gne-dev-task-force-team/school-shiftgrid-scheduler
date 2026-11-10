// @vitest-environment jsdom
/** C2 — 휴지통에 든 컬렉션은 표를 그리지 않고 시작 화면으로 간다(페이지·시트·시간표와 같은 동작). */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NodesApi, PublicNode } from '../../../pane-ui-system/core/nodes/contracts/nodes';
import { DB_TYPE, initRecordNodes, setActiveDb } from '../nodes';
import { blankDb } from '../schema';
import { DbView } from './DbView';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let hostEl: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); hostEl?.remove(); root = null; hostEl = null; initRecordNodes(null); setActiveDb(null); });

function fake(trashed: Set<string>) {
    const node = { id: 'db1', type: DB_TYPE, name: '내 컬렉션', data: blankDb() } as unknown as PublicNode;
    const subs = new Set<(ids: string[]) => void>();
    const api = {
        get: (id: string) => (id === 'db1' ? node : undefined),
        children: () => [], parent: () => null, roots: { main: 'root', trash: 'trash' },
        byType: () => [node], liveByType: () => (trashed.has('db1') ? [] : [node]),
        isTrashed: (id: string) => trashed.has(id),
        Frame: ({ children }: { children: React.ReactNode }) => <div data-frame>{children}</div>,
        subscribe: (fn: (ids: string[]) => void) => { subs.add(fn); return { dispose() { subs.delete(fn); } }; },
        cmd: { undo: 'explorer.undo', redo: 'explorer.redo' },
    } as unknown as NodesApi;
    return { api, notify: () => subs.forEach((f) => f([])) };
}

describe('DbView — 휴지통 컬렉션 (C2)', () => {
    it('열려 있던 컬렉션이 휴지통으로 가면 표가 사라지고 시작 화면이 뜬다', () => {
        const trashed = new Set<string>();
        const { api, notify } = fake(trashed);
        initRecordNodes(api);
        setActiveDb('db1');
        hostEl = document.createElement('div'); document.body.appendChild(hostEl);
        root = createRoot(hostEl);
        act(() => { root!.render(<DbView host={{ commands: { run: vi.fn() } } as never} peek={{} as never} leaf={{ id: 'L1' } as never} width={800} height={600} collapsed={false} />); });
        expect(hostEl.querySelector('[data-rv-db="db1"]')).not.toBeNull();
        trashed.add('db1');
        act(() => { notify(); });
        expect(hostEl.querySelector('[data-rv-db]')).toBeNull();
        expect(hostEl.textContent).toContain('새 컬렉션');
    });
});
