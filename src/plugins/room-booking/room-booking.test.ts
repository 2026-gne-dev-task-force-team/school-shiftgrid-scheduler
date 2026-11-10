/**
 * 방 예약 프리셋 — 새로 만들기 항목 · 생성하면 저장소 + 방 목록(rooms.list · 있으면 같이 씀) · 「방」 칸이 그 방 목록을 가리킴 · 꺼짐 → 기본 달력.
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
import { registerType, clearTypes, createIconOf, getType } from '../explorer/model/types';
import { clearDerived } from '../explorer/model/derive';
import { calendarNodeTypes, calendarNodeTypeImpl, initCalendarNodes, getNodesApi, storeMenu, clearPendingCard, STORE_TYPE } from '../calendar/nodes';
import { baseFieldsOf, createPresetStore, __resetPresets } from '../calendar/presets';
import { calendarModule } from '../calendar/feed';

function host(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
        workspace: { open: () => {} },
    } as unknown as PluginHost;
}
let disp: Disposable | null = null;
beforeEach(async () => {
    kv.store.clear();
    clearTypes(); clearDerived(); __resetPersistForTest();
    await initStore(host());
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
    registerType({ type: 'collection.db', label: '컬렉션', icon: 'database', container: true });
    registerType({ type: 'rooms.list', label: '방 목록', icon: 'door', container: true });
    registerType({ type: 'rooms.room', label: '방', icon: 'door', record: true });
    const api = makeNodesApi('calendar');
    for (const nt of calendarNodeTypes) api.registerContributed(nt, { nodeTypes: calendarNodeTypeImpl }, host());
    disp = initCalendarNodes(api);
});
afterEach(() => { disp?.dispose(); disp = null; clearPendingCard(); __resetPersistForTest(); __resetPresets(); });

import { presetOf, DEFAULT_PRESET } from '../calendar/presets';
import { ROOM_BOOKING_PRESET, roomBookingPlugin } from './index';
import { relationCandidates, type RelationTarget } from '../collection/fields/relation';

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

    it('방 목록은 같이 쓴다 — 둘째 예약 목록은 새로 안 만들고 있는 방 목록을 가리킨다', async () => {
        calendarModule.registerPreset(ROOM_BOOKING_PRESET);
        const a = createPresetStore(ROOM_BOOKING_PRESET.id);
        const b = createPresetStore(ROOM_BOOKING_PRESET.id);
        await Promise.resolve();
        const target = (s: string) => baseFieldsOf(s)[0].config as { target: { nodeId: string }; many: boolean };
        const ra = (getNodesApi()!.get(a)!.data as { roomListId: string }).roomListId;
        const rb = (getNodesApi()!.get(b)!.data as { roomListId: string }).roomListId;
        expect(rb).toBe(ra);
        expect(getNodesApi()!.liveByType('rooms.list')).toHaveLength(1);
        expect(target(a)).toEqual({ target: { kind: 'db', nodeId: ra }, many: false });
        expect(baseFieldsOf(a)[0]).toMatchObject({ key: 'f_room', label: '방', type: 'relation' });
    });

    it('방 목록 플러그인에서 미리 만든 목록이 있으면 그걸 가리킨다', async () => {
        const api = getNodesApi()!;
        const pre = api.create(api.roots.main, { type: 'rooms.list', name: '본관 방들' });
        calendarModule.registerPreset(ROOM_BOOKING_PRESET);
        const sid = createPresetStore(ROOM_BOOKING_PRESET.id);
        await Promise.resolve();
        expect((api.get(sid)!.data as { roomListId: string }).roomListId).toBe(pre);
    });

    it('설계 4-2: 방 목록(rooms.list)의 방(rooms.room)이 「방」 칸 고르기 후보로 나온다 — 방 안의 방은 경로째', async () => {
        calendarModule.registerPreset(ROOM_BOOKING_PRESET);
        const api = getNodesApi()!;
        const sid = createPresetStore(ROOM_BOOKING_PRESET.id);
        await Promise.resolve();
        const cfg = baseFieldsOf(sid)[0].config as { target: RelationTarget & { nodeId: string } };
        expect(api.get(cfg.target.nodeId)?.type).toBe('rooms.list');
        const top = api.create(cfg.target.nodeId, { type: 'rooms.room', name: 'qa-본관' });
        api.create(cfg.target.nodeId, { type: 'rooms.room', name: 'qa-음악실', data: { parentId: top } });
        expect(relationCandidates(api, cfg.target).map((c) => [c.name, c.path])).toEqual([['qa-본관', []], ['qa-음악실', ['qa-본관']]]);
    });

    it('팔레트 「새 방 예약」 — 달력 약속 newPresetStore 로 맨 위에 예약 목록을 만든다', async () => {
        calendarModule.registerPreset(ROOM_BOOKING_PRESET);
        const cmd = roomBookingPlugin.manifest.contributes?.commands?.find((c) => c.id === 'room-booking.new');
        expect(cmd).toMatchObject({ title: '새 방 예약', icon: 'door' });
        roomBookingPlugin.commands!['room-booking.new']({ modules: { use: () => calendarModule } } as unknown as PluginHost);
        await Promise.resolve();
        const api = getNodesApi()!;
        const [store] = api.liveByType(STORE_TYPE);
        expect(store).toMatchObject({ name: '예약 목록' });
        expect(api.parent(store.id)).toBe(api.roots.main);
        expect((store.data as { preset: string }).preset).toBe('room-booking.default');
    });

    it('리본 「방 예약」 — 없으면 만들고, 있으면 그 예약 목록을 연다(누를 때마다 새로 만들지 않는다)', async () => {
        calendarModule.registerPreset(ROOM_BOOKING_PRESET);
        const api = getNodesApi()!;
        const h = { modules: { use: (n: string) => (n === 'nodes' ? api : calendarModule) } } as unknown as PluginHost;
        expect(roomBookingPlugin.manifest.contributes?.ribbon).toEqual([{ commandId: 'room-booking.open', icon: 'door', order: 5 }]);
        roomBookingPlugin.commands!['room-booking.open'](h);
        roomBookingPlugin.commands!['room-booking.open'](h);
        await Promise.resolve();
        expect(api.liveByType(STORE_TYPE)).toHaveLength(1);
    });

    it('탐색기 「새로 만들기」 변형 — 프리셋마다 한 줄, 고른 자리 밑에 만든다 · 저장소 아이콘은 프리셋을 따른다', async () => {
        const d = calendarModule.registerPreset(ROOM_BOOKING_PRESET);
        const api = getNodesApi()!;
        const folder = api.create(api.roots.main, { type: 'folder', name: '본관' });
        const vs = calendarNodeTypeImpl.store.createVariants(folder);
        expect(vs.map((v) => [v.label, v.icon])).toEqual([['방 예약', 'door']]);
        vs[0].run();
        await Promise.resolve();
        const [store] = api.liveByType(STORE_TYPE);
        expect(api.parent(store.id)).toBe(folder);
        expect(calendarNodeTypeImpl.store.icon(store)).toBe('door');
        d.dispose();
        expect(calendarNodeTypeImpl.store.icon(store)).toBe('calendar');
        expect(calendarNodeTypeImpl.store.createVariants(folder)).toEqual([]);
        // 함수 아이콘이어도 「새 달력 저장소」 줄은 선언한 달력 아이콘('+' 로 떨어지지 않는다)
        expect(createIconOf(getType(STORE_TYPE)!)).toBe('calendar');
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
