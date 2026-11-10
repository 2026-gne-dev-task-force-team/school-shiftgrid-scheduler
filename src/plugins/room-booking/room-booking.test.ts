/**
 * 방 예약 프리셋 — 새로 만들기 항목 · 생성하면 저장소+방 목록 · 「방」 칸이 그 방 목록을 가리킴 · 꺼짐 → 기본 달력.
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

import { initStore } from '../explorer/store';
import { __resetPersistForTest } from '../explorer/persist';
import { makeNodesApi } from '../explorer/api';
import { registerType, clearTypes } from '../explorer/model/types';
import { clearDerived } from '../explorer/model/derive';
import { calendarNodeTypes, calendarNodeTypeImpl, initCalendarNodes, getNodesApi, storeMenu, clearPendingCard, STORE_TYPE } from '../calendar/nodes';
import { baseFieldsOf, createPresetStore, __resetPresets } from '../calendar/presets';
import { calendarModule } from '../calendar/feed';

function host(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
    } as unknown as PluginHost;
}
let disp: Disposable | null = null;
beforeEach(async () => {
    kv.store.clear();
    clearTypes(); clearDerived(); __resetPersistForTest();
    await initStore(host());
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
    registerType({ type: 'rooms.list', label: '방 목록', icon: 'door', container: true });
    const api = makeNodesApi('calendar');
    for (const nt of calendarNodeTypes) api.registerContributed(nt, { nodeTypes: calendarNodeTypeImpl }, host());
    disp = initCalendarNodes(api);
});
afterEach(() => { disp?.dispose(); disp = null; clearPendingCard(); __resetPersistForTest(); __resetPresets(); });

import { presetOf, DEFAULT_PRESET } from '../calendar/presets';
import { ROOM_BOOKING_PRESET } from './index';

const mkStore = () => getNodesApi()!.create(getNodesApi()!.roots.main, { type: STORE_TYPE, name: 's', data: {} });

describe('방 예약 프리셋', () => {
    it('등록하면 저장소 메뉴에 「새 방 예약」 항목이 생기고, 해제하면 사라진다', () => {
        const d = calendarModule.registerPreset(ROOM_BOOKING_PRESET);
        const item = storeMenu(mkStore()).find((i) => 'commandId' in i && i.commandId === 'calendar.newPresetStore');
        expect(item).toMatchObject({ label: '새 방 예약', icon: 'door', commandArg: { args: 'room-booking.default' } });
        d.dispose();
        expect(storeMenu(mkStore()).some((i) => 'commandId' in i && i.commandId === 'calendar.newPresetStore')).toBe(false);
    });

    it('만들면 저장소(data.preset)와 옆에 방 목록이 생기고, 방 목록 id 가 저장소 data 에 담긴다', async () => {
        calendarModule.registerPreset(ROOM_BOOKING_PRESET);
        const api = getNodesApi()!;
        const sid = createPresetStore(ROOM_BOOKING_PRESET.id);
        await Promise.resolve();
        const data = api.get(sid)!.data as { preset: string; roomListId: string };
        expect(api.get(sid)!.name).toBe('예약 목록');
        expect(data.preset).toBe(ROOM_BOOKING_PRESET.id);
        expect(api.get(data.roomListId)).toMatchObject({ type: 'rooms.list', name: '방 목록' });
        expect(api.parent(data.roomListId)).toBe(api.parent(sid));
        expect(presetOf(sid).defaultView).toBe('week');
    });

    it('예약 카드의 「방」 칸은 그 저장소의 방 목록을 가리킨다(저장소마다 다르다)', async () => {
        calendarModule.registerPreset(ROOM_BOOKING_PRESET);
        const a = createPresetStore(ROOM_BOOKING_PRESET.id);
        const b = createPresetStore(ROOM_BOOKING_PRESET.id);
        await Promise.resolve();
        const target = (s: string) => baseFieldsOf(s)[0].config as { target: { nodeId: string }; many: boolean };
        const ra = (getNodesApi()!.get(a)!.data as { roomListId: string }).roomListId;
        const rb = (getNodesApi()!.get(b)!.data as { roomListId: string }).roomListId;
        expect(ra).not.toBe(rb);
        expect(target(a)).toEqual({ target: { kind: 'db', nodeId: ra }, many: false });
        expect(target(b).target.nodeId).toBe(rb);
        expect(baseFieldsOf(a)[0]).toMatchObject({ key: 'f_room', label: '방', type: 'relation' });
    });

    it('꾸러미를 끄면(해제) 기본 달력으로 보이고 칸이 사라진다 — 데이터는 그대로', async () => {
        const d = calendarModule.registerPreset(ROOM_BOOKING_PRESET);
        const sid = createPresetStore(ROOM_BOOKING_PRESET.id);
        await Promise.resolve();
        d.dispose();
        expect(presetOf(sid)).toBe(DEFAULT_PRESET);
        expect(baseFieldsOf(sid)).toEqual([]);
        expect((getNodesApi()!.get(sid)!.data as { roomListId?: string }).roomListId).toBeTruthy();
    });
});
