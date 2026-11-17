// @vitest-environment jsdom
/**
 * 방 예약 보기 — 옛 특별실 예약(ops-room)의 기능 목록(예약 생성 · 빈 방 목록 · 내 예약 목록 · 취소)이 room-booking 위에서 그대로 되는지.
 *   진짜 달력 저장소·노드 저장소를 쓰고 rooms 약속만 가짜로 둔다. ⛔ 실명 금지 — 지어낸 이름만.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
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

import { initStore } from '../../pane-ui-system/core/node-store/store';
import { __resetPersistForTest } from '../../pane-ui-system/core/node-store/persist';
import { makeNodesApi } from '../../pane-ui-system/core/node-frame/api';
import { registerType, clearTypes } from '../../pane-ui-system/core/nodes/model/types';
import { clearDerived } from '../../pane-ui-system/core/nodes/model/derive';
import { calendarNodeTypes, calendarNodeTypeImpl, initCalendarNodes, getNodesApi, clearPendingCard } from '../calendar/nodes';
import { __resetPresets } from '../calendar/presets';
import { RoomEmptyBanner } from './RoomEmptyNotice';
import { calendarModule } from '../calendar/feed';
import type { Room, RoomProps, Rooms } from '../rooms/contracts/rooms';
import { dayIndexOf } from '../../../shared/room-rules.ts';
import { ROOM_BOOKING_PRESET } from './index';
import { allRooms, bookRoom, bookingsOn, cancelBooking, findFreeRooms, myBookings, type BookInput, type BookingDeps } from './bookings';
import { RoomBookingView } from './RoomBookingView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DAY = '2099-01-05';   // 먼 날 — 「지난 날짜」 거절에 안 걸린다
const TODAY = '2098-12-31';
const dayRoom: Room[] = [
    { id: 'r-hall', listId: 'l', name: '가상 강당' },
    { id: 'r-lab', listId: 'l', name: '가상 실험실' },
    { id: 'r-off', listId: 'l', name: '가상 창고' },
    { id: 'r-fix', listId: 'l', name: '가상 음악실', ext: { 'room-booking': { fixed: [{ dayIndex: dayIndexOf(DAY), startMin: 580, endMin: 620, label: '가상 동아리' }] } } },
];
const propsOf: Record<string, RoomProps> = {
    'r-hall': { active: true, sort: 1 }, 'r-lab': { active: true, sort: 2, capacity: 20 }, 'r-off': { active: false, sort: 3 }, 'r-fix': { active: true, sort: 4 },
};
const fakeRooms = {
    lists: () => [{ id: 'l', name: '가상 방 목록' }], roomsIn: () => dayRoom, room: (id: string) => dayRoom.find((r) => r.id === id),
    roomProps: (id: string) => propsOf[id] ?? { active: true }, onChange: (): Disposable => ({ dispose() {} }),
} as unknown as Rooms;

function host(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
        workspace: { open: () => {} },
    } as unknown as PluginHost;
}
let disp: Disposable | null = null;
let preset: Disposable | null = null;
let root: Root | null = null;
const deps = (): BookingDeps => ({ calendar: calendarModule, nodes: getNodesApi()!, rooms: fakeRooms });
const input = (o: Partial<BookInput> = {}): BookInput => ({ roomId: 'r-hall', date: DAY, start: '09:40', end: '10:20', name: '1-1', booker: '가상갑', headcount: null, ...o });

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
    preset = calendarModule.registerPreset(ROOM_BOOKING_PRESET);
});
afterEach(() => {
    act(() => { root?.unmount(); }); root = null; document.body.innerHTML = '';
    preset?.dispose(); preset = null; disp?.dispose(); disp = null; clearPendingCard(); __resetPersistForTest(); __resetPresets();
});

describe('방 예약 보기 — 전후 기능 목록', () => {
    it('예약 생성: 달력 일정으로 쓰이고 그날 예약 목록에 방 이름·시각·이름으로 뜬다', () => {
        const r = bookRoom(deps(), input({ headcount: 12 }), TODAY);
        expect(r.ok).toBe(true);
        const rows = bookingsOn(deps(), DAY);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ roomId: 'r-hall', roomName: '가상 강당', name: '1-1', booker: '가상갑', headcount: 12, start: `${DAY}T09:40`, end: `${DAY}T10:20` });
        expect(getNodesApi()!.liveByType('calendar.event')).toHaveLength(1);   // 저장은 달력 일정 하나뿐
    });

    it('예약 생성 거절: 같은 방 같은 시간 · 정원 초과 · 쓰지 않는 방 · 고정 시간 · 지난 날 · 빈 이름', () => {
        expect(bookRoom(deps(), input(), TODAY).ok).toBe(true);
        const why = (o: Partial<BookInput>, today = TODAY) => { const r = bookRoom(deps(), input(o), today); return r.ok ? '' : r.reason; };
        expect(why({ name: '1-2', start: '10:00', end: '10:30' })).toContain('이미 예약');
        expect(why({ roomId: 'r-lab', headcount: 30 })).toContain('정원');
        expect(why({ roomId: 'r-off' })).toContain('쓰지 않는 방');
        expect(why({ roomId: 'r-fix' })).toContain('고정');
        expect(why({}, '2099-02-01')).toContain('지난 날짜');
        expect(why({ name: ' ', roomId: 'r-lab' })).toContain('예약 이름');
        expect(bookingsOn(deps(), DAY)).toHaveLength(1);
    });

    it('빈 방 목록: 쓰는 방 중 그 시각에 쓸 수 있는 방만 — 예약된 방·고정 방·쓰지 않는 방은 빠진다', () => {
        const ids = () => findFreeRooms(deps(), DAY, '09:40', '10:20', null, TODAY).map((r) => r.id);
        expect(ids()).toEqual(['r-hall', 'r-lab']);
        expect(allRooms(fakeRooms)).toHaveLength(4);
        expect(findFreeRooms(deps(), DAY, '09:40', '10:20', 30, TODAY).map((r) => r.id)).toEqual(['r-hall']);   // 정원 20 인 실험실은 30명이 못 든다
        bookRoom(deps(), input(), TODAY);
        expect(ids()).toEqual(['r-lab']);
        expect(findFreeRooms(deps(), DAY, '11:00', '11:40', null, TODAY).map((r) => r.id)).toEqual(['r-hall', 'r-lab', 'r-fix']);
    });

    it('내 예약 목록: 예약자가 나인 것만, 날짜순', () => {
        bookRoom(deps(), input({ start: '11:00', end: '11:40' }), TODAY);
        bookRoom(deps(), input({ roomId: 'r-lab', booker: '가상을' }), TODAY);
        bookRoom(deps(), input({ date: '2099-01-04', roomId: 'r-lab' }), TODAY);
        expect(myBookings(deps(), '가상갑', TODAY).map((b) => b.start)).toEqual(['2099-01-04T09:40', `${DAY}T11:00`]);
        expect(myBookings(deps(), '가상을', TODAY)).toHaveLength(1);
        expect(myBookings(deps(), '', TODAY)).toEqual([]);
    });

    it('취소: 일정이 지워져 빈 방이 되살아나고, 지난 예약은 못 지운다', () => {
        bookRoom(deps(), input(), TODAY);
        const [b] = myBookings(deps(), '가상갑', TODAY);
        expect(cancelBooking(deps(), b, '2099-02-01')).toMatchObject({ ok: false });
        expect(bookingsOn(deps(), DAY)).toHaveLength(1);
        expect(cancelBooking(deps(), b, TODAY)).toEqual({ ok: true });
        expect(bookingsOn(deps(), DAY)).toHaveLength(0);
        expect(findFreeRooms(deps(), DAY, '09:40', '10:20', null, TODAY).map((r) => r.id)).toContain('r-hall');
    });
});

describe('방 예약 화면 — 눌러서', () => {
    it('빈 방 예약 → 내 예약에 뜨고 취소하면 사라진다', () => {
        const el = document.createElement('div'); document.body.appendChild(el);
        root = createRoot(el);
        const h = { modules: { use: (n: string) => (n === 'calendar' ? calendarModule : n === 'nodes' ? getNodesApi() : fakeRooms) } } as unknown as PluginHost;
        act(() => { root!.render(<RoomBookingView host={h} />); });
        const type = (placeholder: string, v: string) => {
            const input = el.querySelector(`input[placeholder="${placeholder}"]`) as HTMLInputElement;
            const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
            act(() => { set.call(input, v); input!.dispatchEvent(new Event('input', { bubbles: true })); });
        };
        const click = (label: string) => act(() => { [...el.querySelectorAll('button')].find((x) => x.textContent === label)?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect(el.textContent).toContain('가상 강당');
        type('1-1', '1-1'); type('가상 선생님', '가상갑');
        click('가상 강당 예약');
        expect(el.textContent).toContain('예약했습니다');
        expect(el.textContent).toContain('내 예약 1건');
        expect(el.textContent).toMatch(/가상 강당 · \d{4}-\d\d-\d\d \d\d:\d\d~\d\d:\d\d · 1-1/);
        expect(el.querySelector('[data-free-room="r-hall"]')).toBeNull();   // 방금 잡은 방은 빈 방에서 빠진다
        click('취소');
        expect(el.textContent).toContain('취소했습니다');
        expect(el.textContent).toContain('내 예약 0건');
    });
});

describe('방 예약 화면 — 빈 상태', () => {
    it('방이 없으면 안내 문구와 「특별실 관리 열기」 단추가 약속의 cmd 로 명령을 돈다', () => {
        const el = document.createElement('div'); document.body.appendChild(el);
        root = createRoot(el);
        const run = vi.fn();
        const emptyRooms = { ...fakeRooms, roomsIn: () => [] } as unknown as Rooms;
        const h = { commands: { run }, modules: { use: (n: string) => (n === 'calendar' ? calendarModule : n === 'nodes' ? getNodesApi() : n === 'ops-room' ? { version: 1, cmd: { openManage: 'ops-room.open-manage' } } : emptyRooms) } } as unknown as PluginHost;
        act(() => { root!.render(<RoomBookingView host={h} />); });
        expect(el.querySelector('[data-room-free-empty]')!.textContent).toContain('특별실 관리에서 방을 먼저 더해 주세요');
        const btn = [...el.querySelectorAll('button')].find((x) => x.textContent === '특별실 관리 열기')!;
        act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect(run).toHaveBeenCalledWith('ops-room.open-manage');
    });
});

describe('방 예약 달력 띠 — 방 0개', () => {
    const mk = (rms: Rooms, run = vi.fn()) => ({ commands: { run }, modules: { use: (n: string) => (n === 'rooms' ? rms : n === 'ops-room' ? { version: 1, cmd: { openManage: 'ops-room.open-manage' } } : null) } }) as unknown as PluginHost;
    it('방이 0개면 안내·단추가 뜨고 단추는 약속의 cmd 를 돈다 · 방이 있으면 아무것도 안 그린다', () => {
        const el = document.createElement('div'); document.body.appendChild(el);
        root = createRoot(el);
        const run = vi.fn();
        const emptyRooms = { ...fakeRooms, roomsIn: () => [] } as unknown as Rooms;
        act(() => { root!.render(<RoomEmptyBanner host={mk(emptyRooms, run)} />); });
        expect(el.querySelector('[data-room-empty-banner]')!.textContent).toContain('특별실 관리에서 방을 먼저 더해 주세요');
        const btn = [...el.querySelectorAll('button')].find((x) => x.textContent === '특별실 관리 열기')!;
        act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect(run).toHaveBeenCalledWith('ops-room.open-manage');
        act(() => { root!.render(<RoomEmptyBanner host={mk(fakeRooms as unknown as Rooms)} />); });
        expect(el.querySelector('[data-room-empty-banner]')).toBeNull();
    });
    it('프리셋이 banner 를 든다', () => { expect(typeof ROOM_BOOKING_PRESET.banner).toBe('function'); });
});
