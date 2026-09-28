/**
 * v3 시험 — 담임 모델 · 협력수업 · 파일 변환 v2→v3 · 사전 점검 · 칸별 사유 · 점심 기준.
 */
import { describe, it, expect } from 'vitest';
import type { Doc } from '../types/doc';
import { migrateDoc } from '../types/doc';
import type { Violation } from '../types/schema';
import { HOMEROOM_AGENT_ID } from '../types/schema';
import { evaluateAll, candidateCells, checkCapacity, defaultRules, makeSpec } from './core';
import { put } from './__fixtures__/small';

const count = (vs: Violation[], id: string) => vs.filter((v) => v.templateId === id).length;

function baseDoc(over: Partial<Doc>): Doc {
    return {
        meta: { name: 't', term: '', schemaVersion: 3 },
        agents: [], activities: [{ kind: 'activity', id: 'eng', name: '영어' }], resources: [], specs: [],
        tracks: [], timetables: [], demands: [], assignments: [],
        blackouts: [], weeklyBlocks: [], rules: defaultRules(), boards: [],
        ...over,
    };
}

// 1교시 09:00-09:40 · 2교시 09:40-10:20 · 점심 10:20-11:00 · 3교시 11:00-11:40 · 4교시 11:40-12:20
const SP = () => makeSpec({ id: 'sp', name: 'sp', periods: 4, lunchAfter: 2, dayStart: '09:00', lessonMin: 40, breakMin: 0, lunchMin: 40 });

// ──────────────────────────────── 담임 모델
describe('담임(HOMEROOM) 배치', () => {
    const doc = () => baseDoc({
        specs: [SP()],
        tracks: [
            { kind: 'track', id: 't1', name: '3-1', specId: 'sp', grade: 3 },
            { kind: 'track', id: 't2', name: '3-2', specId: 'sp', grade: 3 },
        ],
        assignments: [
            // 다른 반 담임이 같은 시각에(3-1·3-2 1교시) 나란히 — 각 반 한 줄이라 반 축 규칙도 안 걸린다
            put('h1', 't1', 0, 0, { agentId: HOMEROOM_AGENT_ID, activityId: 'eng' }),
            put('h2', 't2', 0, 0, { agentId: HOMEROOM_AGENT_ID, activityId: 'eng' }),
        ],
    });

    it('다른 반 담임끼리 같은 시각이어도 교사 겹침이 아니다', () => {
        expect(count(evaluateAll(doc()), 'no-overlap-agent')).toBe(0);
    });
    it('담임은 교사 점심·교사 축 권장 규칙에 걸리지 않는다', () => {
        const vs = evaluateAll(doc());
        expect(count(vs, 'agent-lunch-free')).toBe(0);
        // 담임(HOMEROOM)은 doc.agents 에 없으므로 교사 축 소프트 대상이 아니다
        expect(vs.filter((v) => v.kind === 'soft').length).toBe(0);
    });
});

// ──────────────────────────────── 담임 겸 전담 자리 비움
describe('homeroom-plus-free (담임 겸 전담 자리 비움)', () => {
    const build = (covered: boolean): Doc => baseDoc({
        specs: [SP()],
        tracks: [
            { kind: 'track', id: 't1', name: '3-1', specId: 'sp', grade: 3 },
            { kind: 'track', id: 't2', name: '3-2', specId: 'sp', grade: 3 },
        ],
        agents: [
            { kind: 'agent', id: 'T', name: '온유', role: '담임 겸 전담', homeroomTrackIds: ['t1'] },
            { kind: 'agent', id: 'U', name: '가람', role: '전담' },
        ],
        assignments: [
            put('aT', 't2', 0, 0, { agentId: 'T', activityId: 'eng' }), // T 가 담임반(t1) 아닌 t2 수업
            ...(covered ? [put('bU', 't1', 0, 0, { agentId: 'U', activityId: 'eng' })] : []), // t1 을 다른 교사가 맡음
        ],
    });

    it('담임반이 그 시각 담임 수업이면 위반 1건', () => {
        expect(count(evaluateAll(build(false)), 'homeroom-plus-free')).toBe(1);
    });
    it('담임반을 같은 시각 다른 교사가 맡으면 0건', () => {
        expect(count(evaluateAll(build(true)), 'homeroom-plus-free')).toBe(0);
    });
});

