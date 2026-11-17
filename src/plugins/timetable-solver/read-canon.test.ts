/**
 * F5b — 정본 읽기 연결부 시험. 가짜 정본을 꽂아 ① 읽은 값이 편성 입력까지 이어지고 ② 비면 선생님 말 막힘이 나오는지 본다.
 *   ⛔ 실자료 0 — 이름은 전부 지어낸 것.
 */
import { describe, it, expect } from 'vitest';
import { readAndBuild, readCanon, NODE_TYPES, type CanonSources, type RowLike } from './read-canon';
import { clockApi } from '../bell/clock';
import { dutyApi } from '../duty/api';
import { SLOT_TYPE } from '../bell/config';
import { ENTRY_TYPE } from '../duty/config';
import { ROW_TYPE } from '../demand-table/config';
import { SHEET_TYPE } from '../timetable-grid/nodes';
import type { Staff } from '../staff/contracts/staff';
import type { School } from '../school/contracts/school';
import type { Subjects } from '../subjects/contracts/subjects';
import type { Rooms } from '../rooms/contracts/rooms';

const mods = { clock: clockApi, duty: dutyApi };
const row = (id: string, values: Record<string, unknown>): RowLike => ({ id, name: id, values });

const staff = {
    lists: () => [{ id: 'sl', name: '명단' }],
    staffIn: () => [
        { id: 't1', listId: 'sl', name: '가온', kind: 'subject', tier: 2 },
        { id: 't2', listId: 'sl', name: '나래', kind: 'homeroom', homeroomClassIds: ['c1'] },
    ],
} as unknown as Staff;
const school = {
    school: () => ({ id: 's', name: '가상초등학교' }),
    years: () => [{ id: 'y0', name: '2098' }, { id: 'y1', name: '2099' }],
    classesIn: (y: string) => (y === 'y1'
        ? [{ id: 'c1', yearId: 'y1', name: '1-1', grade: 1, rooms: [], special: false }]
        : [{ id: 'old', yearId: 'y0', name: '옛', rooms: [], special: false }]),
} as unknown as School;
const subjects = {
    lists: () => [{ id: 'bl', name: '과목' }],
    subjectsIn: () => [{ id: 'sub1', listId: 'bl', name: '가상과학' }],
} as unknown as Subjects;
const rooms = {
    lists: () => [{ id: 'rl', name: '방' }],
    roomsIn: () => [{ id: 'r1', listId: 'rl', name: '가상실험실' }, { id: 'r2', listId: 'rl', name: '닫힌방' }],
    roomProps: (id: string) => (id === 'r1' ? { active: true, capacity: 2 } : { active: false }),
} as unknown as Rooms;

const rowsByType: Record<string, RowLike[]> = {
    [NODE_TYPES.bellSlot]: [
        row('b1', { f_kind: 'class', f_period: 1, f_start: '09:00', f_end: '09:40' }),
        row('b2', { f_kind: 'class', f_period: 2, f_start: '09:50', f_end: '10:30' }),
    ],
    [NODE_TYPES.dutyEntry]: [row('d1', { f_person: ['t1'], f_start: '2099-03-10', f_allday: true })],
    [NODE_TYPES.demandRow]: [
        row('m1', { f_teacher: ['t1'], f_class: ['c1'], f_subject: ['sub1'], f_hours: 2 }),
        row('m2', { f_teacher: ['t1'], f_class: ['c1'], f_subject: ['sub1'] }),   // 시수 빈 칸
    ],
};
const full = (over: Partial<CanonSources> = {}): CanonSources => ({
    staff, school, subjects, rooms,
    rows: (t) => rowsByType[t] ?? [],
    sheetData: () => [{ range: { kind: 'repeat', count: 3 } }, { range: { kind: 'period', start: '2099-03-02', end: '2099-07-20' } }],
    blocks: [{ id: 'k1', name: '월 1교시', weekday: 1, slotIndex: 0, targets: [{ kind: 'track', id: 'c1' }] }],
    ...over,
});

describe('정본 노드 타입 이름 — 각 플러그인 상수와 같다', () => {
    it('같음', () => {
        expect(NODE_TYPES).toEqual({ bellSlot: SLOT_TYPE, dutyEntry: ENTRY_TYPE, demandRow: ROW_TYPE, gridSheet: SHEET_TYPE });
    });
});

