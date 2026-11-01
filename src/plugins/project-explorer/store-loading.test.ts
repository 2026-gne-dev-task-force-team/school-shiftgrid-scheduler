/**
 * 스토어 로딩 관문 검사 — 저장소가 비동기(IndexedDB)가 되며 생긴 위험을 막는 자리.
 *   ⑤ 로딩 중 덮어쓰기 금지 — 불러오기 전 조작이 빈 나무 위에 쌓여 옛 나무를 덮지 않는다.
 *   ⑥ subscribe 가 로딩 완료에 깨난다 — 다른 플러그인이 그때 다시 읽는다(NodesApi.subscribe).
 *   🔴 로드 완료 시점을 쥐려고 store.available() 을 gate 로 막았다 풀었다 한다(deferredHost).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { PluginHost } from '../../pane-ui-system/plugin';
import { initStore, getState, newFolder, subscribeChanges } from './store';
import { __resetPersistForTest } from './persist';
import { clearTypes } from './model/types';
import { clearDerived } from './model/derive';
import { emptyTree, createNode, type Tree } from './model/tree';

/** 로드 완료를 테스트가 쥐는 가짜 호스트 — available() 이 gate 가 풀릴 때까지 멈춘다. */
function deferredHost(tree: Tree) {
    const counts = { set: 0 };
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const host = {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {} },
        store: {
            available: async () => { await gate; return true; },
            get: async <T,>(_k: string, _f: T) => tree as unknown as T,
            set: async () => { counts.set += 1; },
            del: async () => {},
            estimate: async () => null,
        },
    } as unknown as PluginHost;
    return { host, release, counts };
}

beforeEach(() => { clearTypes(); clearDerived(); __resetPersistForTest(); });
afterEach(() => { __resetPersistForTest(); });

describe('⑤ 로딩 중엔 조작이 막힌다 — 옛 나무를 덮지 않는다', () => {
    it('loading 동안 newFolder 가 안 먹고 저장도 안 나가며, 로드 뒤 옛 나무가 살아 있다', async () => {
        const old = createNode(emptyTree(), 'root', { id: 'X', type: 'folder', name: '옛폴더' });
        const { host, release, counts } = deferredHost(old);

        const p = initStore(host);
        expect(getState().loading).toBe(true);          // 아직 로딩 중

        const rootId = getState().tree.root;
        newFolder();                                     // 🔴 로딩 중 조작 — 막혀야 한다
        expect(getState().tree.nodes[rootId].children).toEqual([]);   // 아무것도 안 생겼다
        expect(counts.set).toBe(0);                      // 저장도 안 나갔다

        release();
        await p;

        expect(getState().loading).toBe(false);
        expect(getState().tree.nodes['X']).toBeTruthy();  // 🔴 옛 나무가 덮이지 않고 살아 있다
    });
});

describe('⑥ subscribe 가 로딩 완료에 깨난다', () => {
    it('로드가 끝나면 changedIds 로 구독을 깨운다(그 안에 새로 온 노드가 있다)', async () => {
        const fired: string[][] = [];
        const unsub = subscribeChanges((ids) => fired.push([...ids]));
        try {
            const old = createNode(emptyTree(), 'root', { id: 'Y', type: 'folder', name: '옛' });
            const { host, release } = deferredHost(old);

            const p = initStore(host);
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
