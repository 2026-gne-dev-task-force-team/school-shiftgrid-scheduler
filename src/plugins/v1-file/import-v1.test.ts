/**
 * F10a 끝 판정 — v1 파일 → 불러오기(importV1) → buildSolverInput = v1 파일 그대로(migrateDoc) 엔진 입력.
 *   ⛔ 실자료 0 — 이름은 전부 지어낸 것 · 파일(*.shiftgrid.json) 대신 여기서 만든다.
 */
import { describe, it, expect } from 'vitest';
import { importV1, V1_HOMEROOM_ID } from './import-v1';
import { buildSolverInput } from '../timetable-solver/build-context';
import { migrateDoc } from '../timetable-solver/types/doc';
import { HOMEROOM_AGENT_ID } from '../timetable-solver/types/schema';
import { toWeekday } from '../timetable-solver/day';
import { clockApi } from '../bell/clock';
import { dutyApi } from '../duty/api';
import { parsePeriods } from '../duty/absence';

const mods = { solver: { toWeekday }, clock: clockApi };
const slot = (index: number, label: string, start: string, end: string, kind: 'lesson' | 'lunch' | 'break') =>
    ({ index, label, start, end, assignable: kind === 'lesson', kind });
const common = [
    slot(0, '1교시', '09:00', '09:40', 'lesson'), slot(1, '쉬는 시간', '09:40', '09:50', 'break'),
    slot(2, '2교시', '09:50', '10:30', 'lesson'), slot(3, '3교시', '10:40', '11:20', 'lesson'),
    slot(4, '4교시', '11:30', '12:10', 'lesson'), slot(5, '점심', '12:10', '13:00', 'lunch'),
];
const v1File = {
    meta: { name: '가상초등학교', term: '2099학년도 1학기', schemaVersion: 3 },
    agents: [
        { kind: 'agent', id: 's-hr5', name: '라마바', tier: 1, role: '담임 겸 전담', homeroomTrackIds: ['c-5-1'] },
        { kind: 'agent', id: 's-sub', name: '사아자', tier: 2, role: '전담' },
        { kind: 'agent', id: 's-non', name: '차카타', tier: 3, role: '비교과' },
    ],
    activities: [{ kind: 'activity', id: 'sj-pe', name: '체육' }, { kind: 'activity', id: 'sj-sci', name: '과학' }, { kind: 'activity', id: 'sj-mus', name: '음악' }],
    resources: [{ kind: 'resource', id: 'r-gym', name: '가상 체육관' }],
    specs: [
        { id: 'spec-g1', name: '1학년 시간 틀', cycleDays: 7, activeDays: [0, 1, 2, 3, 4], dayStart: '09:00', dayEnd: '13:00', slots: common, grades: [1] },
        { id: 'spec-g5', name: '5학년 시간 틀', cycleDays: 7, activeDays: [0, 1, 2, 3, 4], dayStart: '09:00', dayEnd: '13:40', slots: [...common, slot(6, '5교시', '13:00', '13:40', 'lesson')], grades: [5] },
    ],
    tracks: [
        { kind: 'track', id: 'c-1-1', name: '1-1', grade: 1, specId: 'spec-g1', homeroomName: '가나다' },
        { kind: 'track', id: 'c-5-1', name: '5-1', grade: 5, specId: 'spec-g5' },
    ],
    timetables: [
        { id: 'tt-spec-g1', name: '1학년 시간 틀', specId: 'spec-g1', startDate: '2099-03-02', endDate: '2099-07-20', priority: 0 },
        { id: 'tt-spec-g5', name: '5학년 시간 틀', specId: 'spec-g5', startDate: '2099-03-02', endDate: '2099-07-20', priority: 0 },
    ],
    demands: [
        { id: 'dm1', agentId: HOMEROOM_AGENT_ID, trackId: 'c-1-1', activityId: 'sj-pe', count: 2 },
        { id: 'dm2', agentId: 's-sub', trackId: 'c-5-1', activityId: 'sj-sci', count: 3 },
        { id: 'dm3', agentId: 's-hr5', trackId: 'c-1-1', activityId: 'sj-mus', count: 1 },
    ],
    assignments: [],
    blackouts: [
        { id: 'd1#1', name: '출장', startDate: '2099-04-01', endDate: '2099-04-02', from: '09:50', to: '11:20', targets: [{ kind: 'agent', id: 's-sub' }], mode: 'only' },
        { id: 'd1#2', name: '출장', startDate: '2099-04-01', endDate: '2099-04-02', from: '13:00', to: '13:40', targets: [{ kind: 'agent', id: 's-sub' }], mode: 'only' },
        { id: 'd2', name: '연가', startDate: '2099-05-06', endDate: '2099-05-06', targets: [{ kind: 'agent', id: 's-non' }], mode: 'only' },
    ],
    weeklyBlocks: [
        { id: 'b1', name: '부장회의', dayIndex: 2, from: '13:00', to: '13:40', targets: [{ kind: 'agent', id: 's-hr5' }] },
        { id: 'b2', name: '동아리', dayIndex: 4, slotIndex: 6, targets: [{ kind: 'track', id: 'c-5-1' }], soft: true },
    ],
    rules: [],
    boards: [],
};
const fresh = () => migrateDoc(JSON.parse(JSON.stringify(v1File)));

