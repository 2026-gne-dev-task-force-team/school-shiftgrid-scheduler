/**
 * 레코드성 노드 증명(S4) — 「탐색기엔 안 보이고 API 론 보이고, 저장엔 일반 노드와 같은 꼴로 있다」.
 *   🔴 pane-test 는 앱에서 등록 해지 상태라(⛔ app/plugins.ts 에 되살리지 않는다) 여기 테스트에서만 타입을 꽂는다.
 *   저장 라운드트립을 보려고 노드 스토어(nodesGetAll/nodesWrite)는 메모리 Map 으로 모킹한다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PluginHost } from '../../pane-ui-system/plugin';

const kv = vi.hoisted(() => {
    const store = new Map<string, Record<string, unknown>>();
    const nodesGetAll = vi.fn(async (): Promise<unknown[] | null> => [...store.values()]);
    const nodesWrite = vi.fn(async (batch: { put?: Record<string, unknown>[]; del?: string[]; clear?: boolean }): Promise<boolean> => {
        if (batch.clear) store.clear();
        for (const v of batch.put ?? []) store.set(v.id as string, v);
        for (const id of batch.del ?? []) store.delete(id);
        return true;
    });
    return { store, nodesGetAll, nodesWrite };
});
vi.mock('../../pane-ui-system/kv', () => ({ nodesGetAll: kv.nodesGetAll, nodesWrite: kv.nodesWrite }));

import { initStore, getState } from './store';
import { flushTree, __resetPersistForTest } from './persist';
import { makeNodesApi } from './api';
import { registerType, clearTypes, isRecordType, isContainerType } from './model/types';
import { clearDerived } from './model/derive';
import { flatten } from './model/tree';
import { buildMainRows } from './views/rows';

function host(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
    } as unknown as PluginHost;
}

beforeEach(async () => {
    kv.store.clear(); kv.nodesWrite.mockClear();
    clearTypes(); clearDerived(); __resetPersistForTest();
    await initStore(host());
});
afterEach(() => { __resetPersistForTest(); });

describe('레코드성 노드 — 탐색기엔 0줄, API·저장엔 일반 노드', () => {
    it('탐색기 flatten·buildMainRows 엔 안 보이고, byType·children 엔 있으며, 저장엔 같은 꼴로 있다', async () => {
        registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
        const api = makeNodesApi('pt');
        api.types.register({ type: 'pt.event', label: '일정', icon: 'file', record: true });

        const root = api.roots.main;
        const fid = api.create(root, { type: 'folder', name: '묶음' });
        const eid = api.create(fid, { type: 'pt.event', name: '교직원 회의', data: { start: 10, end: 11 } });
        expect(fid).not.toBe('');
        expect(eid).not.toBe('');

        const tree = getState().tree;

        // ① 탐색기엔 어떤 경우에도 안 보인다 — 본 나무(flatten·buildMainRows) 둘 다
        const flatIds = flatten(tree, root, isContainerType, { isRecord: isRecordType }).map((r) => r.id);
        expect(flatIds).toContain(fid);
        expect(flatIds).not.toContain(eid);
        const mainIds = buildMainRows(tree, root, isRecordType).map((r) => r.id);
        expect(mainIds).not.toContain(eid);

        // ② API 론 보인다 — byType·children
        expect(api.byType('pt.event').map((n) => n.id)).toEqual([eid]);
        expect(api.children(fid).map((n) => n.id)).toContain(eid);

        // ③ 저장엔 일반 노드와 같은 꼴 — 노드 스토어에 레코드 하나로, data 까지 그대로
        await flushTree();
        const saved = kv.store.get(eid);
        expect(saved).toMatchObject({ id: eid, type: 'pt.event', name: '교직원 회의', data: { start: 10, end: 11 } });
        expect(kv.store.get('__meta')).toBeTruthy();
    });
});
