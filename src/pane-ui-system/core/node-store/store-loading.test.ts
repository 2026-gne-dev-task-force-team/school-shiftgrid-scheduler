/**
 * 스토어 로딩 관문 검사 — 저장소가 비동기(IndexedDB 노드 스토어)가 되며 생긴 위험을 막는 자리.
 *   ⑤ 로딩 중 덮어쓰기 금지 — 불러오기 전 조작이 빈 나무 위에 쌓여 옛 나무를 덮지 않는다.
 *   ⑥ subscribe 가 로딩 완료에 깨난다 — 다른 플러그인이 그때 다시 읽는다(NodesApi.subscribe).
 *   🔴 로드 완료 시점을 쥐려고 노드 스토어 읽기(nodesGetAll)를 gate 로 막았다 푼다 — 저장소가 그 함수로 옮겨갔다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PluginHost } from '../../plugin';
import { emptyTree, createNode, type Tree } from '../nodes/model/tree';

// 🔴 노드 스토어를 gate 로 쥔다 — nodesGetAll 이 풀릴 때까지 멈춘다(옛 테스트가 host.store.get 을 쥐던 자리).
const kv = vi.hoisted(() => {
    const h = { records: [] as unknown[] | null, gated: Promise.resolve() as Promise<void> };
    const nodesGetAll = vi.fn(async () => { await h.gated; return h.records; });
    const nodesWrite = vi.fn(async () => true);
    return { h, nodesGetAll, nodesWrite };
});
vi.mock('../../kv', () => ({ nodesGetAll: kv.nodesGetAll, nodesWrite: kv.nodesWrite }));

import { initStore, getState, newFolder, subscribeChanges } from './store';
import { __resetPersistForTest } from './persist';
import { clearTypes } from '../nodes/model/types';
import { clearDerived } from '../nodes/model/derive';

/** 나무를 노드 레코드 배열로(노드 + __meta). */
function toRecords(tree: Tree): unknown[] {
    return [...Object.values(tree.nodes), { id: '__meta', root: tree.root, trash: tree.trash, rev: tree.rev }];
}

/** 최소 host — 노드 스토어에 자료가 있으면 loadTree 는 host.store 를 안 보니 빈 창구면 된다. */
function minimalHost(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: {
            get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {},
            available: async () => true, estimate: async () => null,
        },
    } as unknown as PluginHost;
}

/** gate 를 건다 — release() 를 부를 때까지 nodesGetAll 이 멈춘다. */
function gateLoad(records: unknown[]): () => void {
    kv.h.records = records;
    let release!: () => void;
    kv.h.gated = new Promise<void>((r) => { release = r; });
    return release;
}

beforeEach(() => {
    clearTypes(); clearDerived(); __resetPersistForTest();
    kv.h.records = [];
    kv.h.gated = Promise.resolve();
    kv.nodesGetAll.mockClear();
    kv.nodesWrite.mockClear();
});
afterEach(() => { __resetPersistForTest(); });

describe('⑤ 로딩 중엔 조작이 막힌다 — 옛 나무를 덮지 않는다', () => {
    it('loading 동안 newFolder 가 안 먹고 저장도 안 나가며, 로드 뒤 옛 나무가 살아 있다', async () => {
        const old = createNode(emptyTree(), 'root', { id: 'X', type: 'folder', name: '옛폴더' });
        const release = gateLoad(toRecords(old));

        const p = initStore(minimalHost());
        expect(getState().loading).toBe(true);           // 아직 로딩 중(gate 가 안 풀렸다)

        const rootId = getState().tree.root;
        newFolder();                                     // 🔴 로딩 중 조작 — 막혀야 한다
        expect(getState().tree.nodes[rootId].children).toEqual([]);   // 아무것도 안 생겼다
        expect(kv.nodesWrite).not.toHaveBeenCalled();    // 저장도 안 나갔다

        release();
        await p;

        expect(getState().loading).toBe(false);
        expect(getState().tree.nodes['X']).toBeTruthy(); // 🔴 옛 나무가 덮이지 않고 살아 있다
    });
});

describe('⑥ subscribe 가 로딩 완료에 깨난다', () => {
    it('로드가 끝나면 changedIds 로 구독을 깨운다(그 안에 새로 온 노드가 있다)', async () => {
        const fired: string[][] = [];
        const unsub = subscribeChanges((ids) => fired.push([...ids]));
        try {
            const old = createNode(emptyTree(), 'root', { id: 'Y', type: 'folder', name: '옛' });
            const release = gateLoad(toRecords(old));

            const p = initStore(minimalHost());
            expect(fired.length).toBe(0);                // 로딩 중엔 아직 안 깨운다

            release();
            await p;

            expect(fired.length).toBeGreaterThan(0);     // 🔴 로드 완료에 깨났다
            expect(fired.flat()).toContain('Y');         // 새로 온 노드가 changedIds 에 있다
        } finally {
            unsub();
        }
    });
});
