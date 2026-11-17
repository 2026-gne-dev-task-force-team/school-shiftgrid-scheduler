// @vitest-environment jsdom
/**
 * 기동 때 이사 시험(T-10f7) — 활성하면 옛 예약이 달력 일정으로 옮겨지고 · 약속이 꺼져 있으면 미루고(표시 안 씀) · 두 번 돌아도 같고 ·
 *   가짜 호스트(약속 모양만) · 시험 자료는 지어낸 이름만.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PluginHost } from '../../../pane-ui-system/plugin';
import { opsRoomPlugin } from '../index';
import { initRoomMigration, runRoomMigration } from './boot';
import { LS_KEY, isMoved, movedKeyOf } from './migrate';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => { localStorage.clear(); });
afterEach(() => { document.body.innerHTML = ''; });

interface N { id: string; type: string; name: string; data: unknown; parent: string }
function world(opts: { calendar?: boolean; rooms?: boolean } = {}) {
    const map = new Map<string, N>();
    let seq = 0;
    const subs = new Set<() => void>();
    const roomList = [{ id: 'k-sci', name: '과학실' }];
    const nodes = {
        roots: { main: 'root' },
        get: (id: string) => map.get(id),
        liveByType: (t: string) => [...map.values()].filter((n) => n.type === t),
        create: (parent: string, s: { type: string; name: string; data?: unknown }) => { const id = `n${++seq}`; map.set(id, { id, type: s.type, name: s.name, data: s.data ?? {}, parent }); return id; },
        batch: (fn: () => void) => fn(),
        subscribe: (fn: () => void) => { subs.add(fn); return { dispose: () => { subs.delete(fn); } }; },
    };
    const calendar = {
        newPresetStore: (preset: string) => nodes.create('root', { type: 'calendar.store', name: '예약 목록', data: { preset } }),
        occurrences: (storeId: string, from: string, to: string) => [...map.values()].filter((n) => n.type === 'calendar.event' && n.parent === storeId)
            .map((n) => { const w = (n.data as { values: { when: { start: string; end: string } } }).values.when; return { eventId: n.id, start: w.start, end: w.end }; })
            .filter((o) => o.start < to && from < o.end),
    };
    const rooms = {
        lists: () => [{ id: 'L', name: '방 목록' }],
        roomsIn: () => roomList.map((r) => ({ ...r, listId: 'L' })),
        room: (id: string) => roomList.map((r) => ({ ...r, listId: 'L' })).find((r) => r.id === id),
    };
    const mods: Record<string, unknown> = { nodes, ...(opts.calendar === false ? {} : { calendar }), ...(opts.rooms === false ? {} : { rooms }) };
    const host = { modules: { use: (n: string) => mods[n] ?? null }, workspace: { open: () => undefined } } as unknown as PluginHost;
    return { host, events: () => [...map.values()].filter((n) => n.type === 'calendar.event'), fire: () => subs.forEach((f) => f()), mods };
}
const demoPart = () => ({ rooms: [{ id: 'r-sci', name: '과학실', capacity: 2, resourceKey: 'sci', active: true, sort: 1, note: '' }], fixed: [], blocks: [], timetable: [] });
const stash = () => localStorage.setItem(LS_KEY, JSON.stringify({ part: demoPart(), rows: [{ id: 'x1', projectId: 'p1', roomId: 'k-sci', date: '2026-11-19', startMin: 540, endMin: 580, slotNo: 1, trackName: '1-1', createdAt: 't1', body: { userId: 'u1', userName: '교사01', note: '' } }] }));

describe('특별실 예약 — 기동 때 이사', () => {
    it('활성하면 옛 예약이 일정으로 옮겨지고 옮김 표시가 선다', () => {
        stash();
        const w = world();
        opsRoomPlugin.lifecycle!.onActivate!(w.host);
        expect(w.events()).toHaveLength(1);
        expect((w.events()[0].data as { values: Record<string, unknown> }).values).toMatchObject({ when: { start: '2026-11-19T09:00', end: '2026-11-19T09:40' }, f_room: ['k-sci'], f_booker: '교사01' });
        expect(isMoved(localStorage)).toBe(true);
        opsRoomPlugin.lifecycle!.onDeactivate!();
    });
    it('약속(달력·방)이 꺼져 있으면 미루고 표시도 안 쓴다 — 켜진 뒤 다시 돈다 · 두 번 돌아도 같음', () => {
        stash();
        const off = world({ calendar: false });
        expect(runRoomMigration(off.host)).toBeNull();
        expect(off.events()).toHaveLength(0);
        expect(localStorage.getItem(movedKeyOf())).toBeNull();
        expect(runRoomMigration(world({ rooms: false }).host)).toBeNull();
        const on = world();
        expect(runRoomMigration(on.host)).toMatchObject({ moved: 1 });
        expect(runRoomMigration(on.host)).toBeNull();
        expect(on.events()).toHaveLength(1);
    });
    it('노드가 바뀌면 다시 시도한다 — 방이 늦게 떠도 따라잡는다', () => {
        stash();
        const w = world();
        const real = w.mods.rooms as { lists: () => unknown[] };
        const lists = real.lists;
        real.lists = () => [];
        const d = initRoomMigration(w.host);
        expect(isMoved(localStorage)).toBe(false);
        real.lists = lists;
        w.fire();
        expect(w.events()).toHaveLength(1);
        d.dispose();
    });
});
