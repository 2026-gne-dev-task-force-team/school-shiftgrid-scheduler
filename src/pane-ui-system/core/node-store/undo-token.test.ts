/**
 * 🔴 C1 회귀 — 「A 지우고 B 지운 뒤 A 알림의 되돌리기」가 B 를 되돌리던 버그.
 *   알림 단추가 args.undoTop(더미 맨 위 칸 토큰)을 싣고, explorer.undo 의 enabled 가 그 토큰이 지금 맨 위와 맞을 때만 통과시킨다.
 *   실제 창틀 알림 스토어(notify)·명령 스토어(runCommand)를 그대로 거친다 — 탐색기 매니페스트의 enabled 를 꽂아서.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PluginHost } from '../../plugin';

const kv = vi.hoisted(() => {
    const store = new Map<string, Record<string, unknown>>();
    return {
        store,
        nodesGetAll: vi.fn(async (): Promise<unknown[] | null> => [...store.values()]),
        nodesWrite: vi.fn(async (b: { put?: Record<string, unknown>[]; del?: string[]; clear?: boolean }) => {
            if (b.clear) store.clear();
            for (const v of b.put ?? []) store.set(v.id as string, v);
            for (const id of b.del ?? []) store.delete(id);
            return true;
        }),
    };
});
vi.mock('../../kv', () => ({ nodesGetAll: kv.nodesGetAll, nodesWrite: kv.nodesWrite }));

import { initStore, getState, newNode, select, removeSelected, undoAction, undoAllowed, undoToken } from './store';
import { __resetPersistForTest } from './persist';
import { registerType, clearTypes } from '../nodes/model/types';
import { clearDerived } from '../nodes/model/derive';
import { isDescendant } from '../nodes/model/tree';
import { notify, getNotifications, runNotifyAction, actionState, __resetNotifyForTest } from '../../plugin/notify';
import { addCommand } from '../../plugin/store';
import { CMD } from '../nodes/contracts/commands';

let off: { dispose(): void } | null = null;
function host(): PluginHost {
    const n = Object.assign((input: Parameters<typeof notify>[1]) => notify('explorer', input), { dismiss: () => {} });
    return {
        notify: n,
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
    } as unknown as PluginHost;
}

beforeEach(async () => {
    kv.store.clear(); localStorage.clear(); __resetNotifyForTest();
    clearTypes(); clearDerived(); __resetPersistForTest();
    await initStore(host());
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true, create: { label: '폴더' } });
    // 매니페스트와 같은 꼴로 꽂는다(run + enabled)
    off = addCommand('explorer', { id: CMD.undo, title: '되돌리기', run: () => undoAction(), enabled: (ctx) => undoAllowed(ctx?.args) });
});
afterEach(() => { off?.dispose(); off = null; __resetPersistForTest(); });

const trashed = (id: string) => isDescendant(getState().tree, id, getState().tree.trash);
function mk(): string { newNode('folder'); return getState().selectedId!; }
function del(id: string): string { select(id); removeSelected(); const its = getNotifications().items; return its[its.length - 1].id; }

describe('🔴 C1 — 낡은 「되돌리기」는 남의 작업을 안 되돌린다', () => {
    it('A 지우고 B 지운 뒤 A 알림의 되돌리기 → 아무것도 안 되돌리고 회색 · B 알림은 B 를 되돌린다', () => {
        const a = mk(); const b = mk();
        const na = del(a);
        const nb = del(b);
        expect(trashed(a) && trashed(b)).toBe(true);

        const itA = getNotifications().items.find((i) => i.id === na)!;
        expect(itA.action?.args).toEqual({ undoTop: expect.any(Number) });
        expect(actionState(itA)).toEqual({ kind: 'stale', reason: '이미 다른 작업이 있어 되돌릴 수 없습니다' });
        runNotifyAction(na);
        expect(trashed(b)).toBe(true);   // 🔴 옛 버그: 여기서 B 가 되살아났다
        expect(trashed(a)).toBe(true);

        runNotifyAction(nb);
        expect(trashed(b)).toBe(false);
        expect(trashed(a)).toBe(true);
        // B 를 되돌리고 나면 더미 맨 위가 다시 A 칸 — A 알림이 살아난다(맞는 대상이니까)
        expect(actionState(getNotifications().items.find((i) => i.id === na)!).kind).toBe('ready');
        runNotifyAction(na);
        expect(trashed(a)).toBe(false);
    });

    it('토큰 없는(팔레트·단축키) 되돌리기는 그대로 된다 · 더미가 비면 토큰은 null', () => {
        expect(undoToken()).toBeNull();
        expect(undoAllowed(undefined)).toBe(true);
        expect(undoAllowed(null)).toBe(false);
        const a = mk();
        del(a);
        expect(undoToken()).not.toBeNull();
        expect(undoAllowed({ undoTop: -1 })).toBe(false);
    });

    it('🔴 새로고침 뒤엔 옛 알림 단추가 만료된다', () => {
        const a = mk();
        const na = del(a);
        __resetNotifyForTest();
        const it0 = getNotifications().items.find((i) => i.id === na)!;
        expect(actionState(it0).kind).toBe('stale');
    });
});