describe('F10a importV1 — v1 파일 쪼개 넣기', () => {
    const doc = fresh();
    const { writes, newHomerooms, issues } = importV1(doc, mods);

    it('센티널 글자가 엔진 것과 같다', () => {
        expect(V1_HOMEROOM_ID).toBe(HOMEROOM_AGENT_ID);
    });
    it('불러온 정본 → buildSolverInput = v1 파일 그대로 엔진 입력', () => {
        const { input, issues: buildIssues } = buildSolverInput(writes, { clock: clockApi, duty: dutyApi });
        expect(buildIssues).toEqual([]);
        expect(input).toEqual(fresh());
    });
    it('틈 ① 담임 이름 → 새 담임 행 · 센티널 수요 → 그 담임', () => {
        expect(newHomerooms).toEqual([{ staffId: 'v1-hr-c-1-1', name: '가나다', classId: 'c-1-1' }]);
        expect(writes.staff.find((s) => s.id === 'v1-hr-c-1-1')).toMatchObject({ kind: 'homeroom', homeroomClassIds: ['c-1-1'] });
        expect(writes.demands.find((d) => d.id === 'dm1')?.teacherId).toBe('v1-hr-c-1-1');
        expect(writes.staff.find((s) => s.id === 's-hr5')).toMatchObject({ kind: 'homeroom', tier: 1, homeroomClassIds: ['c-5-1'] });
    });
    it('틈 ② 요일 0=월 → 1=월', () => {
        expect(writes.blocks.map((b) => [b.id, b.weekday])).toEqual([['b1', 3], ['b2', 5]]);
    });
    it('틈 ③ 시간 틀 → bell 그대로 · 쪼갠 복무는 한 줄 교시 글자로', () => {
        expect(writes.bell.filter((r) => r.grades)).toEqual([{ kind: 'class', period: 5, start: '13:00', end: '13:40', grades: ['5'] }]);
        const d1 = writes.duty.find((d) => d.id === 'd1');
        expect(d1?.periods).toBe('2-3, 5');
        expect(parsePeriods(d1?.periods ?? '')).toEqual([2, 3, 5]);
        expect(writes.duty.find((d) => d.id === 'd2')?.allDay).toBe(true);
        expect(writes.range).toEqual({ startDate: '2099-03-02', endDate: '2099-07-20' });
    });
    it('잃는 것이 없으면 이슈 0 · 파일을 고치지 않는다', () => {
        expect(issues).toEqual([]);
        expect(doc).toEqual(fresh());
    });
});

describe('F10a importV1 — 모서리', () => {
    const base = () => fresh();

    it('동명이인 담임 둘 → 반마다 새 행(이름으로 합치지 않음)', () => {
        const doc = base();
        doc.tracks.push({ kind: 'track', id: 'c-1-2', name: '1-2', grade: 1, specId: 'spec-g1', homeroomName: '가나다' });
        const r = importV1(doc, mods);
        expect(r.newHomerooms.map((h) => h.staffId)).toEqual(['v1-hr-c-1-1', 'v1-hr-c-1-2']);
    });
    it('담임 없는 반의 담임 수업 → 거르고 이유', () => {
        const doc = base();
        doc.tracks.push({ kind: 'track', id: 'c-5-2', name: '5-2', grade: 5, specId: 'spec-g5' });
        doc.demands.push({ id: 'dm9', agentId: HOMEROOM_AGENT_ID, trackId: 'c-5-2', activityId: 'sj-pe', count: 1 });
        const r = importV1(doc, mods);
        expect(r.writes.demands.some((d) => d.id === 'dm9')).toBe(false);
        expect(r.issues.map((i) => `${i.source}:${i.id}`)).toContain('demands:dm9');
    });
    it('칸이 없는 것(전부 막기 차단·협력 교사·배치)은 버리고 이유', () => {
        const doc = base();
        doc.blackouts.push({ id: 'h1', name: '방학', startDate: '2099-07-21', endDate: '2099-08-20', targets: [], mode: 'all-except' });
        doc.demands[1].coAgentId = 's-non';
        doc.assignments.push({ id: 'a1' } as never);
        const r = importV1(doc, mods);
        expect(r.issues.map((i) => `${i.source}:${i.id}`).sort()).toEqual(['assignments:*', 'blackouts:h1', 'demands:dm2']);
        expect(r.writes.duty.some((d) => d.id === 'h1')).toBe(false);
    });
});
