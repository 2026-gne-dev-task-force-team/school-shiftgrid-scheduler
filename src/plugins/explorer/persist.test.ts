/**
 * 나무 보관(persist.ts) 검사 — 저장소가 「나무 통째 한 레코드」에서 「노드당 한 레코드」로 바뀐 뒤의 약속.
 *   A. 이사 — 노드 스토어가 비어 있을 때만 옛 자료(옛 kv 'tree' · 더 옛 localStorage)를 옮긴다(성공 뒤에만 원본 삭제).
 *   B. dirty 쓰기 — store 의 apply/undo/redo 가 넘긴 changedIds 로 바뀐 노드만 put/del(한 트랜잭션 · __meta 는 rev 바뀔 때).
 *
 * 🔴 노드 스토어(nodesGetAll/nodesWrite)는 kv 모듈 함수라 모킹한다 — 메모리 Map 하나로 흉내 내고,
 *    옛 자료 이사가 읽는 host.store·host.storage 는 가짜 호스트가 따로 메모리로 가진다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PluginHost } from '../../pane-ui-system/plugin';
import { emptyTree, createNode, type Tree } from './model/tree';

// 🔴 vi.mock 보다 먼저 서는 공용 모킹 상태(hoisted) — nodesGetAll/nodesWrite 를 메모리 Map 으로.
const kv = vi.hoisted(() => {
    const store = new Map<string, Record<string, unknown>>();
    const flags = { open: true, writeOk: true };
    const nodesGetAll = vi.fn(async (): Promise<unknown[] | null> => (flags.open ? [...store.values()] : null));
    const nodesWrite = vi.fn(async (batch: { put?: Record<string, unknown>[]; del?: string[]; clear?: boolean; purge?: string[] }): Promise<boolean> => {
        if (!flags.writeOk) return false;
        if (batch.clear) store.clear();
        for (const v of batch.put ?? []) store.set(v.id as string, v);
        for (const id of [...(batch.del ?? []), ...(batch.purge ?? [])]) store.delete(id);
        return true;
    });
    return { store, flags, nodesGetAll, nodesWrite };
});
vi.mock('../../pane-ui-system/kv', () => ({ nodesGetAll: kv.nodesGetAll, nodesWrite: kv.nodesWrite }));

import { loadTree, saveTree, flushTree, __resetPersistForTest } from './persist';
import { initStore, getState, newFolder, apiRename, apiSetField, undoAction, redoAction, select, removeSelected, askPurge, purgeConfirmed } from './store';
import { registerType, clearTypes } from './model/types';
import { clearDerived } from './model/derive';

/** 가짜 host — 이사가 읽는 옛 창구(storage=동기 localStorage 꼴 · store=비동기 kv 꼴). 노드 스토어는 안 거친다. */
function makeHost() {
    const local = new Map<string, unknown>();
    const oldKv = new Map<string, unknown>();
    const calls = { localRemove: 0, kvGet: 0, kvDel: 0 };
    const host = {
        notify: Object.assign(() => 'n', { dismiss: () => {} }),
        storage: {
            get: <T,>(k: string, f: T) => (local.has(k) ? (local.get(k) as T) : f),
            set: (k: string, v: unknown) => { local.set(k, v); },
            remove: (k: string) => { calls.localRemove += 1; local.delete(k); },
        },
        store: {
            get: async <T,>(k: string, f: T) => { calls.kvGet += 1; return oldKv.has(k) ? (oldKv.get(k) as T) : f; },
            set: async (k: string, v: unknown) => { oldKv.set(k, v); return true; },
            del: async (k: string) => { calls.kvDel += 1; oldKv.delete(k); },
            available: async () => true,
            estimate: async () => null,
        },
    } as unknown as PluginHost;
    return { host, local, oldKv, calls };
}

function treeWith(id: string): Tree {
    return createNode(emptyTree(), 'root', { id, type: 'folder', name: `폴더-${id}` });
}
/** 나무를 노드 스토어 Map 에 미리 심는다(노드 레코드 + __meta). */
function seedNodes(tree: Tree): void {
    kv.store.clear();
    for (const n of Object.values(tree.nodes)) kv.store.set(n.id, n as unknown as Record<string, unknown>);
    kv.store.set('__meta', { id: '__meta', root: tree.root, trash: tree.trash, rev: tree.rev });
}

