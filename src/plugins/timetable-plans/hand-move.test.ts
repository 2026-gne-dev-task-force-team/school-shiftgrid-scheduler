/**
 * 손으로 옮기기 증명 — 진짜 엔진(solverApi)으로 ① 갈 수 있는 칸 ② 충돌 미리보기(선생님 말) ③ 옮긴 뒤 저장 ④ 고정·잠금 칸은 안 옮겨짐 ⑤ 되돌리기.
 *   ⛔ 실명 금지 — 지어낸 이름만.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PluginHost } from '../../pane-ui-system/plugin';

const kv = vi.hoisted(() => {
    const store = new Map<string, Record<string, unknown>>();
    return {
        store,
        nodesGetAll: vi.fn(async (): Promise<unknown[] | null> => [...store.values()]),
        nodesWrite: vi.fn(async (batch: { put?: Record<string, unknown>[]; del?: string[]; clear?: boolean }): Promise<boolean> => {
            if (batch.clear) store.clear();
            for (const v of batch.put ?? []) store.set(v.id as string, v);
            for (const id of batch.del ?? []) store.delete(id);
            return true;
        }),
    };
});
vi.mock('../../pane-ui-system/kv', () => ({ nodesGetAll: kv.nodesGetAll, nodesWrite: kv.nodesWrite }));

import { initStore } from '../../pane-ui-system/core/node-store/store';
import { __resetPersistForTest } from '../../pane-ui-system/core/node-store/persist';
import { makeNodesApi } from '../../pane-ui-system/core/node-frame/api';
import { registerType, clearTypes } from '../../pane-ui-system/core/nodes/model/types';
import { clearDerived } from '../../pane-ui-system/core/nodes/model/derive';
import { solverApi } from '../timetable-solver/api';
import { buildSolverInput } from '../timetable-solver/build-context';
import type { SolverCanon } from '../timetable-solver/contracts/solver';
import { clockApi } from '../bell/clock';
import { dutyApi } from '../duty/api';
import { makePlan } from './model';
import { planNodeTypes, planNodeTypeImpl, initPlans, savePlan, planOf, replacePlan } from './nodes';
import { buildHandDoc, candidates, preview, moveInPlan, toggleLock, placementKey } from './hand-move';
import type { Placement } from './types';

function host(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
    } as unknown as PluginHost;
}

// 지어낸 학교 — 1학년 두 반 · 4교시 · 전담 둘
const canon: SolverCanon = {
    school: { name: '가상초등학교' },
    range: { startDate: '2099-03-02', endDate: '2099-07-20' },
    staff: [{ id: 't-a', name: '다라선생', kind: 'subject', tier: 2 }, { id: 't-b', name: '마바선생', kind: 'subject', tier: 2 }],
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
const KOR = P('c1', 1, 1, 's-kor', 't-a');          // 가반 월 1교시 국어
const MAT = P('c1', 1, 2, 's-mat', 't-b');          // 가반 월 2교시 수학
const OTH = P('c2', 2, 1, 's-kor', 't-a');          // 나반 화 1교시 국어(같은 선생님)
const planX = () => makePlan('안 하나', [KOR, MAT, OTH], { score: 80, hardViolations: 0, softViolations: 0 });
const hand = (plan = planX()) => buildHandDoc(solverApi, input, plan);
const K = placementKey(KOR);

describe('손으로 옮기기 — 갈 수 있는 칸 · 미리보기', () => {
    it('후보 칸 — 빈 칸은 갈 수 있고, 같은 선생님이 다른 반에 있는 시간은 못 가며, 지금 칸은 「지금 칸」', () => {
        const c = candidates(hand(), K);
        expect(c.get('c1|1|1')?.verdict).toBe('self');
        expect(c.get('c1|3|1')?.verdict).toBe('ok');                // 빈 칸 · 겹침 없음
        expect(c.get('c1|2|1')?.verdict).toBe('hard');              // 화 1교시는 같은 선생님이 나반 수업
        expect(c.get('c1|2|1')?.reasons.length).toBeGreaterThan(0); // 까닭이 말로 붙는다
        expect(c.get('c1|1|2')?.verdict).toMatch(/ok|soft/);        // 수학 칸과 서로 바꾸는 칸
        expect(c.size).toBe(5 * 4);                                  // 월~금 × 4교시
    });
    it('충돌 미리보기 — 못 가는 까닭을 선생님 말로, 갈 수 있으면 막힘 없음', () => {
        const bad = preview(hand(), K, { day: 2, period: 1 });
        expect(bad.canMove).toBe(false);
        expect(bad.reasons.length).toBeGreaterThan(0);
        expect(bad.reasons.join('')).toMatch(/[가-힣]/);
        const ok = preview(hand(), K, { day: 3, period: 1 });
        expect(ok).toMatchObject({ canMove: true, reasons: [] });
        expect(ok.swapWith).toBeUndefined();
    });
    it('서로 바꾸기 — 그 자리 수업이 미리보기에 나온다', () => {
        const pv = preview(hand(), K, { day: 1, period: 2 });
        expect(pv.swapWith).toMatchObject({ subjectId: 's-mat' });
    });
});

describe('손으로 옮기기 — 옮기기 · 고정 · 잠금', () => {
    it('옮기면 그 칸 배치만 바뀌고 나머지·정본 id 는 그대로, 위반 수는 엔진이 다시 센다', () => {
        const next = moveInPlan(hand(), K, { day: 3, period: 1 })!;
        expect(next).not.toBeNull();
        expect(next.placements.find((p) => p.subjectId === 's-kor' && p.classId === 'c1')).toMatchObject({ day: 3, period: 1, teacherId: 't-a' });
        expect(next.placements.filter((p) => placementKey(p) !== 'c1|3|1')).toEqual([MAT, OTH]);
        expect(next.summary.score).toBeNull();
        // 위반 수 = 엔진이 옮긴 뒤 안을 다시 센 값(이 시험 안은 시수 한 칸이 빠져 있어 처음부터 하드 위반이 있다 — 옮겨서 늘지는 않는다)
        const hard = (pl: typeof next) => solverApi.evaluateAll(hand(pl).doc).filter((v) => v.kind === 'hard').length;
        expect(next.summary.hardViolations).toBe(hard(next));
        expect(next.summary.hardViolations).toBe(hard(planX()));
    });
    it('서로 바꾸면 둘의 자리가 맞바뀐다', () => {
        const next = moveInPlan(hand(), K, { day: 1, period: 2 })!;
        expect(next.placements.find((p) => p.subjectId === 's-kor' && p.classId === 'c1')).toMatchObject({ day: 1, period: 2 });
        expect(next.placements.find((p) => p.subjectId === 's-mat')).toMatchObject({ day: 1, period: 1 });
    });
    it('규칙을 어기는 칸으로는 안 옮겨진다', () => {
        expect(moveInPlan(hand(), K, { day: 2, period: 1 })).toBeNull();
    });
    it('고정한 칸·잠근 칸·임시 잠금 칸은 안 옮겨지고 말로 알린다 · 푸면 다시 옮겨진다', () => {
        for (const [kind, word] of [['fixed', '고정'], ['pinned', '잠가'], ['temp', '잠가']] as const) {
            const locked = toggleLock(planX(), K, kind);
            expect(locked.placements[0][kind]).toBe(true);
            const pv = preview(hand(locked), K, { day: 3, period: 1 });
            expect(pv.canMove).toBe(false);
            expect(pv.reasons[0]).toContain(word);
            expect(moveInPlan(hand(locked), K, { day: 3, period: 1 })).toBeNull();
            const freed = toggleLock(locked, K, kind);
            expect('fixed' in freed.placements[0] || 'pinned' in freed.placements[0] || 'temp' in freed.placements[0]).toBe(false);
            expect(moveInPlan(hand(freed), K, { day: 3, period: 1 })).not.toBeNull();
        }
    });
    it('잠긴 칸이 있는 자리로는 바꾸러 갈 수 없다', () => {
        const locked = toggleLock(planX(), placementKey(MAT), 'pinned');
        expect(candidates(hand(locked), K).get('c1|1|2')?.verdict).toBe('blocked');
        expect(moveInPlan(hand(locked), K, { day: 1, period: 2 })).toBeNull();
    });
});

describe('손으로 옮기기 — 저장 · 되돌리기', () => {
    beforeEach(async () => {
        kv.store.clear(); clearTypes(); clearDerived(); __resetPersistForTest();
        await initStore(host());
        registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
        const api = makeNodesApi('timetable-plans');
        for (const nt of planNodeTypes) api.registerContributed(nt, { nodeTypes: planNodeTypeImpl }, host());
        initPlans(api);
    });
    afterEach(() => { initPlans(null); __resetPersistForTest(); });

    it('옮긴 안이 저장돼 다시 읽어도 옮긴 자리이고, 되돌리면 처음 안으로 돌아온다', () => {
        const id = savePlan(planX());
        const before = planOf(id)!;
        const moved = moveInPlan(hand(before), K, { day: 3, period: 1 })!;
        expect(replacePlan(id, moved)).toBe(true);
        expect(planOf(id)!.placements.some((p) => placementKey(p) === 'c1|3|1')).toBe(true);
        expect(planOf(id)!.placements.some((p) => placementKey(p) === K)).toBe(false);
        expect(planOf(id)!.name).toBe('안 하나');
        expect(replacePlan(id, before)).toBe(true);              // 되돌리기 = 옮기기 전 안을 다시 쓴다
        expect(planOf(id)).toEqual(before);
        expect(replacePlan('없는id', before)).toBe(false);
    });
});
