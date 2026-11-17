import { describe, expect, it } from 'vitest';
import { HttpError } from '../_shared/errors.ts';
import { checkPart, makeCheckPart, shapeRules } from './check.ts';
import type { Role } from '../../../shared/roles.ts';

const ch = (id: string, over: object = {}) => ({ id, date: '2026-03-02', trackName: '1-1', period: 3, ...over });
const run = (part: string, roles: Role[], next: unknown, prev: unknown | null) =>
    checkPart({ projectId: 'p1', part, roles, next: { fmt: 1, body: next }, prev: prev === null ? null : { fmt: 1, body: prev } });
const code = (f: () => unknown) => {
    try {
        f();
    } catch (e) {
        return e instanceof HttpError ? `${e.status} ${e.code}` : 'other';
    }
    return 'none';
};

describe('꼴', () => {
    it('칸 경로를 돌려준다', () => {
        expect(shapeRules('ops.changes', [ch('a'), ch('b', { date: 5 })])).toEqual(['ops.changes[1].date']);
        expect(shapeRules('ops.changes', {})).toEqual(['ops.changes']);
        expect(shapeRules('ops.changes', [ch('a'), ch('a')])).toEqual(['ops.changes[1].id']);
        expect(shapeRules('ops.changes', [ch('a', { period: null })])).toEqual([]);
        expect(shapeRules('ops.aux', { monthClose: [{ id: 's:2026-03', staffId: 's', ym: '2026-3' }] })).toEqual(['ops.aux.monthClose[0].ym']);
        expect(shapeRules('ops.aux', { day: 1 })).toEqual(['ops.aux.day']);
        expect(shapeRules('doc', 'x')).toEqual([]);
    });
    it('꼴이 틀리면 차이는 보지 않는다', () => {
        expect(run('ops.changes', ['교사'], [{ id: 'a' }], [ch('a')])).toEqual(['ops.changes[0].date']);
    });
});

describe('ops.changes 차이', () => {
    const prev = [ch('a'), ch('b')];
    it('교사: 추가·삭제는 통과', () => {
        expect(run('ops.changes', ['교사'], [ch('a'), ch('b'), ch('c')], prev)).toEqual([]);
        expect(run('ops.changes', ['교사'], [ch('a')], prev)).toEqual([]);
    });
    it('교사: 기존 줄 수정은 403', () => {
        expect(code(() => run('ops.changes', ['교사'], [ch('a', { period: 4 }), ch('b')], prev))).toBe('403 changes_edit_forbidden');
    });
    it('교사 겸 교무·관리자는 수정 가능 · 첫 판은 통과', () => {
        expect(run('ops.changes', ['교사', '교무'], [ch('a', { period: 4 })], prev)).toEqual([]);
        expect(run('ops.changes', ['관리자'], [ch('a', { period: 4 })], prev)).toEqual([]);
        expect(run('ops.changes', ['교사'], [ch('a')], null)).toEqual([]);
    });
});

describe('ops.aux 마감', () => {
    const mc = (id: string, ym = '2026-03') => ({ id, staffId: id.split(':')[0], ym });
    const prev = { monthClose: [mc('s1:2026-03')] };
    it('근태담당: 마감 추가는 되고 해제·수정은 403', () => {
        expect(run('ops.aux', ['근태담당'], { monthClose: [mc('s1:2026-03'), mc('s2:2026-03')] }, prev)).toEqual([]);
        expect(code(() => run('ops.aux', ['근태담당'], { monthClose: [] }, prev))).toBe('403 month_close_admin_only');
        expect(code(() => run('ops.aux', ['근태담당'], { monthClose: [mc('s1:2026-03', '2026-04')] }, prev))).toBe('403 month_close_admin_only');
    });
    it('관리자는 해제 가능', () => {
        expect(run('ops.aux', ['관리자'], { monthClose: [] }, prev)).toEqual([]);
    });
});

