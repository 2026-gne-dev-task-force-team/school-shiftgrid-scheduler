/**
 * 속성 칸 「규칙 점검」 증명 — 편성안이 바뀌면(깨끗한 안 → 겹친 안) 칸의 위반 수가 바뀐다.
 *   진짜 엔진(solverApi)으로 evaluate · ⛔ 실명(지어낸 이름만).
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import type { PluginHost, PropertiesTarget } from '../../pane-ui-system/plugin';
import { solverApi } from '../timetable-solver/api';
import { buildSolverInput } from '../timetable-solver/build-context';
import type { SolverCanon } from '../timetable-solver/contracts/solver';
import { clockApi } from '../bell/clock';
import { dutyApi } from '../duty/api';
import type { Plan, Placement, Plans } from './contracts/plans';
import { PLAN_TYPE } from './nodes';
import { PlanCheckProps } from './views/PlanCheckProps';

const canon: SolverCanon = {
    school: { name: '가상초등학교' },
    range: { startDate: '2099-03-02', endDate: '2099-07-20' },
    staff: [{ id: 't-a', name: '다라', kind: 'subject', tier: 2 }, { id: 't-b', name: '마바', kind: 'subject', tier: 2 }],
    classes: [{ id: 'c1', name: '가반', grade: 1 }, { id: 'c2', name: '나반', grade: 1 }],
    subjects: [{ id: 's-kor', name: '국어' }, { id: 's-mat', name: '수학' }],
    rooms: [],
    bell: [
        { kind: 'class', period: 1, start: '09:00', end: '09:40' },
        { kind: 'class', period: 2, start: '09:50', end: '10:30' },
        { kind: 'class', period: 3, start: '10:40', end: '11:20' },
        { kind: 'class', period: 4, start: '11:30', end: '12:10' },
    ],
    duty: [],
    demands: [
        { id: 'd1', teacherId: 't-a', classId: 'c1', subjectId: 's-kor', hours: 2 },
        { id: 'd2', teacherId: 't-a', classId: 'c2', subjectId: 's-kor', hours: 1 },
        { id: 'd3', teacherId: 't-b', classId: 'c1', subjectId: 's-mat', hours: 1 },
    ],
    blocks: [],
};
const input = buildSolverInput(canon, { clock: clockApi, duty: dutyApi }).input;

const P = (classId: string, day: Placement['day'], period: number, subjectId: string, teacherId: string): Placement =>
    ({ classId, day, period, subjectId, teacherId });
const CLEAN = [P('c1', 1, 1, 's-kor', 't-a'), P('c1', 3, 2, 's-kor', 't-a'), P('c2', 2, 3, 's-kor', 't-a'), P('c1', 4, 1, 's-mat', 't-b')];
const CLASH = [P('c1', 1, 1, 's-kor', 't-a'), P('c2', 1, 1, 's-kor', 't-a'), P('c1', 4, 1, 's-mat', 't-b')];

const plan = (placements: Placement[]): Plan => ({
    name: '안', madeAt: '2099-01-01T00:00:00.000Z', placements, summary: { score: null, hardViolations: 0, softViolations: 0 },
});

function hostWith(p: Plan, solver: unknown = { ...solverApi, readInput: () => input }): PluginHost {
    const fakePlans: Plans = {
        version: 1, cmd: { open: 'plans-open' }, savePlan: () => '', listPlans: () => [{ id: 'p1', name: p.name, summary: p.summary, chosen: false }],
        getPlan: (id) => (id === 'p1' ? p : null), subscribe: () => () => {}, planRows: () => [],
    };
    const modules: Record<string, unknown> = { plans: fakePlans, solver };
    return { modules: { use: (n: string) => modules[n] ?? null } } as unknown as PluginHost;
}
const TARGET: PropertiesTarget = { type: PLAN_TYPE, id: 'p1' };

describe('속성 칸 규칙 점검', () => {
    it('깨끗한 안은 필수·시수 위반이 0으로 보인다', () => {
        const out = renderToStaticMarkup(h(PlanCheckProps, { host: hostWith(plan(CLEAN)), target: TARGET }));
        expect(out).toMatch(/필수 0/);
        expect(out).not.toContain('모자람');
    });
    it('겹친 안으로 바뀌면 필수 위반 수가 올라가고 위반이 말로 보인다', () => {
        const out = renderToStaticMarkup(h(PlanCheckProps, { host: hostWith(plan(CLASH)), target: TARGET }));
        expect(out).toMatch(/필수 [1-9]/);
        expect(out).toContain('모자람');
    });
    it('위반이 하나도 없으면 「위반 없음」 빈 화면', () => {
        const noViol = { ...solverApi, readInput: () => input, evaluate: () => ({ violations: [], hard: 0, soft: 0, score: 100, diagnosis: {}, demands: [] }) };
        const out = renderToStaticMarkup(h(PlanCheckProps, { host: hostWith(plan(CLEAN), noViol), target: TARGET }));
        expect(out).toContain('위반 없음');
    });
});