beforeEach(() => {
    kv.store.clear();
    kv.flags.open = true;
    kv.flags.writeOk = true;
    kv.nodesGetAll.mockClear();
    kv.nodesWrite.mockClear();
    clearTypes();
    clearDerived();
    __resetPersistForTest();
});
afterEach(() => { __resetPersistForTest(); });

// ───────────────────────────── A. 이사 ─────────────────────────────

describe('A① 이사 성공 — 노드 스토어가 비어 있으면 옛 kv 나무를 옮기고 원본을 치운다', () => {
    it('loadTree 가 노드 스토어에 심고, 이사 성공이면 옛 kv 레코드를 지운다', async () => {
        const { host, oldKv, calls } = makeHost();
        oldKv.set('tree', treeWith('X'));                    // 옛 kv 에만 있다(노드 스토어는 비었다)

        const t = await loadTree(host);

        expect(t.nodes['X']).toBeTruthy();                   // 옛 나무를 읽었다
        expect(kv.store.get('X')).toBeTruthy();              // 🔴 노드 스토어로 옮겨졌다(노드 하나 = 레코드 하나)
        expect(kv.store.get('__meta')).toMatchObject({ root: 'root', trash: 'trash' });
        expect(oldKv.has('tree')).toBe(false);               // 🔴 이사 성공 → 옛 레코드 삭제
        expect(calls.kvDel).toBe(1);
    });
});

describe('A② 두 번 안 옮긴다 — 노드 스토어에 이미 있으면 옛 창구를 안 본다', () => {
    it('노드 스토어 우선 — 옛 kv 에 다른 나무가 있어도 안 읽고(kvGet 0) 노드 스토어 것을 쓴다', async () => {
        const { host, oldKv, calls } = makeHost();
        seedNodes(treeWith('K'));                            // 노드 스토어에 이미
        oldKv.set('tree', treeWith('L'));                    // 옛 kv 엔 다른 것

        const t = await loadTree(host);

        expect(t.nodes['K']).toBeTruthy();
        expect(t.nodes['L']).toBeUndefined();
        expect(calls.kvGet).toBe(0);                         // 🔴 옛 창구를 아예 안 봤다
    });
});

describe('A③ 이사 실패 — 노드 스토어 쓰기가 실패하면 옛 kv 원본을 남긴다', () => {
    it('nodesWrite 가 false 면 옛 레코드를 안 지우고(그대로) 그 나무를 돌려준다', async () => {
        const { host, oldKv, calls } = makeHost();
        kv.flags.writeOk = false;                            // 노드 스토어 쓰기 실패
        oldKv.set('tree', treeWith('X'));

        const t = await loadTree(host);

        expect(t.nodes['X']).toBeTruthy();                   // 옛 나무는 읽혔다(메모리로)
        expect(kv.store.size).toBe(0);                       // 🔴 노드 스토어엔 안 담겼다
        expect(oldKv.has('tree')).toBe(true);                // 🔴 ⛔ 원본을 남겼다(유일한 사본)
        expect(calls.kvDel).toBe(0);
    });
});

describe('A④ 더 옛 localStorage 이사 — 같은 길(성공 뒤에만 원본 치움)', () => {
    it('옛 kv 가 없고 localStorage 에만 있으면 노드 스토어로 옮기고 원본을 지운다', async () => {
        const { host, local, calls } = makeHost();
        local.set('tree', treeWith('L'));

        const t = await loadTree(host);

        expect(t.nodes['L']).toBeTruthy();
        expect(kv.store.get('L')).toBeTruthy();
        expect(local.has('tree')).toBe(false);
        expect(calls.localRemove).toBe(1);
    });
});

describe('A⑤ 열기 실패(null) — 메모리만, 옛 자료는 안 건드린다', () => {
    it('nodesGetAll 이 null 이면 빈 나무를 돌려주고 이사도 안 한다', async () => {
        const { host, oldKv, calls } = makeHost();
        kv.flags.open = false;                               // 열기 거부
        oldKv.set('tree', treeWith('X'));

        const t = await loadTree(host);

        expect(t.nodes['X']).toBeUndefined();                // 메모리만(빈 나무)
        expect(calls.kvGet).toBe(0);                         // 옛 창구를 안 봤다
        expect(kv.nodesWrite).not.toHaveBeenCalled();
    });
});

