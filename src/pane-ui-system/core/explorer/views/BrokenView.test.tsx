// @vitest-environment jsdom
/** 깨진 항목 열기 화면 — 무엇이 잘못됐는지 + 「휴지통으로 보내기」 단추(QA Q21). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PluginHost } from '../../../plugin';
import type { Leaf } from '../../../layout/tree';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const kv = vi.hoisted(() => {
    const store = new Map<string, Record<string, unknown>>();
    return {
        store,
        nodesGetAll: vi.fn(async (): Promise<unknown[] | null> => [...store.values()]),
        nodesWrite: vi.fn(async () => true),
    };
});
vi.mock('../../../kv', () => ({ nodesGetAll: kv.nodesGetAll, nodesWrite: kv.nodesWrite }));

import { initStore, getState } from '../../node-store/store';
import { __resetPersistForTest } from '../../node-store/persist';
import { BrokenView } from './BrokenView';

const host = {
    notify: Object.assign(() => 'n', { dismiss: () => {} }),
    storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
    store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
} as unknown as PluginHost;

let root: Root; let box: HTMLDivElement;
beforeEach(async () => {
    kv.store.clear();
    kv.store.set('root', { id: 'root', type: 'folder', name: '루트', children: ['bt'] });
    kv.store.set('trash', { id: 'trash', type: 'folder', name: '휴지통', children: [] });
    kv.store.set('bt', { id: 'bt', type: null, name: '깨짐', children: [] });
    kv.store.set('__meta', { id: '__meta', root: 'root', trash: 'trash', rev: 0 });
    __resetPersistForTest();
    await initStore(host);
    box = document.createElement('div'); document.body.appendChild(box); root = createRoot(box);
});
afterEach(() => { act(() => root.unmount()); box.remove(); __resetPersistForTest(); });

describe('BrokenView', () => {
    it('까닭 한 줄과 단추가 보이고, 누르면 휴지통으로 간다', async () => {
        act(() => { root.render(<BrokenView leaf={{ id: 'l1', params: { nodeId: 'bt' } } as unknown as Leaf} />); });
        expect(box.textContent).toContain('자료가 깨져 열 수 없습니다');
        expect(box.textContent).toContain('type 없음');
        const btn = Array.from(box.querySelectorAll('button')).find((b) => b.textContent?.includes('휴지통으로 보내기'))!;
        act(() => { btn.click(); });
        expect(getState().tree.nodes.trash.children).toContain('bt');
        expect(box.textContent).toContain('휴지통에 있는 깨진 항목');
    });
});
