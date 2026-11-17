/**
 * 편성안 점검 탭 증명 — 진짜 엔진(solverApi)으로 ① 일부러 겹친 안 → 위반이 선생님 말로 보임 ② 깨끗한 안 → 「문제 없음」 ③ 시수 모자람·넘침.
 *   ⛔ 실명 금지 — 지어낸 이름만.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import type { PluginHost } from '../../pane-ui-system/plugin';
import { solverApi } from '../timetable-solver/api';
import { buildSolverInput } from '../timetable-solver/build-context';
import type { SolverCanon } from '../timetable-solver/contracts/solver';
import type { Plan, Placement, Plans } from '../timetable-plans/contracts/plans';
import { clockApi } from '../bell/clock';
import { dutyApi } from '../duty/api';
import { planRows } from './plan-text';
import { PlanCheck } from './PlanCheck';

// 지어낸 학교 — 1학년 두 반 · 4교시 · 전담 둘
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

// 깨끗한 안 — 시수 넷이 정확히 차고 겹침이 없다
const CLEAN = [P('c1', 1, 1, 's-kor', 't-a'), P('c1', 3, 2, 's-kor', 't-a'), P('c2', 2, 3, 's-kor', 't-a'), P('c1', 4, 1, 's-mat', 't-b')];
// 일부러 겹친 안 — 같은 선생님이 월요일 1교시에 두 반을 동시에 맡는다(그리고 가반 국어는 한 시간 모자람)
const CLASH = [P('c1', 1, 1, 's-kor', 't-a'), P('c2', 1, 1, 's-kor', 't-a'), P('c1', 4, 1, 's-mat', 't-b')];

const plan = (name: string, placements: Placement[]): Plan => ({
    name, madeAt: '2099-01-01T00:00:00.000Z', placements, summary: { score: null, hardViolations: 0, softViolations: 0 },
});

function fakeHost(plans: Record<string, Plan>): PluginHost {
    const items = Object.entries(plans).map(([id, p]) => ({ id, name: p.name, summary: p.summary, chosen: false }));
    const fakePlans: Plans = {
        version: 1, cmd: { open: 'plans-open' }, savePlan: () => '', listPlans: () => items, getPlan: (id) => plans[id] ?? null, subscribe: () => () => {},
    };
    const modules: Record<string, unknown> = { plans: fakePlans, solver: { ...solverApi, readInput: () => input } };
    return { modules: { use: (n: string) => modules[n] ?? null } } as unknown as PluginHost;
}

describe('편성안 점검 — 엔진 evaluate', () => {
    it('깨끗한 안은 위반 0 · 시수 모자람·넘침 0', () => {
        const ev = solverApi.evaluate(input, CLEAN);
        expect(ev.hard).toBe(0);
        expect(ev.demands.every((d) => d.remaining === 0)).toBe(true);
        expect(planRows(input, ev).filter((r) => r.kind !== 'soft')).toEqual([]);
    });
    it('겹친 안은 필수 위반이 반·칸과 함께 말로 나오고 시수 모자람도 나온다', () => {
        const ev = solverApi.evaluate(input, CLASH);
        expect(ev.hard).toBeGreaterThan(0);
        const rows = planRows(input, ev);
        const hard = rows.filter((r) => r.kind === 'hard');
        expect(hard.length).toBeGreaterThan(0);
        expect(hard.some((r) => r.where.some((w) => /월 1교시/.test(w)))).toBe(true);
        expect(hard[0].text).toMatch(/[가-힣]/);
        expect(rows.some((r) => r.kind === 'demand' && r.text.includes('가반 국어') && r.text.includes('모자람'))).toBe(true);
        expect(ev.score).toBeLessThan(solverApi.evaluate(input, CLEAN).score);
    });
    it('시수가 넘치면 「넘침」', () => {
        const ev = solverApi.evaluate(input, [...CLEAN, P('c2', 5, 1, 's-kor', 't-a')]);
        expect(planRows(input, ev).some((r) => r.kind === 'demand' && r.text.includes('1시간 넘침'))).toBe(true);
    });
});

describe('편성안 점검 — 탭 화면', () => {
    it('겹친 안을 고르면 위반이 보인다', () => {
        const out = renderToStaticMarkup(h(PlanCheck, { host: fakeHost({ p1: plan('겹친 안', CLASH) }) }));
        expect(out).toContain('겹친 안');
        expect(out).toContain('❌');
        expect(out).toContain('모자람');
        expect(out).not.toContain('문제 없음');
    });
    it('깨끗한 안은 「문제 없음」', () => {
        const out = renderToStaticMarkup(h(PlanCheck, { host: fakeHost({ p1: plan('깨끗한 안', CLEAN) }) }));
        expect(out).toContain('문제 없음');
        expect(out).not.toContain('❌');
    });
    it('안이 하나도 없으면 안내', () => {
        expect(renderToStaticMarkup(h(PlanCheck, { host: fakeHost({}) }))).toContain('점검할 편성안이 없습니다');
    });
});
