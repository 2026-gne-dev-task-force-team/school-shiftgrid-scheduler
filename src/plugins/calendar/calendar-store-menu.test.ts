/**
 * 저장소 우클릭 메뉴 + 「새 일정」(C2 보강) — 쥔님 2026-11-02 *"하위 가능하고 그런건 다 어디갔노"*.
 *   저장소가 타입 표의 menu 칸을 안 써 우클릭에 「달력에서 열기」「새 일정」이 없던 것을 메꿨다.
 *   ① storeMenu 는 항목 둘(commandId)을 내고, 그릴 때 그 저장소를 명령 대상으로 잡아 둔다(getMenuTarget)
 *   ② newEventInStore 는 그 저장소에 「오늘 종일」 일정을 만들고 「열 카드」로 담는다(requestOpenCard)
 *   ③ 담으면 구독자(월 보기)가 깨어나고, 꺼내 비울 수 있다
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

import { initStore } from '../project-explorer/store';
import { __resetPersistForTest } from '../project-explorer/persist';
import { makeNodesApi } from '../project-explorer/api';
import { registerType, clearTypes, getType } from '../project-explorer/model/types';
import { clearDerived } from '../project-explorer/model/derive';
import {
    calendarNodeTypes, calendarNodeTypeImpl, initCalendarNodes, getNodesApi, getEventNodes,
    storeMenu, getMenuTarget, newEventInStore, getPendingCard, clearPendingCard, subscribeCardOpen,
    STORE_TYPE,
} from './nodes';

function host(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
    } as unknown as PluginHost;
}

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
afterEach(() => { disp?.dispose(); disp = null; clearPendingCard(); __resetPersistForTest(); });

describe('저장소 우클릭 메뉴', () => {
    it('① 타입 표에 menu 가 꽂혀 있고, 항목 둘(commandId)을 낸다', () => {
        const menu = getType(STORE_TYPE)?.menu;
        expect(typeof menu).toBe('function');
        const items = storeMenu('store-1');
        expect(items.map((i) => ('commandId' in i ? i.commandId : undefined)))
            .toEqual(['calendar.openStore', 'calendar.newEventIn']);
    });

    it('① 메뉴를 그리면 그 저장소를 명령 대상으로 잡아 둔다', () => {
        storeMenu('store-A');
        expect(getMenuTarget()).toBe('store-A');
        storeMenu('store-B');
        expect(getMenuTarget()).toBe('store-B');
    });
});

describe('새 일정(newEventInStore)', () => {
    it('② 그 저장소에 「오늘 종일」 일정을 만들고 「열 카드」로 담는다', () => {
        const sid = getNodesApi()!.create(getNodesApi()!.roots.main, { type: STORE_TYPE, name: '내 달력' });
        const id = newEventInStore(sid);
        expect(id).not.toBe('');

        // 그 저장소 밑에 생겼다
        expect(getNodesApi()!.parent(id)).toBe(sid);
        expect(getEventNodes().map((n) => n.id)).toContain(id);

        // 오늘 종일 — data 확인
        const data = getNodesApi()!.get(id)!.data as { start: string; end: string; allDay: boolean };
        const now = new Date();
        const p2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
        const todayMidnight = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}T00:00`;
        expect(data.allDay).toBe(true);
        expect(data.start).toBe(todayMidnight);

        // 「열 카드」로 담겼다
        expect(getPendingCard()).toBe(id);
    });

    it('③ 담으면 구독자가 깨어나고, 꺼내 비울 수 있다', () => {
        const sid = getNodesApi()!.create(getNodesApi()!.roots.main, { type: STORE_TYPE, name: 'c' });
        let hits = 0;
        const off = subscribeCardOpen(() => { hits++; });
        const id = newEventInStore(sid);
        expect(hits).toBe(1);                       // requestOpenCard 가 구독자를 깨웠다
        expect(getPendingCard()).toBe(id);
        clearPendingCard();
        expect(getPendingCard()).toBeNull();
        off();
    });
});
