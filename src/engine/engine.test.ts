import { describe, it, expect } from 'vitest';
import type { Doc } from '../types/doc';
import type { Violation } from '../types/schema';
import {
    buildContext, evaluateAll, diagnose, previewMove, applyMove, candidateCells,
    solve, autoAdjust, makeSpec, defaultRules, demandStatus,
} from './core';
import { makeSmallDoc, put, IDS, SLOT } from './__fixtures__/small';
import { sampleDoc } from '../io/sample';

const count = (viols: Violation[], templateId: string) =>
    viols.filter((v) => v.templateId === templateId).length;

// ──────────────────────────────── makeSpec / 벽시계
describe('makeSpec · 벽시계', () => {
    it('점심 위치로 슬롯 index 가 연속으로 생긴다', () => {
        const s = makeSpec({ id: 's', name: 's', periods: 6, lunchAfter: 4, dayStart: '09:00', lessonMin: 40, breakMin: 0, lunchMin: 40 });
        expect(s.slots.map((x) => x.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
        expect(s.slots[4].kind).toBe('lunch');
        expect(s.slots[3].start).toBe('11:00');
        expect(s.slots[3].end).toBe('11:40');
    });

    it('3학년 4교시 시각 == 5학년 5교시 시각, 3학년 5교시 != 5학년 5교시', () => {
        const ctx = buildContext(makeSmallDoc());
        const c34 = ctx.clockOf(put('a', IDS.t31, 0, SLOT.g3_p4));
        const c55 = ctx.clockOf(put('b', IDS.t51, 0, SLOT.g5_p5));
        const c35 = ctx.clockOf(put('c', IDS.t31, 0, SLOT.g3_p5));
        expect(c34).toEqual(c55);
        expect(c35).not.toEqual(c55);
    });
});

// ──────────────────────────────── 교사 시각 겹침
describe('no-overlap-agent (벽시계)', () => {
    it('3학년 4교시 + 5학년 5교시 같은 교사 → 1건', () => {
        const doc = { ...makeSmallDoc(), demands: [], assignments: [
            put('x1', IDS.t31, 0, SLOT.g3_p4, { agentId: IDS.a1 }),
            put('x2', IDS.t51, 0, SLOT.g5_p5, { agentId: IDS.a1 }),
        ] };
        expect(count(evaluateAll(doc), 'no-overlap-agent')).toBe(1);
    });

    it('3학년 5교시 + 5학년 5교시 같은 교사 → 0건', () => {
        const doc = { ...makeSmallDoc(), demands: [], assignments: [
            put('x1', IDS.t31, 0, SLOT.g3_p5, { agentId: IDS.a1 }),
            put('x2', IDS.t51, 0, SLOT.g5_p5, { agentId: IDS.a1 }),
        ] };
        expect(count(evaluateAll(doc), 'no-overlap-agent')).toBe(0);
    });

    it('같은 반 같은 칸(협력수업)은 예외', () => {
        const doc = { ...makeSmallDoc(), demands: [], assignments: [
            put('x1', IDS.t31, 0, 0, { agentId: IDS.a1 }),
            put('x2', IDS.t31, 0, 0, { agentId: IDS.a1 }),
        ] };
        expect(count(evaluateAll(doc), 'no-overlap-agent')).toBe(0);
    });
});

// ──────────────────────────────── 특별실 합산 cap
describe('no-overlap-resource (과목별 합산)', () => {
    const overlapping = () => [
        put('r1a', IDS.t31, 0, SLOT.g3_p4, { agentId: IDS.a1, activityId: IDS.sci, resourceId: IDS.r1 }),
        put('r1b', IDS.t51, 0, SLOT.g5_p5, { agentId: IDS.a2, activityId: IDS.sci, resourceId: IDS.r1 }),
    ];

    it('방 1개(cap1)에 동시 2개 → 1건', () => {
        const doc = { ...makeSmallDoc(), demands: [], assignments: overlapping() };
        expect(count(evaluateAll(doc), 'no-overlap-resource')).toBe(1);
    });

    it('과학실 2개로 늘리면(cap 합 2) → 0건', () => {
        const base = makeSmallDoc();
        const doc: Doc = {
            ...base, demands: [],
            resources: [...base.resources, { kind: 'resource', id: 'r2', name: '과학실2', capacity: 1, activityIds: [IDS.sci] }],
            assignments: [
                put('r1a', IDS.t31, 0, SLOT.g3_p4, { agentId: IDS.a1, activityId: IDS.sci, resourceId: IDS.r1 }),
                put('r1b', IDS.t51, 0, SLOT.g5_p5, { agentId: IDS.a2, activityId: IDS.sci, resourceId: 'r2' }),
            ],
        };
        expect(count(evaluateAll(doc), 'no-overlap-resource')).toBe(0);
    });
});

// ──────────────────────────────── 연강 묶음
describe('block-contiguous', () => {
    const mk = (a: number, b: number) => ({ ...makeSmallDoc(), demands: [], assignments: [
        put('b1', IDS.t31, 0, a, { blockId: 'blk', agentId: IDS.a1 }),
        put('b2', IDS.t31, 0, b, { blockId: 'blk', agentId: IDS.a1 }),
    ] });

    it('연속 두 칸 → 0건', () => expect(count(evaluateAll(mk(0, 1)), 'block-contiguous')).toBe(0));
    it('떨어진 칸 → 1건', () => expect(count(evaluateAll(mk(0, 2)), 'block-contiguous')).toBe(1));
    it('점심을 사이에 둔 4·5교시 → 1건', () => expect(count(evaluateAll(mk(SLOT.g3_p4, SLOT.g3_p5)), 'block-contiguous')).toBe(1));
});

// ──────────────────────────────── 순배 (시간순 순번)
describe('cycle-order', () => {
    const base = () => {
        const d = makeSmallDoc();
        return { ...d, demands: [
            { id: 'cd1', agentId: IDS.a1, trackId: IDS.t31, activityId: IDS.sci, count: 2, cycle: true },
            { id: 'cd2', agentId: IDS.a1, trackId: IDS.t32, activityId: IDS.sci, count: 2, cycle: true },
        ] };
    };

    it('차시 번호가 뒤여도 시각 순번이 맞으면 정상 → 0건', () => {
        const doc = { ...base(), assignments: [
            put('s1', IDS.t31, 0, 0, { agentId: IDS.a1, activityId: IDS.sci, demandId: 'cd1', seq: 2 }), // 09:00
            put('s2', IDS.t31, 0, 1, { agentId: IDS.a1, activityId: IDS.sci, demandId: 'cd1', seq: 1 }), // 09:40
            put('s3', IDS.t32, 0, 0, { agentId: IDS.a1, activityId: IDS.sci, demandId: 'cd2', seq: 1 }),
            put('s4', IDS.t32, 0, 1, { agentId: IDS.a1, activityId: IDS.sci, demandId: 'cd2', seq: 2 }),
        ] };
        expect(count(evaluateAll(doc), 'cycle-order')).toBe(0);
    });

    it('한 반이 다른 반보다 먼저 2세션째로 넘어가면 위반 → 1건', () => {
        const doc = { ...base(),
            demands: [
                { id: 'cd1', agentId: IDS.a1, trackId: IDS.t31, activityId: IDS.sci, count: 2, cycle: true },
                { id: 'cd2', agentId: IDS.a1, trackId: IDS.t32, activityId: IDS.sci, count: 1, cycle: true },
            ],
            assignments: [
                put('s1', IDS.t31, 0, 0, { agentId: IDS.a1, activityId: IDS.sci, demandId: 'cd1', seq: 1 }), // 월 ord0
                put('s2', IDS.t31, 0, 1, { agentId: IDS.a1, activityId: IDS.sci, demandId: 'cd1', seq: 2 }), // 월 ord1
                put('s3', IDS.t32, 2, 0, { agentId: IDS.a1, activityId: IDS.sci, demandId: 'cd2', seq: 1 }), // 수 ord0
            ],
        };
        expect(count(evaluateAll(doc), 'cycle-order')).toBe(1);
    });
});

// ──────────────────────────────── 교사 식사 슬롯
describe('agent-lunch-free', () => {
    // 학년별 점심을 어긋나게: A 학년 2교시 뒤 · B 학년 4교시 뒤
    const build = (bothBusy: boolean): Doc => {
        const spA = makeSpec({ id: 'spA', name: 'A', periods: 4, lunchAfter: 2, dayStart: '09:00', lessonMin: 40, breakMin: 0, lunchMin: 40 });
        const spB = makeSpec({ id: 'spB', name: 'B', periods: 5, lunchAfter: 4, dayStart: '09:00', lessonMin: 40, breakMin: 0, lunchMin: 40 });
        const assignments = [
            put('bLesson', 'tB', 0, 2, { agentId: 'ax', activityId: IDS.eng }), // B p3 10:20~11:00 = A 점심 시각
        ];
        if (bothBusy) assignments.push(put('aLesson', 'tA', 0, 4, { agentId: 'ax', activityId: IDS.eng })); // A p4 11:40~12:20 = B 점심 시각
        return {
            meta: { name: 't', term: '', schemaVersion: 2 },
            agents: [{ kind: 'agent', id: 'ax', name: 'x', role: '전담' }],
            activities: [{ kind: 'activity', id: IDS.eng, name: '영어' }],
            resources: [], specs: [spA, spB],
            tracks: [
                { kind: 'track', id: 'tA', name: 'A반', specId: 'spA', grade: 1 },
                { kind: 'track', id: 'tB', name: 'B반', specId: 'spB', grade: 2 },
            ],
            timetables: [], demands: [], assignments, blackouts: [], weeklyBlocks: [],
            rules: defaultRules(), boards: [],
        };
    };

    it('두 학년 점심에 모두 수업 → 위반 1건', () => {
        expect(count(evaluateAll(build(true)), 'agent-lunch-free')).toBe(1);
    });
    it('한 점심이 비어 있으면 → 0건', () => {
        expect(count(evaluateAll(build(false)), 'agent-lunch-free')).toBe(0);
    });
});

// ──────────────────────────────── 금지칸 — 고정 배치는 위반이 아니다
describe('blocked-cell 은 fixed 를 세지 않는다', () => {
    const withBlock = (fixed: boolean): Doc => ({
        ...makeSmallDoc(), demands: [],
        weeklyBlocks: [{ id: 'wb', name: '동아리', dayIndex: 0, slotIndex: 3, targets: [] }],
        assignments: [put('x', IDS.t31, 0, 3, { agentId: IDS.a1, activityId: IDS.sci, fixed })],
    });
    it('금지칸 위의 고정 배치(창체) → 0건', () => expect(count(evaluateAll(withBlock(true)), 'blocked-cell')).toBe(0));
    it('금지칸 위의 일반 배치 → 1건', () => expect(count(evaluateAll(withBlock(false)), 'blocked-cell')).toBe(1));
});

// ──────────────────────────────── 교사 축 소프트 — fixed·담임 제외
describe('교사 축 소프트는 fixed·담임을 세지 않는다', () => {
    it('고정 배치(담임 창체)만 있는 학교 → 소프트 위반 0', () => {
        const doc = sampleDoc();
        doc.rules = defaultRules();
        // sampleDoc.assignments 는 반마다 창체(수요일 4교시) 고정 배치뿐이다
        const soft = evaluateAll(doc).filter((v) => v.kind === 'soft');
        expect(soft.length).toBe(0);
    });
});

// ──────────────────────────────── 진단
describe('diagnose', () => {
    it('하드가 먼저, subjectCount 가 대상 수', () => {
        const base = makeSmallDoc();
        const doc: Doc = { ...base, demands: [],
            weeklyBlocks: [{ id: 'wb', name: '회피', dayIndex: 0, targets: [{ kind: 'agent', id: IDS.a1 }], soft: true }],
            assignments: [
                put('t1', IDS.t31, 0, 0, { agentId: IDS.a1, activityId: IDS.sci }),
                put('t1b', IDS.t31, 0, 0, { agentId: IDS.a1, activityId: IDS.sci }), // t31 겹침
                put('t2', IDS.t32, 0, 0, { agentId: IDS.a1, activityId: IDS.sci }),
                put('t2b', IDS.t32, 0, 0, { agentId: IDS.a1, activityId: IDS.sci }), // t32 겹침
            ],
        };
        const dg = diagnose(doc);
        expect(dg.rules[0].kind).toBe('hard');
        const trackRule = dg.rules.find((r) => r.templateId === 'no-overlap-track')!;
        expect(trackRule.count).toBe(2);
        expect(trackRule.subjectCount).toBe(2); // t31, t32
        expect(dg.rules.some((r) => r.kind === 'soft')).toBe(true); // 회피 soft 가 뒤에 온다
    });
});

// ──────────────────────────────── 이동 미리보기
describe('previewMove · applyMove · candidateCells', () => {
    it('pinned 은 hardBroken', () => {
        const doc = { ...makeSmallDoc(), demands: [], assignments: [
            put('p1', IDS.t31, 0, 0, { agentId: IDS.a1, activityId: IDS.sci, pinned: true }),
        ] };
        const pv = previewMove(doc, { assignmentId: 'p1', to: { trackId: IDS.t31, dayIndex: 0, slotIndex: 1 } });
        expect(pv.hardBroken).toBe(true);
        expect(pv.hardReasons[0]).toContain('이동금지');
    });

    it('빈 칸 이동 → rows 에 규칙 행이 있고 after 가 옮겨져 있다', () => {
        const doc = { ...makeSmallDoc(), demands: [], assignments: [
            put('m1', IDS.t31, 0, 0, { agentId: IDS.a1, activityId: IDS.sci }),
        ] };
        const pv = previewMove(doc, { assignmentId: 'm1', to: { trackId: IDS.t31, dayIndex: 0, slotIndex: 1 } });
        expect(pv.rows.length).toBeGreaterThan(0);
        const moved = pv.after.assignments.find((a) => a.id === 'm1')!;
        expect(moved.slotIndex).toBe(1);
        // applyMove 도 같은 결과
        const applied = applyMove(doc, { assignmentId: 'm1', to: { trackId: IDS.t31, dayIndex: 0, slotIndex: 1 } });
        expect(applied.assignments.find((a) => a.id === 'm1')!.slotIndex).toBe(1);
    });

    it('맞바꾸기(swap)', () => {
        const doc = { ...makeSmallDoc(), demands: [], assignments: [
            put('m1', IDS.t31, 0, 0, { agentId: IDS.a1, activityId: IDS.sci }),
            put('m2', IDS.t31, 0, 1, { agentId: IDS.a2, activityId: IDS.eng }),
        ] };
        const after = applyMove(doc, { assignmentId: 'm1', to: { trackId: IDS.t31, dayIndex: 0, slotIndex: 1 }, swap: true });
        expect(after.assignments.find((a) => a.id === 'm1')!.slotIndex).toBe(1);
        expect(after.assignments.find((a) => a.id === 'm2')!.slotIndex).toBe(0);
    });

    it('candidateCells 는 self 칸을 표시한다', () => {
        const doc = { ...makeSmallDoc(), demands: [], assignments: [
            put('m1', IDS.t31, 0, 0, { agentId: IDS.a1, activityId: IDS.sci }),
        ] };
        const cv = candidateCells(doc, 'm1');
        expect(cv.cells['0:0']).toBe('self');
        expect(Object.keys(cv.cells).length).toBeGreaterThan(1);
    });
});

// ──────────────────────────────── 솔버
describe('solve · autoAdjust', () => {
    it('small 에서 하드 0 · 배치 수 == 시수 합 · 같은 seed 는 같은 결과', async () => {
        const doc = makeSmallDoc();
        const totalHours = doc.demands.reduce((s, d) => s + d.count, 0);
        const r1 = await solve(doc, { budgetMs: 5000, candidates: 2, seed: 42 });
        expect(r1.best.hard).toBe(0);
        expect(r1.best.assignments.length).toBe(totalHours);
        expect(r1.best.unplaced.length).toBe(0);

        const r2 = await solve(doc, { budgetMs: 5000, candidates: 2, seed: 42 });
        const key = (r: typeof r1) => r.best.assignments
            .map((a) => `${a.id}:${a.trackId}:${a.dayIndex}:${a.slotIndex}`).sort().join('|');
        expect(key(r2)).toBe(key(r1));
    });

    it('demandStatus 는 배정/필요를 센다', async () => {
        const doc = makeSmallDoc();
        const r = await solve(doc, { budgetMs: 5000, candidates: 1, seed: 7 });
        const solved: Doc = { ...doc, assignments: r.best.assignments };
        const st = demandStatus(solved);
        expect(st.every((s) => s.remaining === 0)).toBe(true);
    });

    it('adjustOnly 는 pinned 를 안 움직인다', async () => {
        const doc: Doc = { ...makeSmallDoc(), demands: [], assignments: [
            put('pinned1', IDS.t31, 0, 0, { agentId: IDS.a1, activityId: IDS.sci, pinned: true }),
            put('conf1', IDS.t31, 0, 0, { agentId: IDS.a2, activityId: IDS.eng }), // 같은 칸 → 겹침
        ] };
        const r = await autoAdjust(doc, { budgetMs: 5000, seed: 3 });
        const p = r.best.assignments.find((a) => a.id === 'pinned1')!;
        expect(p.dayIndex).toBe(0);
        expect(p.slotIndex).toBe(0);
    });
});
