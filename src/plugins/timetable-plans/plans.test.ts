/**
 * 편성안 증명 — ① 자료는 id 만(이름 복사 없음) ② 두 벌 비교(다른 칸 수·위반 수) ③ 저장(노드) ④ 이 안 고르기 → 격자가 읽는 시간표가 생김.
 *   ⛔ 실명 금지(공개 레포) — 지어낸 이름만.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PluginHost } from '../../pane-ui-system/plugin';

const kv = vi.hoisted(() => {
    const store = new Map<string, Record<string, unknown>>();
    const nodesGetAll = vi.fn(async (): Promise<unknown[] | null> => [...store.values()]);
    const nodesWrite = vi.fn(async (batch: { put?: Record<string, unknown>[]; del?: string[]; clear?: boolean }): Promise<boolean> => {
        if (batch.clear) store.clear();
        for (const v of batch.put ?? []) store.set(v.id as string, v);
        for (const id of batch.del ?? []) store.delete(id);
        return true;
    });
    return { store, nodesGetAll, nodesWrite };
});
vi.mock('../../pane-ui-system/kv', () => ({ nodesGetAll: kv.nodesGetAll, nodesWrite: kv.nodesWrite }));

import { initStore } from '../../pane-ui-system/core/node-store/store';
import { __resetPersistForTest } from '../../pane-ui-system/core/node-store/persist';
import { makeNodesApi } from '../../pane-ui-system/core/node-frame/api';
import { registerType, clearTypes } from '../../pane-ui-system/core/nodes/model/types';
import { clearDerived } from '../../pane-ui-system/core/nodes/model/derive';
import { gridNodeTypes, gridNodeTypeImpl, initGridNodes, sheetDataOf, SHEET_TYPE } from '../timetable-grid/nodes';
import { cellKey, normalizeTimetable } from '../timetable-grid/model';
import type { TimetableData } from '../timetable-grid/types';
import { makePlan, comparePlans, planToGridData, classesOf } from './model';
import { planNodeTypes, planNodeTypeImpl, initPlans, savePlan, choosePlan, chosenPlanId, sendToGrid, planOf, getPlanNodes, GRID_SHEET_TYPE } from './nodes';
import { labelFrom, NOT_FOUND } from './labels';
import type { Placement } from './types';

function host(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
    } as unknown as PluginHost;
}

// 지어낸 정본 id 와 이름
const NAMES: Record<string, string> = { c1: '가반', c2: '나반', s1: '국어', s2: '수학', t1: '다라선생', t2: '마바선생', r1: '별빛실' };
const label = (_k: string, id: string): string => NAMES[id] ?? NOT_FOUND;
const P = (classId: string, day: Placement['day'], period: number, subjectId: string, teacherId: string, roomId?: string): Placement =>
    ({ classId, day, period, subjectId, teacherId, ...(roomId ? { roomId } : {}) });

const planA = () => makePlan('안 하나', [P('c1', 1, 1, 's1', 't1'), P('c1', 1, 2, 's2', 't2', 'r1'), P('c2', 2, 1, 's1', 't1')], { score: 80, hardViolations: 0, softViolations: 3 });
const planB = () => makePlan('안 둘', [P('c1', 1, 1, 's1', 't1'), P('c1', 1, 2, 's2', 't1'), P('c2', 3, 1, 's1', 't1')], { score: 70, hardViolations: 1, softViolations: 1 });

describe('편성안 자료 · 비교(순수)', () => {
    it('저장 자료엔 정본 id 만 — 이름·정원 같은 복사 칸이 없다', () => {
        const json = JSON.stringify(planA());
        for (const name of Object.values(NAMES)) expect(json).not.toContain(name);
        expect(Object.keys(planA().placements[0]).sort()).toEqual(['classId', 'day', 'period', 'subjectId', 'teacherId']);
    });
    it('같은 칸에 두 번 들어온 배치는 뒤엣것만', () => {
        const p = makePlan('x', [P('c1', 1, 1, 's1', 't1'), P('c1', 1, 1, 's2', 't2')]);
        expect(p.placements).toHaveLength(1);
        expect(p.placements[0].subjectId).toBe('s2');
    });
    it('두 벌 비교 — 다른 칸 수와 위반 수', () => {
        const d = comparePlans(planA(), planB());
        // (c1,1,2) 교사 다름 · (c2,2,1) 왼쪽에만 · (c2,3,1) 오른쪽에만
        expect(d).toMatchObject({ diffCells: 3, onlyA: 1, onlyB: 1, changed: 1, violationsA: 3, violationsB: 2 });
        expect(comparePlans(planA(), planA()).diffCells).toBe(0);
    });
    it('격자 자료 — 이름은 보일 때 정본에서, 격자가 그대로 읽는다', () => {
        const g: TimetableData = planToGridData(planA(), 'c1', label);   // 대입이 되면 약속 꼴이 격자 자료와 맞는 것
        expect(g.cells[cellKey(0, 0)].text).toBe('국어 다라선생');
        expect(g.cells[cellKey(0, 1)].text).toBe('수학 마바선생 · 별빛실');
        expect(normalizeTimetable(g)).toBeTruthy();
        expect(classesOf(planA())).toEqual(['c1', 'c2']);
    });
    it('정본에 없는 id 는 「찾을 수 없음」', () => {
        const l = labelFrom({ staff: null, school: null, subjects: null, rooms: null });
        expect(l('teacher', 'zz')).toBe(NOT_FOUND);
    });
});

describe('편성안 저장 · 고르기 · 격자로', () => {
    beforeEach(async () => {
        kv.store.clear(); clearTypes(); clearDerived(); __resetPersistForTest();
        await initStore(host());
        registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
        const gridApi = makeNodesApi('timetable-grid');
        for (const nt of gridNodeTypes) gridApi.registerContributed(nt, { nodeTypes: gridNodeTypeImpl }, host());
        initGridNodes(gridApi);
        const api = makeNodesApi('timetable-plans');
        for (const nt of planNodeTypes) api.registerContributed(nt, { nodeTypes: planNodeTypeImpl }, host());
        initPlans(api);
    });
    afterEach(() => { initPlans(null); initGridNodes(null); __resetPersistForTest(); });

    it('저장한 안이 노드로 남고 자료가 그대로다', () => {
        const id = savePlan(planA());
        expect(id).not.toBe('');
        expect(getPlanNodes().map((n) => n.name)).toEqual(['안 하나']);
        expect(planOf(id)?.summary).toEqual({ score: 80, hardViolations: 0, softViolations: 3 });
    });
    it('이 안 고르기 — 한 번에 한 벌만 고른 안', () => {
        const a = savePlan(planA()); const b = savePlan(planB());
        expect(choosePlan(a)).toBe(true);
        expect(chosenPlanId()).toBe(a);
        expect(choosePlan(b)).toBe(true);
        expect(chosenPlanId()).toBe(b);
        expect(planOf(a)?.chosen).toBe(false);
        expect(choosePlan('없는id')).toBe(false);
    });
    it('고른 안을 격자로 — 반마다 시간표 한 장이 생기고 격자가 칸 글자를 읽는다', () => {
        const a = savePlan(planA());
        const ids = sendToGrid(a, label);
        expect(ids).toHaveLength(2);
        const data = sheetDataOf(ids[0]);
        expect(data.cells[cellKey(0, 0)]?.text).toBe('국어 다라선생');
        expect(GRID_SHEET_TYPE).toBe(SHEET_TYPE);   // 격자 노드 타입 이름이 어긋나면 여기서 빨강
    });
});
