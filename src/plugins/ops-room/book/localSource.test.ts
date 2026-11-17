// @vitest-environment jsdom
/**
 * 옛 예약(localStorage) → 달력 일정 이사 시험(R9) — 이사 전후 같은 값 · 두 번 돌려도 같음 · 겹침은 건너뜀 · 옛 값은 안 지움.
 *   달력·노드·방은 손으로 만든 가짜(약속 모양만) — 시험 자료는 지어낸 이름만.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { NodesApi } from '../../../pane-ui-system/core/nodes/contracts/nodes';
import type { Calendar, Occurrence } from '../../calendar/contracts/calendar';
import type { Rooms } from '../../rooms/contracts/rooms';
import { LS_KEY, isMoved, moveLocalReservations, moveSummary, movedKeyOf } from './migrate';
import { demoPart, localRoomSource } from './source';
import type { ReservationRow } from './types';

beforeEach(() => { localStorage.clear(); });

interface N { id: string; type: string; name: string; data: unknown; parent: string }
function world(roomList: { id: string; name: string }[] = [{ id: 'k-sci', name: '과학실' }, { id: 'k-yard', name: '운동장' }]) {
    const nodes = new Map<string, N>();
    let seq = 0;
    const api = {
        roots: { main: 'root' },
        get: (id: string) => nodes.get(id),
        liveByType: (t: string) => [...nodes.values()].filter((n) => n.type === t),
        create: (parent: string, s: { type: string; name: string; data?: unknown }) => { const id = `n${++seq}`; nodes.set(id, { id, type: s.type, name: s.name, data: s.data ?? {}, parent }); return id; },
        batch: (fn: () => void) => fn(),
    } as unknown as NodesApi;
    const calendar = {
        newPresetStore: (preset: string) => api.create('root', { type: 'calendar.store', name: '예약 목록', data: { preset } }),
        occurrences: (storeId: string, from: string, to: string): Occurrence[] => [...nodes.values()]
            .filter((n) => n.type === 'calendar.event' && n.parent === storeId)
            .map((n) => { const w = (n.data as { values: { when: { start: string; end: string } } }).values.when; return { eventId: n.id, start: w.start, end: w.end } as Occurrence; })
            .filter((o) => o.start < to && from < o.end),
    } as unknown as Calendar;
    const rooms = {
        lists: () => [{ id: 'L', name: '방 목록' }],
        roomsIn: () => roomList.map((r) => ({ ...r, listId: 'L' })),
        room: (id: string) => roomList.map((r) => ({ ...r, listId: 'L' })).find((r) => r.id === id),
    } as unknown as Rooms;
    const events = () => [...nodes.values()].filter((n) => n.type === 'calendar.event');
    return { deps: { calendar, nodes: api, rooms }, events };
}
const old = (over: Partial<ReservationRow> = {}): ReservationRow => ({
    id: 'x1', projectId: 'p1', roomId: 'r-sci', date: '2026-11-19', startMin: 540, endMin: 580, slotNo: 1, trackName: '1-1', createdAt: 't1',
    body: { userId: 'u1', userName: '교사01', note: '' }, ...over,
});
const stash = (rows: ReservationRow[]) => localStorage.setItem(LS_KEY, JSON.stringify({ part: demoPart(), rows }));

describe('옛 예약 이사 — 이사 전후 같은 값', () => {
    it('방(이름으로 잇기)·날짜·시각·반·예약자가 room-booking 이 읽는 칸 꼴로 옮겨진다', () => {
        stash([old(), old({ id: 'x2', roomId: 'r-yard', startMin: 600, endMin: 640, trackName: '2-1', body: { userId: 'u2', userName: '교사02', note: '체육' } })]);
        const w = world();
        expect(moveLocalReservations(w.deps, localStorage)).toEqual({ moved: 2, skipped: 0, done: false });
        const evs = w.events();
        expect(evs.map((e) => e.name)).toEqual(['1-1', '2-1 체육']);
        expect(evs.map((e) => (e.data as { values: unknown }).values)).toEqual([
            { when: { start: '2026-11-19T09:00', end: '2026-11-19T09:40' }, f_room: ['k-sci'], f_booker: '교사01' },
            { when: { start: '2026-11-19T10:00', end: '2026-11-19T10:40' }, f_room: ['k-yard'], f_booker: '교사02' },
        ]);
        expect(w.deps.nodes.liveByType('calendar.store')[0].data).toEqual({ preset: 'room-booking.default' });
    });
    it('같은 방·시각이 겹치면 건너뛰고 건수를 센다(자리 번호만 다른 행 · 겹치는 시각)', () => {
        stash([old(), old({ id: 'x2', slotNo: 2, trackName: '1-2' }), old({ id: 'x3', startMin: 570, endMin: 610 }), old({ id: 'x4', startMin: 600, endMin: 640 })]);
        const r = moveLocalReservations(world().deps, localStorage);
        expect(r).toEqual({ moved: 2, skipped: 2, done: false });
        expect(moveSummary(r)).toBe('2건 옮김 · 2건 건너뜀');
    });
    it('찾을 수 없는 방의 예약은 건너뛴다', () => {
        stash([old({ roomId: 'r-none' })]);
        expect(moveLocalReservations(world().deps, localStorage)).toMatchObject({ moved: 0, skipped: 1 });
    });
});

describe('두 번 돌려도 같음 · 옛 값은 지우지 않음', () => {
    it('두 번째는 아무것도 안 하고 done, 일정 수는 그대로', () => {
        stash([old(), old({ id: 'x2', startMin: 600, endMin: 640 })]);
        const w = world();
        moveLocalReservations(w.deps, localStorage);
        const again = moveLocalReservations(w.deps, localStorage);
        expect(again).toEqual({ moved: 0, skipped: 0, done: true });
        expect(w.events()).toHaveLength(2);
        expect(moveSummary(again)).toBe('이미 옮겼습니다.');
    });
    it('표시 키가 지워져 다시 돌아도 겹침으로 막혀 중복이 안 생긴다', () => {
        stash([old()]);
        const w = world();
        moveLocalReservations(w.deps, localStorage);
        localStorage.removeItem(movedKeyOf());
        expect(moveLocalReservations(w.deps, localStorage)).toMatchObject({ moved: 0, skipped: 1 });
        expect(w.events()).toHaveLength(1);
    });
    it('옛 값은 그대로 두고 표시 키만 더한다', () => {
        stash([old()]);
        const before = localStorage.getItem(LS_KEY);
        moveLocalReservations(world().deps, localStorage);
        expect(localStorage.getItem(LS_KEY)).toBe(before);
        expect(isMoved(localStorage)).toBe(true);
        expect(JSON.parse(localStorage.getItem(movedKeyOf())!)).toEqual({ moved: 1, skipped: 0 });
    });
    it('저장된 값이 없거나 깨졌어도 던지지 않고 표시만 남긴다', () => {
        expect(moveLocalReservations(world().deps, localStorage)).toEqual({ moved: 0, skipped: 0, done: false });
        localStorage.clear();
        localStorage.setItem(LS_KEY, '{깨짐');
        expect(moveLocalReservations(world().deps, localStorage).moved).toBe(0);
    });
});

describe('이사 뒤 ops-room 은 옛 예약 행을 안 읽는다', () => {
    it('이사 전엔 읽고, 이사 뒤엔 예약 행은 비고 방 묶음만 읽는다', async () => {
        stash([old()]);
        expect((await localRoomSource(demoPart).loadReservations('2026-11-19')).map((r) => r.id)).toEqual(['x1']);
        moveLocalReservations(world().deps, localStorage);
        const after = localRoomSource(demoPart);
        expect(await after.loadReservations('2026-11-19')).toEqual([]);
        expect((await after.loadPart()).rooms).toHaveLength(2);
    });
});

describe('localRoomSource — 다시 만들어도 값이 남는다(이사 전 옛 동작)', () => {
    it('방 더하기가 남는다', async () => {
        const a = localRoomSource(demoPart);
        const part = await a.loadPart();
        await a.savePart({ ...part, rooms: [...part.rooms, { id: 'r-new', name: '음악실', capacity: 1, resourceKey: null, active: true, sort: 3, note: '' }] });
        expect((await localRoomSource(demoPart).loadPart()).rooms.map((r) => r.id)).toContain('r-new');
    });
    it('저장된 값이 없거나 깨졌으면 seed, 던지지 않는다', async () => {
        expect((await localRoomSource(demoPart).loadPart()).rooms).toHaveLength(2);
        localStorage.setItem('plugin.ops-room.part', '{깨짐');
        expect((await localRoomSource(demoPart).loadPart()).rooms).toHaveLength(2);
    });
});
