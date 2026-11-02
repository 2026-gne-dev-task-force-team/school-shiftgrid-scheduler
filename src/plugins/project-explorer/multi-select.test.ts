/**
 * 멀티 셀렉트 스토어 증명(쥔님 2026-11-02) — 고른 것 전부에 명령이 돌고, 삭제/복원이 한 묶음(Ctrl+Z 한 번)이다.
 *   store 가 비동기 로드라 노드 스토어(kv)를 메모리로 모킹하고 initStore 로 loading 을 푼다(record-node.test 와 같은 결).
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

import {
    initStore, getState, newNode, select, clickSelect, selectAllRows,
    removeSelected, restoreSelected, moveNodes, undoAction,
} from './store';
import { __resetPersistForTest } from './persist';
import { registerType, clearTypes } from './model/types';
import { clearDerived } from './model/derive';
import { parentOf, isDescendant } from './model/tree';

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
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true, create: { label: '폴더' } });
});
afterEach(() => { __resetPersistForTest(); });

/** 루트 밑에 폴더 n 개를 나란히(헤더 경로 — selection 이라 다 형제). 만든 순서의 id 배열을 돌려준다. */
function makeSiblings(n: number): string[] {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) { newNode('folder'); ids.push(getState().selectedId!); }
    return ids;
}

describe('고르기 — Shift 범위 · Ctrl 토글', () => {
    it('Shift 클릭이 anchor~줄을 잡고, Ctrl 클릭이 토글한다', () => {
        const [a, b, c, d] = makeSiblings(4);
        const order = getState().tree.nodes[getState().tree.root].children;   // [a,b,c,d]
        expect(order).toEqual([a, b, c, d]);

        select(a);                                   // anchor=a
        clickSelect(c, order, { shift: true });      // a..c
        expect(getState().selectedIds).toEqual([a, b, c]);

        clickSelect(d, order, { ctrl: true });       // +d
        expect(getState().selectedIds).toEqual([a, b, c, d]);

        clickSelect(b, order, { ctrl: true });       // -b
        expect(getState().selectedIds).toEqual([a, c, d]);
    });

    it('Ctrl/⌘+A 는 보이는 줄 전부', () => {
        const ids = makeSiblings(3);
        selectAllRows(ids);
        expect(getState().selectedIds).toEqual(ids);
    });
});

describe('삭제·복원 — 고른 것 전부 · 한 묶음(Ctrl+Z 한 번)', () => {
    it('둘 고르고 삭제 → 둘 다 휴지통 · 되돌리기 한 번에 둘 다 복원', () => {
        const [a, b, c] = makeSiblings(3);
        const root = getState().tree.root;

        select(a);
        clickSelect(b, getState().tree.nodes[root].children, { ctrl: true });   // a,b
        expect(getState().selectedIds).toEqual([a, b]);

        removeSelected();                            // 둘 다 휴지통
        expect(getState().tree.nodes[root].children).toEqual([c]);
        expect(isDescendant(getState().tree, a, getState().tree.trash)).toBe(true);
        expect(isDescendant(getState().tree, b, getState().tree.trash)).toBe(true);

        undoAction();                                // 🔴 한 번에 둘 다 복원
        expect(getState().tree.nodes[root].children).toEqual([a, b, c]);
    });

    it('조상-자손을 같이 고르면 조상만 옮긴다(자손은 따라간다 · 두 번 안 옮긴다)', () => {
        newNode('folder');
        const p = getState().selectedId!;
        newNode('folder', { via: 'context', targetId: p });   // p 안에 q
        const q = getState().selectedId!;
        expect(parentOf(getState().tree, q)).toBe(p);

        select(p);
        clickSelect(q, [p, q], { ctrl: true });               // p,q 둘 다
        removeSelected();
        // p 가 휴지통으로 · q 는 여전히 p 의 자식(따라갔다)
        expect(isDescendant(getState().tree, p, getState().tree.trash)).toBe(true);
        expect(parentOf(getState().tree, q)).toBe(p);
    });

    it('복원도 고른 것 전부 — 휴지통에서 둘을 골라 한 번에 복원', () => {
        const [a, b] = makeSiblings(2);
        const root = getState().tree.root;
        select(a); clickSelect(b, getState().tree.nodes[root].children, { ctrl: true });
        removeSelected();
        // 휴지통에서 둘을 고른다
        const trash = getState().tree.trash;
        const trashKids = getState().tree.nodes[trash].children;   // [a,b]
        select(trashKids[0]); clickSelect(trashKids[1], trashKids, { ctrl: true });
        restoreSelected();
        expect(getState().tree.nodes[root].children).toEqual([a, b]);
    });
});

describe('이동 — 고른 것 전부를 순서대로', () => {
    it('둘을 폴더 안으로 드래그하면 둘 다 들어간다', () => {
        const [a, b, c] = makeSiblings(3);
        const root = getState().tree.root;
        select(a); clickSelect(b, getState().tree.nodes[root].children, { ctrl: true });   // a,b
        moveNodes([a, b], c);
        expect(getState().tree.nodes[c].children).toEqual([a, b]);
        expect(getState().tree.nodes[root].children).toEqual([c]);
    });
});
