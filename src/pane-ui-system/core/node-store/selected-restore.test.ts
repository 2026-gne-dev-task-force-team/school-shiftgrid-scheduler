// @vitest-environment jsdom
/**
 * 고른 노드 복원 — 새로고침하면 탐색기에서 고른 노드(selectedId)가 사라지던 것(QA 맨눈 Q12).
 *   initStore 를 다시 부르는 것이 새로고침이다. 로딩이 끝난 뒤 그 id 가 트리에 살아 있으면 되살린다.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PluginHost } from '../../plugin';
import { emptyTree, createNode, remove, type Tree } from '../nodes/model/tree';

const kv = vi.hoisted(() => ({ records: [] as unknown[], nodesGetAll: vi.fn(async () => kv.records), nodesWrite: vi.fn(async () => true) }));
vi.mock('../../kv', () => ({ nodesGetAll: kv.nodesGetAll, nodesWrite: kv.nodesWrite }));

import { initStore, getState, select } from './store';
import { __resetPersistForTest } from './persist';
import { clearTypes } from '../nodes/model/types';
import { clearDerived } from '../nodes/model/derive';

const toRecords = (t: Tree): unknown[] => [...Object.values(t.nodes), { id: '__meta', root: t.root, trash: t.trash, rev: t.rev }];
const host = { storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} }, store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null } } as unknown as PluginHost;

beforeEach(() => { localStorage.clear(); clearTypes(); clearDerived(); __resetPersistForTest(); });

describe('고른 노드 복원', () => {
    it('고른 뒤 다시 불러 로딩이 끝나면 selectedId 가 같다', async () => {
        const t = createNode(emptyTree(), 'root', { id: 'X', type: 'folder', name: 'x' });
        kv.records = toRecords(t);
        await initStore(host);
        select('X');
        await initStore(host);
        expect(getState().selectedId).toBe('X');
        expect(getState().selectedIds).toEqual(['X']);
    });
    it('지워진 id 면 null, 휴지통이어도 null', async () => {
        const t = createNode(emptyTree(), 'root', { id: 'X', type: 'folder', name: 'x' });
        kv.records = toRecords(t);
        await initStore(host);
        select('X');
        kv.records = toRecords(emptyTree());
        await initStore(host);
        expect(getState().selectedId).toBeNull();
        localStorage.clear();
        kv.records = toRecords(t);
        await initStore(host);
        select('X');
        kv.records = toRecords(remove(t, 'X'));
        await initStore(host);
        expect(getState().selectedId).toBeNull();
    });
});
