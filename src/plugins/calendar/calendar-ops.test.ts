/**
 * 달력 조작(C2) — 만들기·휴지통·복원·「기본」 자동·저장소 바꾸기. 🔴 nodes.ts 다리를 실제 탐색기 스토어에 걸고 센다.
 *   「달력에 보이는 일정」 = byType 에서 조상 휴지통인 것을 뺀 것(useEvents 가 하는 것과 같은 판정).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PluginHost, Disposable } from '../../pane-ui-system/plugin';

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

import { initStore, select, restoreSelected, undoAction, undoAllowed } from '../explorer/store';
import { __resetPersistForTest } from '../explorer/persist';
import { makeNodesApi } from '../explorer/api';
import { registerType, clearTypes } from '../explorer/model/types';
import { clearDerived } from '../explorer/model/derive';
import {
    calendarNodeTypes, calendarNodeTypeImpl, initCalendarNodes, getNodesApi, getEventNodes, getStoreNodes,
    inTrash, createEvent, ensureStore, moveEvent, removeEvent, setCalendarHost, STORE_TYPE, EVENT_TYPE,
} from './nodes';

function host(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
    } as unknown as PluginHost;
}

/** 달력에 실제로 보이는 일정 id(휴지통 조상 제외) — useEvents 와 같은 판정. */
const liveEventIds = () => getEventNodes().filter((n) => !inTrash(n.id)).map((n) => n.id);

let disp: Disposable | null = null;

beforeEach(async () => {
    kv.store.clear(); kv.nodesWrite.mockClear();
    clearTypes(); clearDerived(); __resetPersistForTest();
    await initStore(host());
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
    const api = makeNodesApi('calendar');
    for (const nt of calendarNodeTypes) api.registerContributed(nt, { nodeTypes: calendarNodeTypeImpl }, host());
    disp = initCalendarNodes(api);
});
afterEach(() => { disp?.dispose(); disp = null; __resetPersistForTest(); });

describe('C2 — 만들기·휴지통·복원·기본 저장소·저장소 바꾸기', () => {
    it('만들면 byType +1, 달력에도 +1', () => {
        expect(getEventNodes().length).toBe(0);
        const id = createEvent({ start: '2026-11-10T09:00', end: '2026-11-10T10:00', allDay: false }, '회의');
        expect(id).not.toBe('');
        expect(getNodesApi()!.byType(EVENT_TYPE).map((n) => n.id)).toEqual([id]);
        expect(liveEventIds()).toEqual([id]);
    });

    it('저장소가 없으면 「기본」을 한 번만 만든다', () => {
        expect(getStoreNodes().length).toBe(0);
        createEvent({ start: '2026-11-10T09:00', end: '2026-11-10T10:00', allDay: false }, 'a');
        createEvent({ start: '2026-11-11T09:00', end: '2026-11-11T10:00', allDay: false }, 'b');
        const stores = getStoreNodes();
        expect(stores.length).toBe(1);
        expect(stores[0].name).toBe('기본');
        expect(getNodesApi()!.children(stores[0].id).length).toBe(2);   // 두 일정이 같은 기본 저장소에
    });

    it('휴지통으로 보내면 달력에서 사라지고(byType엔 남고), 복원하면 돌아온다', () => {
        const id = createEvent({ start: '2026-11-10T09:00', end: '2026-11-10T10:00', allDay: false }, '회의');
        expect(liveEventIds()).toEqual([id]);

        removeEvent(id);
        expect(inTrash(id)).toBe(true);
        expect(getNodesApi()!.byType(EVENT_TYPE).length).toBe(1);   // byType 엔 그대로(휴지통도 셈)
        expect(liveEventIds()).toEqual([]);                          // 달력엔 없다

        select(id); restoreSelected();
        expect(inTrash(id)).toBe(false);
        expect(liveEventIds()).toEqual([id]);                        // 돌아왔다
    });

    it('휴지통으로 보내면 「되돌리기」 알림(토큰 포함)이 뜨고, 그 알림으로 되돌리면 달력에 돌아온다', () => {
        const notify = vi.fn();
        setCalendarHost({ ...host(), notify } as unknown as PluginHost);
        const id = createEvent({ start: '2026-11-10T09:00', end: '2026-11-10T10:00', allDay: false }, '회의');
        removeEvent(id);
        setCalendarHost(null);
        expect(notify).toHaveBeenCalledTimes(1);
        const n = notify.mock.calls[0][0];
        expect(n.title).toContain('회의');
        expect(n.title).toContain('휴지통으로 옮겼습니다');
        expect(n.action.label).toBe('되돌리기');
        expect(typeof n.action.args.undoTop).toBe('number');
        expect(undoAllowed(n.action.args)).toBe(true);
        expect(inTrash(id)).toBe(true);
        undoAction();
        expect(liveEventIds()).toEqual([id]);
    });

    it('저장소를 휴지통에 넣으면 그 안 일정도 달력에서 사라진다(캐스케이딩)', () => {
        const sid = ensureStore()!;
        const id = createEvent({ start: '2026-11-10T09:00', end: '2026-11-10T10:00', allDay: false }, '회의', sid);
        expect(liveEventIds()).toEqual([id]);
        getNodesApi()!.remove(sid);                                  // 저장소를 통째 휴지통으로
        expect(liveEventIds()).toEqual([]);                          // 일정도 안 보인다(조상 휴지통)
    });

    it('저장소를 바꾸면 parent 가 바뀐다', () => {
        const a = getNodesApi()!.create(getNodesApi()!.roots.main, { type: STORE_TYPE, name: 'A' });
        const b = getNodesApi()!.create(getNodesApi()!.roots.main, { type: STORE_TYPE, name: 'B' });
        const id = createEvent({ start: '2026-11-10T09:00', end: '2026-11-10T10:00', allDay: false }, '회의', a);
        expect(getNodesApi()!.parent(id)).toBe(a);
        moveEvent(id, b);
        expect(getNodesApi()!.parent(id)).toBe(b);
    });
});