// ───────────────────────────── B. dirty 쓰기(store 를 통해) ─────────────────────────────

/** 마지막 nodesWrite 호출의 배치. */
function lastWrite() {
    const calls = kv.nodesWrite.mock.calls;
    return calls[calls.length - 1][0] as { put?: { id: string }[]; del?: string[]; clear?: boolean; purge?: string[] };
}

describe('B 노드당 레코드 — 바뀐 노드만 쓴다(diffIds 를 store 가 넘긴다)', () => {
    beforeEach(async () => {
        const { host } = makeHost();
        await initStore(host);                               // 빈 나무로 로드(노드 스토어 비었음)
        registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
    });

    it('노드 하나 이름 바꾸면 put 1건(__meta 포함 2건)·del 0', async () => {
        newFolder();
        const id = getState().selectedId!;
        await flushTree();
        kv.nodesWrite.mockClear();

        apiRename(id, '바뀐이름');                           // 그 노드만 바뀐다(부모 불변)
        await flushTree();

        const b = lastWrite();
        expect(b.del ?? []).toHaveLength(0);
        expect(b.put).toHaveLength(2);                       // 🔴 노드 1 + __meta
        expect(b.put!.some((r) => r.id === id)).toBe(true);
        expect(b.put!.some((r) => r.id === '__meta')).toBe(true);
    });

    it('🔑 공통 머리 칸(icon·body) — 쓰면 그 노드만 저장되고 · 지우면 칸이 빠지고 · 되돌리면 돌아오고 · 다시 불러도 산다', async () => {
        newFolder();
        const id = getState().selectedId!;
        await flushTree();
        kv.nodesWrite.mockClear();

        apiSetField(id, 'icon', '🚀');
        apiSetField(id, 'body', { blocks: [{ id: 'b' }] });
        await flushTree();
        const rec = () => kv.store.get(id) as { icon?: string; body?: unknown };
        expect(rec().icon).toBe('🚀');                       // 🔴 diffIds 가 icon·body 를 「바뀜」으로 본다(안 그러면 저장이 안 된다)
        expect(rec().body).toEqual({ blocks: [{ id: 'b' }] });

        const reloaded = await loadTree(makeHost().host);    // 저장값을 coerce 가 받아들인다
        expect(reloaded.nodes[id].icon).toBe('🚀');
        expect(reloaded.nodes[id].body).toEqual({ blocks: [{ id: 'b' }] });

        apiSetField(id, 'icon', undefined);                  // 지우기 — 칸 자체가 빠진다
        expect(getState().tree.nodes[id]).not.toHaveProperty('icon');
        undoAction();
        expect(getState().tree.nodes[id].icon).toBe('🚀');   // 사람 글이라 되돌리기 더미에 쌓인다
    });

    it('purge 가지(노드 5) → del 5건', async () => {
        newFolder();
        const f = getState().selectedId!;
        for (let i = 0; i < 4; i++) newFolder(f);            // f 밑에 4개 → 가지 5
        await flushTree();
        kv.nodesWrite.mockClear();

        const sub = Object.keys(getState().tree.nodes).filter((k) => k !== 'root' && k !== 'trash');
        expect(sub).toHaveLength(5);

        // f 를 휴지통으로 보낸 뒤 가지째 영구 삭제
        select(f);
        removeSelected();
        await flushTree();
        kv.nodesWrite.mockClear();
        askPurge(f);
        purgeConfirmed();
        await flushTree();

        const b = lastWrite();
        // 🔴 R3-X — 영구삭제는 del 이 아니라 purge(삭제 + 묘비)로 간다. 가지 5가 전부.
        expect(b.purge).toHaveLength(5);
        expect(b.del ?? []).toHaveLength(0);
    });

    it('undo 로 사라졌다 redo 로 되살아난 노드가 put 된다(diffIds 양방향)', async () => {
        newFolder();
        const id = getState().selectedId!;
        await flushTree();

        undoAction();                                        // 사라짐 — prev 에만 있던 id → del
        await flushTree();
        expect(lastWrite().del).toContain(id);

        kv.nodesWrite.mockClear();
        redoAction();                                        // 되살아남 — next 에만 있는 id → put
        await flushTree();
        expect(lastWrite().put!.some((r) => r.id === id)).toBe(true);
    });

    it("'all' 은 clear + 전부 put", async () => {
        const { host } = makeHost();
        newFolder();
        const tree = getState().tree;
        kv.nodesWrite.mockClear();
        saveTree(host, tree, 'all');
        await flushTree();

        const b = lastWrite();
        expect(b.clear).toBe(true);
        expect(b.put!.some((r) => r.id === '__meta')).toBe(true);
    });
});

