// @vitest-environment jsdom
/**
 * 회귀 — 범위로 보던 저장소가 휴지통으로 가면 달력은 「전체」(scope=null)로 돌아온다(죽은 저장소에 갇히지 않는다).
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PluginHost, Disposable, PeekHandle } from '../../pane-ui-system/plugin';

const kv = vi.hoisted(() => {
    const store = new Map<string, Record<string, unknown>>();
    const nodesGetAll = vi.fn(async (): Promise<unknown[] | null> => [...store.values()]);
    const nodesWrite = vi.fn(async (b: { put?: Record<string, unknown>[]; del?: string[]; clear?: boolean }): Promise<boolean> => {
        if (b.clear) store.clear();
        for (const v of b.put ?? []) store.set(v.id as string, v);
        for (const id of b.del ?? []) store.delete(id);
        return true;
    });
    return { store, nodesGetAll, nodesWrite };
});
vi.mock('../../pane-ui-system/kv', () => ({ nodesGetAll: kv.nodesGetAll, nodesWrite: kv.nodesWrite }));

import { initStore } from '../explorer/store';
import { __resetPersistForTest } from '../explorer/persist';
import { makeNodesApi } from '../explorer/api';
import { registerType, clearTypes } from '../explorer/model/types';
import { clearDerived } from '../explorer/model/derive';
import { calendarNodeTypes, calendarNodeTypeImpl, initCalendarNodes, getNodesApi, STORE_TYPE } from './nodes';
import { setScope, getScope } from './store';
import { CalendarTab } from './views/CalendarTab';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function host(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
    } as unknown as PluginHost;
}

class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;

let disp: Disposable | null = null;
let root: Root | null = null;

beforeEach(async () => {
    kv.store.clear();
    clearTypes(); clearDerived(); __resetPersistForTest();
    await initStore(host());
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
    const api = makeNodesApi('calendar');
    for (const nt of calendarNodeTypes) api.registerContributed(nt, { nodeTypes: calendarNodeTypeImpl }, host());
    disp = initCalendarNodes(api);
});
afterEach(() => {
    act(() => { root?.unmount(); }); root = null; document.body.innerHTML = '';
    setScope(null); disp?.dispose(); disp = null; __resetPersistForTest();
});

describe('달력 범위 저장소 휴지통 회귀', () => {
    it('범위 저장소를 휴지통으로 보내면 범위가 전체(null)로 풀린다', () => {
        const api = getNodesApi()!;
        const sid = api.create(api.roots.main, { type: STORE_TYPE, name: '범위 달력' });
        setScope(sid);
        const el = document.createElement('div');
        document.body.appendChild(el);
        root = createRoot(el);
        const peek = { show() {}, hide() {}, visible: false } as unknown as PeekHandle;
        act(() => { root!.render(<CalendarTab peek={peek} host={host()} />); });
        expect(getScope()).toBe(sid);

        act(() => { api.remove(sid); });
        expect(api.isTrashed(sid)).toBe(true);
        expect(getScope()).toBeNull();
    });
});
