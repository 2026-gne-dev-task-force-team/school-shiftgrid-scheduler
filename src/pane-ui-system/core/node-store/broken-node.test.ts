/**
 * 깨진 노드 보존(QA Q21) — 저장소 레코드의 type·name·children 이 null/잘못이면 버리지 않고 「깨진 항목」으로 불러온다.
 *   그래야 탐색기에 경고로 보이고 휴지통으로 보낼 수 있다. 🔴 저장 때 원본 레코드를 그대로 쓴다(자동 복구 ⛔).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PluginHost } from '../../plugin';

const kv = vi.hoisted(() => {
    const store = new Map<string, Record<string, unknown>>();
    const nodesGetAll = vi.fn(async (): Promise<unknown[] | null> => [...store.values()]);
    const nodesWrite = vi.fn(async (b: { put?: Record<string, unknown>[]; del?: string[]; clear?: boolean; purge?: string[] }): Promise<boolean> => {
        if (b.clear) store.clear();
        for (const v of b.put ?? []) store.set(v.id as string, v);
        for (const id of [...(b.del ?? []), ...(b.purge ?? [])]) store.delete(id);
        return true;
    });
    return { store, nodesGetAll, nodesWrite };
});
vi.mock('../../kv', () => ({ nodesGetAll: kv.nodesGetAll, nodesWrite: kv.nodesWrite }));

import { loadTree, flushTree, __resetPersistForTest } from './persist';
import { initStore, getState, trashNode } from './store';
import { clearTypes } from '../nodes/model/types';
import { clearDerived } from '../nodes/model/derive';
import { BROKEN_TYPE, brokenDataOf } from '../nodes/model/broken';

const host = {
    notify: Object.assign(() => 'n', { dismiss: () => {} }),
    storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
    store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
} as unknown as PluginHost;

const BAD: Record<string, Record<string, unknown>> = {
    t: { id: 'bt', type: null, name: '타입없음', children: [] },
    n: { id: 'bn', type: 'folder', name: null, children: [] },
    c: { id: 'bc', type: 'folder', name: '자식이상', children: 'x' },
};

function seed(): void {
    kv.store.clear();
    kv.store.set('root', { id: 'root', type: 'folder', name: '루트', children: ['bt', 'bn', 'bc'] });
    kv.store.set('trash', { id: 'trash', type: 'folder', name: '휴지통', children: [] });
    for (const r of Object.values(BAD)) kv.store.set(r.id as string, { ...r });
    kv.store.set('__meta', { id: '__meta', root: 'root', trash: 'trash', rev: 0 });
}

beforeEach(() => { seed(); clearTypes(); clearDerived(); __resetPersistForTest(); });
afterEach(() => { __resetPersistForTest(); });

describe('깨진 노드 — 불러올 때 버리지 않고 깨진 항목으로 보존', () => {
    it.each([['t', 'type'], ['n', 'name'], ['c', 'children']])('%s 종류(%s 이상)는 탐색기 줄로 남고 까닭이 적힌다', async (k, word) => {
        const tree = await loadTree(host);
        const id = BAD[k].id as string;
        const n = tree.nodes[id];
        expect(n, '나무에 남아 있다').toBeTruthy();
        expect(n.type).toBe(BROKEN_TYPE);
        expect(tree.nodes.root.children).toContain(id);
        expect(brokenDataOf(n)?.reasons.join(' ')).toContain(word);
    });

    it('이름이 없으면 id 로, 있으면 원래 이름으로 보인다', async () => {
        const tree = await loadTree(host);
        expect(tree.nodes.bn.name).toBe('bn');
        expect(tree.nodes.bt.name).toBe('타입없음');
    });
});

describe('깨진 노드 — 휴지통으로 보내도 저장소 원본은 안 고친다', () => {
    it('trashNode 뒤 저장해도 type null·name null·children 문자열 그대로(휴지통 표식만 얹힌다)', async () => {
        await initStore(host);
        const before = Object.keys(getState().tree.nodes);
        expect(before).toEqual(expect.arrayContaining(['bt', 'bn', 'bc']));
        for (const id of ['bt', 'bn', 'bc']) trashNode(id);
        await flushTree();
        expect(kv.store.get('bt')).toMatchObject({ type: null, name: '타입없음' });
        expect(kv.store.get('bn')).toMatchObject({ type: 'folder', name: null });
        expect(kv.store.get('bc')).toMatchObject({ children: 'x' });
        expect(getState().tree.nodes.trash.children).toEqual(expect.arrayContaining(['bt', 'bn', 'bc']));
    });
});
