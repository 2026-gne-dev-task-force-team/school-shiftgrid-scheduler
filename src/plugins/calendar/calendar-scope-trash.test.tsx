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

import { initStore, getState } from '../../pane-ui-system/core/node-store/store';
import { followActivatedLeaf } from '../../pane-ui-system/core/node-frame/leaf-follow';
import { __resetPersistForTest } from '../../pane-ui-system/core/node-store/persist';
import { makeNodesApi } from '../../pane-ui-system/core/node-frame/api';
import { registerType, clearTypes } from '../../pane-ui-system/core/nodes/model/types';
import { clearDerived } from '../../pane-ui-system/core/nodes/model/derive';
import { calendarNodeTypes, calendarNodeTypeImpl, initCalendarNodes, getNodesApi, STORE_TYPE, EVENT_TYPE, removeEvent } from './nodes';
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

    it('fix-a 6: 범위 저장소 탭은 leafId 를 틀에 넘겨 — 탭이 활성화되면 속성 패널이 그 저장소를 따라간다', () => {
        const api = getNodesApi()!;
        const sid = api.create(api.roots.main, { type: STORE_TYPE, name: '범위 달력' });
        setScope(sid);
        const el = document.createElement('div');
        document.body.appendChild(el);
        root = createRoot(el);
        const peek = { show() {}, hide() {}, visible: false } as unknown as PeekHandle;
        act(() => { root!.render(<CalendarTab peek={peek} host={host()} leafId="LCAL" />); });
        expect(getState().selectedId).toBe(sid);
        act(() => { followActivatedLeaf({ id: 'LCAL', area: 'center' }); });
        expect(getState().selectedId).toBe(sid);
    });

    it('V6 #3: 일정을 지우면 달력 툴바에 「삭제한 일정 1」 단추가 뜬다', () => {
        const api = getNodesApi()!;
        const sid = api.create(api.roots.main, { type: STORE_TYPE, name: '달력' });
        const eid = api.create(sid, { type: EVENT_TYPE, name: '회의' });
        const el = document.createElement('div');
        document.body.appendChild(el);
        root = createRoot(el);
        const peek = { show() {}, hide() {}, visible: false } as unknown as PeekHandle;
        act(() => { root!.render(<CalendarTab peek={peek} host={host()} />); });
        expect(el.querySelector('[data-cal-deleted]')).toBeNull();
        act(() => { removeEvent(eid); });
        const btn = el.querySelector('[data-cal-deleted]');
        expect(btn?.textContent).toContain('삭제한 일정 1');
    });
});
