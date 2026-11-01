/**
 * 나무 보관(persist.ts) 검사 — 저장소가 localStorage → IndexedDB(host.store)로 갈아탄 뒤의 약속.
 *   ① 이사(한 번만) ② 두 번 안 옮긴다 ③ flush(탭 닫힘) ④ kv 불가 → localStorage 로 버틴다.
 *   🔴 IndexedDB 가 없는 node 환경이라 kv 를 가짜로 끼우지 않는다 — persist 는 host.store·host.storage
 *      창구만 쓰니, 그 둘을 메모리로 가진 가짜 호스트를 넘기면 프로덕션 코드가 그대로 돈다.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { PluginHost } from '../../pane-ui-system/plugin';
import { loadTree, saveTree, __resetPersistForTest } from './persist';
import { emptyTree, createNode, type Tree } from './model/tree';

/**
 * 메모리 host — storage(동기 localStorage 꼴) · store(비동기 kv 꼴).
 *   setOk 로 kv 저장 성패를 흉내낸다(false 면 kv 에 안 담고 false 를 돌려준다 — 이사 실패 경로).
 */
function makeHost(opts?: { setOk?: boolean }) {
    const local = new Map<string, unknown>();
    const kv = new Map<string, unknown>();
    const calls = { localGet: 0, localSet: 0, localRemove: 0, kvGet: 0, kvSet: 0 };
    const setOk = opts?.setOk ?? true;
    const host = {
        storage: {
            get: <T,>(k: string, f: T) => { calls.localGet += 1; return local.has(k) ? (local.get(k) as T) : f; },
            set: (k: string, v: unknown) => { calls.localSet += 1; local.set(k, v); },
            remove: (k: string) => { calls.localRemove += 1; local.delete(k); },
        },
        store: {
            get: async <T,>(k: string, f: T) => { calls.kvGet += 1; return kv.has(k) ? (kv.get(k) as T) : f; },
            set: async (k: string, v: unknown) => { calls.kvSet += 1; if (setOk) kv.set(k, v); return setOk; },
            del: async (k: string) => { kv.delete(k); },
            available: async () => true,
            estimate: async () => null,
        },
    } as unknown as PluginHost;
    return { host, local, kv, calls };
}

/** 노드 하나(id) 든 나무 — 이사·비교용. */
function treeWith(id: string): Tree {
    return createNode(emptyTree(), 'root', { id, type: 'folder', name: `폴더-${id}` });
}

beforeEach(() => { __resetPersistForTest(); });
afterEach(() => { __resetPersistForTest(); });

describe('① 이사 성공 — localStorage 에만 있던 나무를 kv 로 옮기고 원본을 치운다', () => {
    it('loadTree 가 kv 에 나무를 만들고, 이사 성공이면 localStorage 원본을 지운다', async () => {
        const { host, local, kv, calls } = makeHost({ setOk: true });
        const old = treeWith('X');
        local.set('tree', old);              // localStorage 에만 있다

        const t = await loadTree(host);

        expect(t.nodes['X']).toBeTruthy();        // 옛 나무를 읽었다
        expect(kv.get('tree')).toBeTruthy();      // 🔴 kv 로 옮겨졌다
        expect((kv.get('tree') as Tree).nodes['X']).toBeTruthy();
        expect(local.has('tree')).toBe(false);    // 🔴 이사 성공 → 원본을 치웠다(host.storage.remove)
        expect(calls.localRemove).toBe(1);
    });
});

describe('② 두 번 안 옮긴다 — kv 에 이미 있으면 localStorage 를 보지 않는다', () => {
    it('kv 우선 — localStorage 에 다른 나무가 있어도 안 읽고(localGet 0) kv 것을 쓴다', async () => {
        const { host, local, kv, calls } = makeHost({ setOk: true });
        kv.set('tree', treeWith('K'));       // kv 에 이미
        local.set('tree', treeWith('L'));    // localStorage 엔 다른 것

        const t = await loadTree(host);

        expect(t.nodes['K']).toBeTruthy();        // kv 것
        expect(t.nodes['L']).toBeUndefined();     // localStorage 것은 아니다
        expect(calls.localGet).toBe(0);           // 🔴 localStorage 를 아예 안 봤다
    });
});

describe('③ flush — 디바운스 중 탭 닫힘(visibilitychange·beforeunload)에 즉시 쓴다', () => {
    const g = globalThis as unknown as { window?: unknown; document?: unknown };
    let handlers: Record<string, Array<() => void>>;

    beforeEach(() => {
        __resetPersistForTest();
        handlers = {};
        const add = (ev: string, h: () => void) => { (handlers[ev] ||= []).push(h); };
        g.window = { addEventListener: add };
        g.document = { addEventListener: add, visibilityState: 'hidden' };
    });
    afterEach(() => { delete g.window; delete g.document; __resetPersistForTest(); });

    it('visibilitychange(hidden) 가 보류분을 바로 쓰고, beforeunload 도 같은 길', async () => {
        const { host, kv } = makeHost();
        await loadTree(host);                // 여기서 flush 리스너가 붙는다(window/document 가 있으니)

        saveTree(host, treeWith('A'));       // 디바운스 중 — 아직 안 쓴다
        expect(kv.get('tree')).toBeUndefined();

        for (const h of handlers['visibilitychange'] ?? []) h();   // 탭이 가려짐 → 즉시 flush
        expect((kv.get('tree') as Tree)?.nodes['A']).toBeTruthy();

        saveTree(host, treeWith('B'));
        expect((kv.get('tree') as Tree).nodes['A']).toBeTruthy();  // 아직 A(디바운스 중)
        for (const h of handlers['beforeunload'] ?? []) h();       // 탭 닫힘 → 즉시 flush
        expect((kv.get('tree') as Tree).nodes['B']).toBeTruthy();
    });
});

describe('④ 이사 실패 — kv 저장이 실패하면 localStorage 원본을 남긴다(그게 유일한 사본)', () => {
    it('loadTree 가 이사(set)에 false 를 받으면 원본을 안 지우고(그대로 둔다) 그 나무를 돌려준다', async () => {
        const { host, local, kv, calls } = makeHost({ setOk: false });
        const old = treeWith('X');
        local.set('tree', old);

        const t = await loadTree(host);

        expect(t.nodes['X']).toBeTruthy();        // 옛 나무는 읽혔다
        expect(kv.size).toBe(0);                  // 🔴 kv 에는 안 담겼다(set 실패)
        expect(local.get('tree')).toBe(old);      // 🔴 ⛔ 원본을 남겼다(동일 객체)
        expect(calls.localRemove).toBe(0);        // remove 를 부르지 않았다
    });
});