// ──────────────────────────────── 협력수업
describe('협력수업 coAgent', () => {
    it('둘째 교사(coAgent)의 겹침이 그 교사로 잡힌다', () => {
        const doc = baseDoc({
            specs: [SP()],
            tracks: [
                { kind: 'track', id: 't1', name: '3-1', specId: 'sp', grade: 3 },
                { kind: 'track', id: 't2', name: '3-2', specId: 'sp', grade: 3 },
            ],
            agents: [
                { kind: 'agent', id: 'P', name: '이든', role: '전담' },
                { kind: 'agent', id: 'Q', name: '노을', role: '비교과' },
            ],
            assignments: [
                put('x', 't1', 0, 0, { agentId: 'P', coAgentId: 'Q', activityId: 'eng' }), // P+Q 협력
                put('y', 't2', 0, 0, { agentId: 'Q', activityId: 'eng' }),                 // Q 가 같은 시각 다른 반
            ],
        });
        // Q 가 x(협력)·y 두 곳에 같은 시각 → 겹침 1
        expect(count(evaluateAll(doc), 'no-overlap-agent')).toBe(1);
    });

    it('협력수업 한 칸(같은 반 같은 칸) 자체는 겹침이 아니다', () => {
        const doc = baseDoc({
            specs: [SP()],
            tracks: [{ kind: 'track', id: 't1', name: '3-1', specId: 'sp', grade: 3 }],
            agents: [
                { kind: 'agent', id: 'P', name: '이든', role: '전담' },
                { kind: 'agent', id: 'Q', name: '노을', role: '비교과' },
            ],
            assignments: [put('x', 't1', 0, 0, { agentId: 'P', coAgentId: 'Q', activityId: 'eng' })],
        });
        expect(count(evaluateAll(doc), 'no-overlap-agent')).toBe(0);
    });
});

// ──────────────────────────────── 점심 기준 (lunchSpecId)
describe('lunchSpecId (교사별 점심 기준)', () => {
    // spL 의 점심은 10:20-11:00. spB 의 3교시(10:20-11:00)가 그 시각과 겹친다.
    const spL = makeSpec({ id: 'spL', name: 'L', periods: 4, lunchAfter: 2, dayStart: '09:00', lessonMin: 40, breakMin: 0, lunchMin: 40 });
    const spB = makeSpec({ id: 'spB', name: 'B', periods: 6, lunchAfter: 5, dayStart: '09:00', lessonMin: 40, breakMin: 0, lunchMin: 40 });
    const build = (slotIndex: number): Doc => baseDoc({
        specs: [spL, spB],
        tracks: [{ kind: 'track', id: 'tG', name: '5-1', specId: 'spB', grade: 5 }],
        agents: [{ kind: 'agent', id: 'g', name: '슬기', role: '전담', lunchSpecId: 'spL' }],
        assignments: [put('g1', 'tG', 0, slotIndex, { agentId: 'g', activityId: 'eng' })],
    });

    it('점심 기준 틀의 점심 시각에 수업이 있으면 위반', () => {
        // spB slot2 = 10:20-11:00 = spL 점심 → 위반 1
        expect(count(evaluateAll(build(2)), 'agent-lunch-free')).toBe(1);
    });
    it('점심 기준 틀의 점심 시각이 비어 있으면 0건', () => {
        // spB slot0 = 09:00-09:40 → 점심 시각 빔 → 0
        expect(count(evaluateAll(build(0)), 'agent-lunch-free')).toBe(0);
    });
});

// ──────────────────────────────── 파일 변환 v2 → v3
describe('migrateDoc v2 → v3', () => {
    const spec = makeSpec({ id: 'sp', name: 'sp', periods: 4, lunchAfter: 2, dayStart: '09:00', lessonMin: 40, breakMin: 0, lunchMin: 40 });
    const rawV2 = () => ({
        meta: { name: '옛학교', term: '', schemaVersion: 2 },
        agents: [
            { kind: 'agent', id: 'hr1', name: '하늘', role: '담임', homeroomTrackId: 't1' }, // 수요 없음 → 지움
            { kind: 'agent', id: 'hr2', name: '바다', role: '담임', homeroomTrackId: 't2' }, // 수요 있음 → 담임 겸 전담
            { kind: 'agent', id: 'e1', name: '이든', role: '전담', homeroomTrackId: 't1' },  // homeroomTrackId → homeroomTrackIds
        ],
        activities: [{ kind: 'activity', id: 'a', name: '영어' }],
        resources: [],
        specs: [spec],
        tracks: [
            { kind: 'track', id: 't1', name: '1-1', specId: 'sp', grade: 1 },
            { kind: 'track', id: 't2', name: '1-2', specId: 'sp', grade: 1 },
        ],
        timetables: [],
        demands: [
            { id: 'd1', agentId: 'hr2', trackId: 't2', activityId: 'a', count: 1 },
        ],
        assignments: [
            { kind: 'work', id: 'as1', timetableId: '', trackId: 't1', dayIndex: 0, slotIndex: 0, agentId: 'hr1' },
        ],
        weeklyBlocks: [
            { id: 'wbA', name: '회의', dayIndex: 0, slotIndex: 1, targets: [{ kind: 'agent', id: 'e1' }] }, // → from/to
            { id: 'wbT', name: '반블록', dayIndex: 0, slotIndex: 0, targets: [{ kind: 'track', id: 't1' }] }, // 그대로
            { id: 'wbG', name: '동아리', dayIndex: 2, slotIndex: 3, targets: [] },                            // 그대로
        ],
        rules: [],
        boards: [],
    });

    it('담임 사람을 반으로 옮기고 · 수요 있는 담임은 겸 전담으로 · 참조를 HOMEROOM 으로 바꾼다', () => {
        const d = migrateDoc(rawV2());
        expect(d.meta.schemaVersion).toBe(3);
        // 사람에 role '담임' 이 남지 않는다
        expect(d.agents.some((a) => a.role === '담임')).toBe(false);
        // hr1 은 사라지고 이름은 t1 의 담임 이름으로
        expect(d.agents.find((a) => a.id === 'hr1')).toBeUndefined();
        expect(d.tracks.find((t) => t.id === 't1')!.homeroomName).toBe('하늘');
        // hr2 는 담임 겸 전담
        const hr2 = d.agents.find((a) => a.id === 'hr2')!;
        expect(hr2.role).toBe('담임 겸 전담');
        expect(hr2.homeroomTrackIds).toEqual(['t2']);
        expect(hr2.homeroomTrackId).toBeUndefined();
        // e1 은 homeroomTrackId → homeroomTrackIds
        const e1 = d.agents.find((a) => a.id === 'e1')!;
        expect(e1.homeroomTrackIds).toEqual(['t1']);
        expect(e1.homeroomTrackId).toBeUndefined();
        // hr1 을 가리키던 배치는 HOMEROOM 으로
        expect(d.assignments.find((a) => a.id === 'as1')!.agentId).toBe(HOMEROOM_AGENT_ID);
    });

    it('교사 대상 금지칸 slotIndex → 시각, 반·전체 대상은 그대로', () => {
        const d = migrateDoc(rawV2());
        const wbA = d.weeklyBlocks.find((w) => w.id === 'wbA')!;
        expect(wbA.slotIndex).toBeUndefined();
        expect(wbA.from).toBe('09:40'); // spec slot1 = 2교시 09:40-10:20
        expect(wbA.to).toBe('10:20');
        const wbT = d.weeklyBlocks.find((w) => w.id === 'wbT')!;
        expect(wbT.slotIndex).toBe(0); // 반 대상 — 그대로
        const wbG = d.weeklyBlocks.find((w) => w.id === 'wbG')!;
        expect(wbG.slotIndex).toBe(3); // 전체 대상 — 그대로
    });

    it('멱등 — 이미 v3면 한 번 더 돌려도 그대로다', () => {
        const once = migrateDoc(rawV2());
        const twice = migrateDoc(once);
        expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
    });
});

