/**
 * F5 끝 판정 — 같은 자료를 v1 파일 경유(migrateDoc)로 넣었을 때와 정본 경유(buildSolverInput)로 넣었을 때 엔진 입력이 같다.
 *   ⛔ 실자료 0 — 이름은 전부 지어낸 것.
 */
import { describe, it, expect } from 'vitest';
import { buildSolverInput } from './build-context';
import type { SolverCanon } from './contracts/solver';
import { migrateDoc } from './types/doc';
import { buildContext } from './engine/context';
import { clockApi } from '../bell/clock';
import { dutyApi } from '../duty/api';
import { HOMEROOM_AGENT_ID } from './types/schema';

const mods = { clock: clockApi, duty: dutyApi };

// 1학년: 4교시 · 점심 4교시 뒤 / 5학년: 5교시 · 점심 4교시 뒤(1~4교시 시각은 같다)
const bell: SolverCanon['bell'] = [
    { kind: 'class', period: 1, start: '09:00', end: '09:40' },
    { kind: 'break', start: '09:40', end: '09:50' },
    { kind: 'class', period: 2, start: '09:50', end: '10:30' },
    { kind: 'class', period: 3, start: '10:40', end: '11:20' },
    { kind: 'class', period: 4, start: '11:30', end: '12:10' },
    { kind: 'lunch', start: '12:10', end: '13:00' },
    { kind: 'class', period: 5, start: '13:00', end: '13:40', grades: ['5'] },
    { kind: 'dismissal', start: '13:50' },
];

const canon: SolverCanon = {
    school: { name: '가상초등학교', term: '2099학년도 1학기' },
    range: { startDate: '2099-03-02', endDate: '2099-07-20' },
    staff: [
        { id: 's-hr1', name: '가나다', kind: 'homeroom', homeroomClassIds: ['c-1-1'] },
        { id: 's-hr5', name: '라마바', kind: 'homeroom', tier: 1, homeroomClassIds: ['c-5-1'] },
        { id: 's-sub', name: '사아자', kind: 'subject', tier: 2 },
        { id: 's-non', name: '차카타', kind: 'nonteaching', tier: 3 },
    ],
    classes: [
        { id: 'c-1-1', name: '1-1', grade: 1 },
        { id: 'c-5-1', name: '5-1', grade: 5 },
    ],
    subjects: [{ id: 'sj-pe', name: '체육' }, { id: 'sj-sci', name: '과학' }, { id: 'sj-mus', name: '음악' }],
    rooms: [{ id: 'r-gym', name: '가상 체육관' }],
    bell,
    duty: [
        { id: 'd1', name: '출장', person: ['s-sub'], start: '2099-04-01', end: '2099-04-02', periods: '2-3, 5' },
        { id: 'd2', name: '연가', person: 's-non', start: { start: '2099-05-06' } as unknown as string, allDay: true },
        { id: 'd3', name: '연수', person: ['s-hr1'], start: '2099-05-07' },
    ],
    demands: [
        { id: 'dm1', teacherId: 's-hr1', classId: 'c-1-1', subjectId: 'sj-pe', hours: 2 },   // 담임의 자기 반 → 센티널
        { id: 'dm2', teacherId: 's-sub', classId: 'c-5-1', subjectId: 'sj-sci', hours: 3 },
        { id: 'dm3', teacherId: 's-hr5', classId: 'c-1-1', subjectId: 'sj-mus', hours: 1 },  // 남의 반 → 담임 겸 전담
        { id: 'dm4', teacherId: 's-sub', classId: 'c-1-1', subjectId: 'sj-sci' },              // 시수 빈 칸 → 거름
    ],
    blocks: [
        { id: 'b1', name: '부장회의', weekday: 3, from: '13:00', to: '13:40', targets: [{ kind: 'agent', id: 's-hr5' }] },
        { id: 'b2', name: '동아리', weekday: 5, slotIndex: 6, targets: [{ kind: 'track', id: 'c-5-1' }], soft: true },
        { id: 'b3', name: '토요 칸', weekday: 6, targets: [] },
    ],
};

/** 같은 학교를 v1 파일(.shiftgrid.json v3) 꼴로 손으로 적은 것. */
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

describe('F5 buildSolverInput — 정본 경유 = v1 파일 경유', () => {
    const { input, issues } = buildSolverInput(canon, mods);
    const viaFile = migrateDoc(JSON.parse(JSON.stringify(v1File)));

    it('엔진 입력이 같다', () => {
        expect(input).toEqual(viaFile);
    });
    it('엔진 문맥(색인·칸·금지 판정)도 같다', () => {
        const a = buildContext(input), b = buildContext(viaFile);
        const data = (c: typeof a) => Object.fromEntries(Object.entries(c).filter(([, v]) => typeof v !== 'function'));
        expect(data(a)).toEqual(data(b));
        const probe = (c: typeof a) => ({
            slots: ['c-1-1', 'c-5-1'].flatMap((t) => [0, 1, 2, 3, 4].map((d) => c.lessonSlots(t, d).map((s) => s.index))),
            blocked: [0, 1, 2, 3, 4].flatMap((d) => [
                c.isBlocked({ kind: 'agent', id: 's-hr5' }, { dayIndex: d, startMin: 780, endMin: 820 }),
                c.isBlocked({ kind: 'track', id: 'c-5-1' }, { dayIndex: d, startMin: 780, endMin: 820 }, 'c-5-1'),
            ]),
            tier: ['s-hr5', 's-sub', 's-non'].map((x) => c.tierWeight(x)),
        });
        expect(probe(a)).toEqual(probe(b));
        expect(probe(a).blocked[4]).toBe(true); // 수(2)요일 부장회의가 엔진에 닿았다
    });
    it('담임 자기 반 수업은 센티널 · 순수 담임은 사람 목록에 없다', () => {
        expect(input.demands.find((d) => d.id === 'dm1')?.agentId).toBe(HOMEROOM_AGENT_ID);
        expect(input.agents.some((a) => a.id === 's-hr1')).toBe(false);
    });
    it('걸러 낸 것을 이유와 함께 돌려준다', () => {
        expect(issues.map((i) => `${i.source}:${i.id}`).sort()).toEqual(['block:b3', 'demand:dm4', 'duty:d3']);
    });
    it('정본을 고치지 않는다(읽기만)', () => {
        const before = JSON.stringify(canon);
        buildSolverInput(canon, mods);
        expect(JSON.stringify(canon)).toBe(before);
    });
});
