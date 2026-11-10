/**
 * 🔴 R5-2③ — 지운 사용자·역할 되돌리기는 자체 통로(옛 account.restoreRemoved)가 아니라 노드 시스템 정식 되돌리기다.
 *   실제 탐색기 스토어·창틀 알림·명령 스토어를 그대로 거친다(가짜 nodes 로는 되돌리기 더미가 없다).
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PluginHost } from '../../pane-ui-system/plugin';

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
vi.mock('../../pane-ui-system/kv', () => ({ nodesGetAll: kv.nodesGetAll, nodesWrite: kv.nodesWrite }));

import { initStore, undoAction, undoAllowed } from '../../pane-ui-system/core/node-store/store';
import { makeNodesApi } from '../../pane-ui-system/core/node-frame/api';
import { __resetPersistForTest } from '../../pane-ui-system/core/node-store/persist';
import { registerType, clearTypes } from '../../pane-ui-system/core/nodes/model/types';
import { clearDerived } from '../../pane-ui-system/core/nodes/model/derive';
import { notify, getNotifications, runNotifyAction, actionState, __resetNotifyForTest } from '../../pane-ui-system/plugin/notify';
import { addCommand } from '../../pane-ui-system/plugin/store';
import { CMD } from '../../pane-ui-system/core/nodes/contracts/commands';
import * as core from './core';

let off: { dispose(): void } | null = null;
function host(): PluginHost {
    const n = Object.assign((input: Parameters<typeof notify>[1]) => notify('account', input), { dismiss: () => {} });
    return {
        notify: n,
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
    } as unknown as PluginHost;
}

beforeEach(async () => {
    kv.store.clear(); localStorage.clear(); __resetNotifyForTest();
    clearTypes(); clearDerived(); __resetPersistForTest();
    const h = host();
    await initStore(h);
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true, create: { label: '폴더' } });
    for (const t of ['account.root', 'account.users', 'account.roles', 'account.user', 'account.role', 'account.policy', 'account.secret']) {
        registerType({ type: t, label: t, icon: 'folder', container: t.endsWith('root') || t.endsWith('users') || t.endsWith('roles') });
    }
    off = addCommand('explorer', { id: CMD.undo, title: '되돌리기', run: () => undoAction(), enabled: (ctx) => undoAllowed(ctx?.args) });
    core.initAccount(h, makeNodesApi('account'));
});
afterEach(() => { off?.dispose(); off = null; __resetPersistForTest(); });

describe('R5-2③ 지운 계정 되돌리기', () => {
    it('알림 단추는 nodes.cmd.undo + 토큰 · 누르면 제자리로 · 뒤에 다른 작업이 쌓이면 회색', () => {
        const api = core.getNodesApi()!;
        const a = core.createUser('가'), b = core.createUser('나'), c = core.createUser('다');
        expect([a, b, c].every(Boolean)).toBe(true);
        expect(core.removeAndNotify(host(), 'users', [a, c])).toBe(2);
        expect(core.listUsers().map((u) => u.name)).toEqual(['나']);
        const it1 = getNotifications().items.at(-1)!;
        expect(it1.action?.commandId).toBe(api.cmd.undo);
        expect(it1.action?.args).toEqual({ undoTop: expect.any(Number) });
        expect(actionState(it1).kind).toBe('ready');
        runNotifyAction(it1.id);
        expect(core.listUsers().map((u) => u.id)).toEqual([a, b, c]);   // 원래 자리·순서

        // 다시 지운 뒤 다른 작업(이름 바꾸기)이 쌓이면 옛 단추는 남의 작업을 안 되돌린다
        core.removeAndNotify(host(), 'users', [b]);
        const it2 = getNotifications().items.at(-1)!;
        api.rename(a, '가가');
        expect(actionState(it2).kind).toBe('stale');
        runNotifyAction(it2.id);
        expect(core.listUsers().map((u) => u.id)).toEqual([a, c]);
    });
});
