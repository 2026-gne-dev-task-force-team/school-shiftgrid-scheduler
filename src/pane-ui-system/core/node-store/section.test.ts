/**
 * 섹션 노드 — 뿌리 전용(중첩 불가) · 지우면 자식이 뿌리로 풀림(되돌리기 한 번) · 싱글톤 이동/삭제 · 줄 만들기 깊이.
 *   하니스는 unique-slots.test 와 같은 결(노드 스토어 kv 모킹).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PluginHost } from '../../plugin';

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
vi.mock('../../kv', () => ({ nodesGetAll: kv.nodesGetAll, nodesWrite: kv.nodesWrite }));

import { initStore, getState, select, removeSelected, undoAction, apiCreate, apiMove } from './store';
import { __resetPersistForTest } from './persist';
import { registerType, clearTypes } from '../nodes/model/types';
import { clearDerived } from '../nodes/model/derive';
import { parentOf, isDescendant } from '../nodes/model/tree';
import { buildMainRows } from '../explorer/views/rows';

function host(): PluginHost {
    return {
        notify: Object.assign(() => 'n', { dismiss: () => {} }),
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
    } as unknown as PluginHost;
}

beforeEach(async () => {
    kv.store.clear();
    clearTypes(); clearDerived(); __resetPersistForTest();
    await initStore(host());
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true, create: { label: '폴더' } });
    registerType({ type: 'section', label: '섹션', icon: 'divider', container: true, section: true, create: { label: '섹션' } });
    registerType({ type: 'app.info', label: '정보', icon: 'file', unique: 'tree', create: { label: '정보' } });
});
afterEach(() => { __resetPersistForTest(); clearTypes(); });

const root = () => getState().tree.root;
const kids = (id: string) => getState().tree.nodes[id].children;

describe('섹션 만들기 관문', () => {
    it('뿌리 밑엔 만들어진다', () => {
        expect(apiCreate(root(), { type: 'section', name: 'S' })).not.toBe('');
    });
    it('폴더·섹션 안엔 못 만든다(섹션 안에 섹션 없음)', () => {
        const f = apiCreate(root(), { type: 'folder', name: 'f' });
        const s = apiCreate(root(), { type: 'section', name: 'S' });
        expect(apiCreate(f, { type: 'section', name: 'x' })).toBe('');
        expect(apiCreate(s, { type: 'section', name: 'x' })).toBe('');
    });
    it('이동도 뿌리로만 — 섹션을 폴더·섹션 안으로 못 옮긴다', () => {
        const f = apiCreate(root(), { type: 'folder', name: 'f' });
        const s = apiCreate(root(), { type: 'section', name: 'S' });
        const s2 = apiCreate(root(), { type: 'section', name: 'S2' });
        apiMove(s, f); apiMove(s, s2);
        expect(parentOf(getState().tree, s)).toBe(root());
    });
});

describe('섹션 지우기 = 자식 풀림', () => {
    it('자식이 섹션 자리에 순서대로 뿌리로 나오고 섹션만 휴지통, 되돌리기 한 번에 원상복구', () => {
        const a = apiCreate(root(), { type: 'folder', name: 'a' });
        const s = apiCreate(root(), { type: 'section', name: 'S' });
        const c1 = apiCreate(s, { type: 'folder', name: 'c1' });
        const c2 = apiCreate(s, { type: 'folder', name: 'c2' });
        const z = apiCreate(root(), { type: 'folder', name: 'z' });
        select(s); removeSelected();
        expect(kids(root())).toEqual([a, c1, c2, z]);
        expect(isDescendant(getState().tree, s, getState().tree.trash)).toBe(true);
        expect(getState().tree.nodes[c1]).toBeDefined();
        undoAction();
        expect(kids(root())).toEqual([a, s, z]);
        expect(kids(s)).toEqual([c1, c2]);
    });
});

describe('싱글톤 이동·삭제', () => {
    it('다른 부모(섹션)로 옮겨진다', () => {
        const i = apiCreate(root(), { type: 'app.info', name: '정보' });
        const s = apiCreate(root(), { type: 'section', name: 'S' });
        apiMove(i, s);
        expect(parentOf(getState().tree, i)).toBe(s);
    });
    it('지우기는 여전히 막힌다', () => {
        const i = apiCreate(root(), { type: 'app.info', name: '정보' });
        select(i); removeSelected();
        expect(parentOf(getState().tree, i)).toBe(root());
    });
});

describe('줄 만들기 — 섹션 자식 깊이', () => {
    it('섹션·그 자식은 깊이 0 · 자식의 자손은 1 · sec 표식', () => {
        const s = apiCreate(root(), { type: 'section', name: 'S' });
        const c = apiCreate(s, { type: 'folder', name: 'c' });
        const g = apiCreate(c, { type: 'folder', name: 'g' });
        const out = buildMainRows(getState().tree, root());
        expect(out.map((r) => [r.id, r.depth, r.sec])).toEqual([[s, 0, s], [c, 0, s], [g, 1, s]]);
    });
});