describe('ops.aux 마감된 달 잠금(shared/ops-aux/month-lock)', () => {
    const close = { id: 's1:2026-03', staffId: 's1', ym: '2026-03' };
    const day = (id: string, date: string, over: object = {}) => ({ id, staffId: 's1', date, startMin: 540, endMin: 600, classKey: '', source: 'manual', ...over });
    const exc = (id: string, date: string, kind = '결근') => ({ id, staffId: 's1', date, kind, amount: -60, note: '' });
    const prev = { day: [day('d1', '2026-03-02'), day('d2', '2026-04-02')], exceptions: [exc('e1', '2026-03-03')], monthClose: [close] };
    it('마감된 달의 배정 추가·수정·삭제는 409 — 관리자도', () => {
        for (const roles of [['근태담당'], ['관리자']] as Role[][]) {
            expect(code(() => run('ops.aux', roles, { ...prev, day: [...prev.day, day('d3', '2026-03-09')] }, prev))).toBe('409 month_closed');
            expect(code(() => run('ops.aux', roles, { ...prev, day: [day('d1', '2026-03-02', { endMin: 660 }), prev.day[1]] }, prev))).toBe('409 month_closed');
            expect(code(() => run('ops.aux', roles, { ...prev, day: [prev.day[1]] }, prev))).toBe('409 month_closed');
        }
    });
    it('마감된 달의 예외 수정·삭제는 409 · 정정 추가는 통과', () => {
        expect(code(() => run('ops.aux', ['근태담당'], { ...prev, exceptions: [] }, prev))).toBe('409 month_closed');
        expect(code(() => run('ops.aux', ['근태담당'], { ...prev, exceptions: [...prev.exceptions, exc('e2', '2026-03-04')] }, prev))).toBe('409 month_closed');
        expect(run('ops.aux', ['근태담당'], { ...prev, exceptions: [...prev.exceptions, exc('e3', '2026-03-04', '정정')] }, prev)).toEqual([]);
    });
    it('안 마감된 달·다른 보조는 통과 · 관리자가 같은 판에서 해제하면 통과', () => {
        expect(run('ops.aux', ['근태담당'], { ...prev, day: [prev.day[0], day('d2', '2026-04-02', { endMin: 700 }), day('d4', '2026-04-03')] }, prev)).toEqual([]);
        expect(run('ops.aux', ['근태담당'], { ...prev, day: [...prev.day, day('d5', '2026-03-09', { staffId: 's2' })] }, prev)).toEqual([]);
        expect(run('ops.aux', ['관리자'], { ...prev, monthClose: [], day: [prev.day[1]] }, prev)).toEqual([]);
    });
});

describe('ops.rooms 칸 규칙 (D5)', () => {
    const room = (id: string, over: object = {}) => ({ id, name: `${id}실`, capacity: 2, resourceKey: null, active: true, sort: 0, note: '', ...over });
    const fx = (id: string, over: object = {}) => ({ id, roomId: 'r1', dayIndex: 1, startMin: 540, endMin: 580, label: '동아리', ...over });
    const body = (over: object = {}) => ({ rooms: [room('r1'), room('r2')], fixed: [fx('f1')], blocks: [], ...over });
    const asking: string[][] = [];
    const reservedOf = (ids: string[]) => {
        const set = new Set(ids);
        return makeCheckPart({ reservedRooms: async (_pid, q) => (asking.push(q), new Set(q.filter((i) => set.has(i)))) });
    };
    const put = (c: ReturnType<typeof makeCheckPart>, next: unknown, prev: unknown) =>
        c({ projectId: 'p1', part: 'ops.rooms', roles: ['교무'], next: { fmt: 1, body: next }, prev: prev === null ? null : { fmt: 1, body: prev } });

    it('꼴: 칸 경로를 돌려준다', () => {
        expect(shapeRules('ops.rooms', body())).toEqual([]);
        expect(shapeRules('ops.rooms', [])).toEqual(['ops.rooms']);
        expect(shapeRules('ops.rooms', body({ rooms: [room('r1', { capacity: 21 })] , fixed: [], blocks: [] }))).toEqual(['ops.rooms.rooms[0].capacity']);
        expect(shapeRules('ops.rooms', body({ fixed: [fx('f1', { endMin: 500 })] }))).toEqual(['ops.rooms.fixed[0].endMin']);
        expect(shapeRules('ops.rooms', body({ blocks: [{ id: 'b', roomId: 'r1', startDate: '2026-3-1', endDate: '2026-03-02', fromMin: null, toMin: null, reason: '' }] }))).toEqual(['ops.rooms.blocks[0].startDate']);
    });
    it('없는 방을 가리키는 고정은 걸린다', () => {
        expect(shapeRules('ops.rooms', body({ fixed: [fx('f1', { roomId: 'zz' })] }))).toEqual(['ops.rooms.fixed[0].roomId']);
    });
    it('고정 겹침: (방, 요일, 시작)이 같으면 둘째 줄이 걸린다 · 시작이 다르면 통과', () => {
        expect(shapeRules('ops.rooms', body({ fixed: [fx('f1'), fx('f2', { label: '또' })] }))).toEqual(['ops.rooms.fixed[1].startMin']);
        expect(shapeRules('ops.rooms', body({ fixed: [fx('f1'), fx('f2', { startMin: 590, endMin: 630 }), fx('f3', { roomId: 'r2' })] }))).toEqual([]);
    });
    it('예약 있는 방을 칸에서 지우면 409 · 예약 없는 방은 지워진다 · 끄기는 통과', async () => {
        const prev = body();
        const c = reservedOf(['r2']);
        await expect(put(c, body({ rooms: [room('r1')], fixed: [fx('f1')] }), prev)).rejects.toMatchObject({ status: 409, code: 'room_has_reservations' });
        expect(await put(c, body({ rooms: [room('r2')], fixed: [] }), prev)).toEqual([]);
        expect(await put(c, body({ rooms: [room('r1'), room('r2', { active: false })] }), prev)).toEqual([]);
        expect(asking).toEqual([['r2'], ['r1']]);
    });
    it('첫 판 · 꼴 틀림은 예약을 묻지 않는다', async () => {
        asking.length = 0;
        const c = reservedOf(['r1', 'r2']);
        expect(await put(c, body(), null)).toEqual([]);
        expect(await put(c, [], body())).toEqual(['ops.rooms']);
        expect(asking).toEqual([]);
    });
});