describe('readCanon — 읽기만 한다', () => {
    it('가장 나중 학년도의 반 · 닫힌 방 제외 · 수용 수 · 기간(두 날짜가 있는 시간표)', () => {
        const { canon, blockers } = readCanon(full());
        expect(canon.classes.map((c) => c.id)).toEqual(['c1']);
        expect(canon.rooms).toEqual([{ id: 'r1', name: '가상실험실', capacity: 2 }]);
        expect(canon.range).toEqual({ startDate: '2099-03-02', endDate: '2099-07-20' });
        expect(canon.staff.map((s) => s.kind)).toEqual(['subject', 'homeroom']);
        expect(canon.duty[0].person).toEqual(['t1']);
        expect(blockers).toEqual([]);
    });
});

describe('readAndBuild — 정본 → 편성 입력', () => {
    it('수업·방·복무·막힘이 입력에 들어가고, 시수 빈 줄은 note 로만 남는다', () => {
        const r = readAndBuild(full(), mods);
        expect(r.input.demands).toHaveLength(1);
        expect(r.input.resources[0]).toMatchObject({ id: 'r1', capacity: 2 });
        expect(r.input.blackouts).toHaveLength(1);
        expect(r.input.weeklyBlocks).toHaveLength(1);
        expect(r.blockers.filter((b) => b.level === 'stop')).toEqual([]);
        expect(r.blockers.map((b) => b.code)).toContain('bad-demand');
    });
});

describe('편성 막힘 — 비면 선생님 말로', () => {
    const codes = (s: CanonSources) => readAndBuild(s, mods).blockers.filter((b) => b.level === 'stop').map((b) => b.code);
    const demandOnly = (rs: RowLike[]) => (t: string) => (t === NODE_TYPES.demandRow ? rs : rowsByType[t] ?? []);
    it('교사 없음', () => {
        expect(codes(full({ staff: { lists: () => [], staffIn: () => [] } as unknown as Staff }))).toContain('no-staff');
    });
    it('반 없음', () => {
        expect(codes(full({ school: { school: () => undefined, years: () => [], classesIn: () => [] } as unknown as School }))).toContain('no-class');
    });
    it('과목 없음', () => {
        expect(codes(full({ subjects: { lists: () => [], subjectsIn: () => [] } as unknown as Subjects }))).toContain('no-subject');
    });
    it('일과표 없음', () => {
        expect(codes(full({ rows: (t) => (t === NODE_TYPES.bellSlot ? [] : rowsByType[t] ?? []) }))).toContain('no-bell');
    });
    it('시수 0 · 시수 줄 없음', () => {
        const zero = [row('z', { f_teacher: ['t1'], f_class: ['c1'], f_subject: ['sub1'], f_hours: 0 })];
        expect(codes(full({ rows: demandOnly(zero) }))).toContain('no-demand');
        expect(codes(full({ rows: demandOnly([]) }))).toContain('no-demand');
    });
    it('방 없음은 note(편성은 된다)', () => {
        const none = { lists: () => [], roomsIn: () => [], roomProps: () => ({ active: true }) } as unknown as Rooms;
        const r = readAndBuild(full({ rooms: none }), mods);
        expect(r.blockers.find((b) => b.code === 'no-room')?.level).toBe('note');
        expect(r.blockers.filter((b) => b.level === 'stop')).toEqual([]);
    });
    it('편성 기간이 없으면 note', () => {
        const r = readAndBuild(full({ sheetData: () => [] }), mods);
        expect(r.blockers.find((b) => b.code === 'no-range')?.level).toBe('note');
    });
    it('정본 플러그인이 꺼져 있으면(null) 그 말이 막힘', () => {
        expect(codes(full({ staff: null }))).toContain('staff-off');
        expect(codes(full({ school: null }))).toContain('school-off');
    });
    it('말은 한국어 문장이다(코드 낱말이 아님)', () => {
        const none = { lists: () => [], staffIn: () => [] } as unknown as Staff;
        for (const b of readAndBuild(full({ staff: none }), mods).blockers) expect(b.message).toMatch(/[가-힣]/);
    });
});