// ──────────────────────────────── 사전 점검 checkCapacity
describe('checkCapacity', () => {
    // 6교시 규격 → 주간 수업 칸 30
    const spec = makeSpec({ id: 'sp', name: 'sp', periods: 6, lunchAfter: 4, dayStart: '09:00', lessonMin: 40, breakMin: 0, lunchMin: 40 });
    const build = (perClass: number): Doc => {
        const tracks = Array.from({ length: 12 }, (_, i) => ({ kind: 'track' as const, id: `t${i}`, name: `${i}`, specId: 'sp', grade: 3 }));
        const demands = tracks.map((t, i) => ({ id: `d${i}`, agentId: 'over', trackId: t.id, activityId: 'a', count: perClass }));
        return baseDoc({
            specs: [spec], tracks, demands,
            agents: [{ kind: 'agent', id: 'over', name: '하늘', role: '전담' }],
            activities: [{ kind: 'activity', id: 'a', name: '과목' }],
        });
    };

    it('전담 1명 × 12반 × 3시간 = 36 > 칸 30 → 잡는다', () => {
        const issues = checkCapacity(build(3));
        const ag = issues.find((x) => x.kind === 'agent' && x.id === 'over');
        expect(ag).toBeTruthy();
        expect(ag!.need).toBe(36);
        expect(ag!.capacity).toBe(30);
    });
    it('12반 × 2시간 = 24 ≤ 30 → 교사 문제 없음', () => {
        const issues = checkCapacity(build(2));
        expect(issues.some((x) => x.kind === 'agent' && x.id === 'over')).toBe(false);
    });
});

// ──────────────────────────────── 칸별 사유 reasons
describe('candidateCells reasons', () => {
    it('필수 규칙이 깨지는 칸에 규칙 라벨을 준다', () => {
        const doc = baseDoc({
            specs: [SP()],
            tracks: [
                { kind: 'track', id: 't1', name: '3-1', specId: 'sp', grade: 3 },
                { kind: 'track', id: 't2', name: '3-2', specId: 'sp', grade: 3 },
            ],
            agents: [{ kind: 'agent', id: 'a1', name: '이든', role: '전담' }],
            assignments: [
                put('m1', 't1', 0, 0, { agentId: 'a1', activityId: 'eng' }),
                put('z1', 't2', 0, 1, { agentId: 'a1', activityId: 'eng' }), // a1 이 t2 2교시
            ],
        });
        const cv = candidateCells(doc, 'm1');
        // m1 을 t1 2교시(0:1)로 옮기면 a1 이 t2 2교시와 같은 시각 → 교사 겹침
        expect(cv.cells['0:1']).toBe('hard');
        expect(cv.reasons['0:1']).toContain('교사 겹침');
        // 사유는 hard·soft·occupied·blocked 칸에만 붙는다 — ok·self 칸엔 없다
        for (const key of Object.keys(cv.reasons)) {
            expect(['hard', 'soft', 'occupied', 'blocked']).toContain(cv.cells[key]);
        }
    });
});