// ───────────────────────────── flush(탭 닫힘) ─────────────────────────────

describe('flush — 디바운스 중 탭 닫힘(visibilitychange·beforeunload)에 즉시 쓴다', () => {
    const g = globalThis as unknown as { window?: unknown; document?: unknown };
    let handlers: Record<string, Array<() => void>>;

    beforeEach(() => {
        __resetPersistForTest();
        kv.store.clear();
        kv.nodesWrite.mockClear();
        handlers = {};
        const add = (ev: string, h: () => void) => { (handlers[ev] ||= []).push(h); };
        g.window = { addEventListener: add };
        g.document = { addEventListener: add, visibilityState: 'hidden' };
    });
    afterEach(() => { delete g.window; delete g.document; __resetPersistForTest(); });

    it('visibilitychange(hidden) 가 보류분을 바로 쓰고, beforeunload 도 같은 길', async () => {
        const { host } = makeHost();
        await loadTree(host);                                // flush 리스너가 붙는다(window/document 가 있으니)

        saveTree(host, treeWith('A'), ['A']);                // 디바운스 중 — 아직 안 쓴다
        expect(kv.store.has('A')).toBe(false);

        for (const h of handlers['visibilitychange'] ?? []) h();
        await Promise.resolve();                             // flushTree(비동기) 마무리
        expect(kv.store.has('A')).toBe(true);

        saveTree(host, treeWith('B'), ['B']);
        for (const h of handlers['beforeunload'] ?? []) h();
        await Promise.resolve();
        expect(kv.store.has('B')).toBe(true);
    });
});

// ───────────────────────────── 저장 실패 자동 재시도(백오프) ─────────────────────────────

describe('저장 실패 → 지수 백오프(1s·2s·4s…)로 자동 재시도, 성공하면 멈춘다', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('쓰기가 계속 실패하면 1s·2s·4s 간격으로 다시 시도하고, 복구되면 저장 후 더 안 부른다', async () => {
        const { host } = makeHost();
        const tree = await loadTree(host);
        kv.nodesWrite.mockClear();
        kv.flags.writeOk = false;
        saveTree(host, createNode(tree, 'root', { id: 'R', type: 'folder', name: 'R' }), ['R']);

        await vi.advanceTimersByTimeAsync(300);     // 디바운스 → 첫 시도(실패)
        expect(kv.nodesWrite).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(999);
        expect(kv.nodesWrite).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);       // +1s
        expect(kv.nodesWrite).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(2000);    // +2s
        expect(kv.nodesWrite).toHaveBeenCalledTimes(3);

        kv.flags.writeOk = true;
        await vi.advanceTimersByTimeAsync(4000);    // +4s — 성공
        expect(kv.nodesWrite).toHaveBeenCalledTimes(4);
        expect(kv.store.get('R')).toBeTruthy();
        await vi.advanceTimersByTimeAsync(60000);   // 성공 뒤엔 더 안 부른다
        expect(kv.nodesWrite).toHaveBeenCalledTimes(4);
    });

    it('간격은 30s 에서 멈춘다', async () => {
        const { host } = makeHost();
        const tree = await loadTree(host);
        kv.flags.writeOk = false;
        saveTree(host, createNode(tree, 'root', { id: 'R', type: 'folder', name: 'R' }), ['R']);
        await vi.advanceTimersByTimeAsync(300);
        for (const ms of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) await vi.advanceTimersByTimeAsync(ms);
        kv.nodesWrite.mockClear();
        await vi.advanceTimersByTimeAsync(29999);
        expect(kv.nodesWrite).toHaveBeenCalledTimes(0);
        await vi.advanceTimersByTimeAsync(1);
        expect(kv.nodesWrite).toHaveBeenCalledTimes(1);
    });
});
