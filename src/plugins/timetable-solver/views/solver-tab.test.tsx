// @vitest-environment jsdom
/**
 * 자동 편성 화면 시험 — ① 막힘이 있으면 편성 단추가 막히고 막힘 목록이 선생님 말로 보인다
 *   ② worker 를 가짜로 바꿔 진행률이 보이고 · 결과가 plans 약속의 savePlan 으로 간다 · 「편성안에서 보기」 안내
 *   ③ 멈춤은 담지 않는다. ⛔ 실자료 0 — 이름은 지어낸 것.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PluginHost } from '../../../pane-ui-system/plugin';
import type { Staff } from '../../staff/contracts/staff';
import type { School } from '../../school/contracts/school';
import type { Subjects } from '../../subjects/contracts/subjects';
import type { Rooms } from '../../rooms/contracts/rooms';
import type { Plan } from '../../timetable-plans/contracts/plans';
import { clockApi } from '../../bell/clock';
import { dutyApi } from '../../duty/api';
import { NODE_TYPES } from '../read-canon';
import { HOMEROOM_AGENT_ID } from '../types/schema';
import type { WorkerLike } from '../solve-runner';
import { SolverTab } from './SolverTab';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const onChange = () => ({ dispose: () => {} });
const staff = {
    onChange,
    lists: () => [{ id: 'sl', name: '명단' }],
    staffIn: () => [
        { id: 't1', listId: 'sl', name: '가온', kind: 'subject', tier: 2 },
        { id: 't2', listId: 'sl', name: '나래', kind: 'homeroom', homeroomClassIds: ['c1'] },
    ],
} as unknown as Staff;
const school = {
    onChange,
    school: () => ({ id: 's', name: '가상초등학교' }),
    years: () => [{ id: 'y1', name: '2099' }],
    classesIn: () => [{ id: 'c1', yearId: 'y1', name: '1-1', grade: 1, rooms: [], special: false }],
} as unknown as School;
const subjects = {
    onChange,
    lists: () => [{ id: 'bl', name: '과목' }],
    subjectsIn: () => [{ id: 'sub1', listId: 'bl', name: '가상과학' }],
} as unknown as Subjects;
const rooms = { onChange, lists: () => [], roomsIn: () => [], roomProps: () => ({ active: false }) } as unknown as Rooms;

const row = (id: string, values: Record<string, unknown>) => ({ id, name: id, data: { values } });
const BELL = [
    row('b1', { f_kind: 'class', f_period: 1, f_start: '09:00', f_end: '09:40' }),
    row('b2', { f_kind: 'class', f_period: 2, f_start: '09:50', f_end: '10:30' }),
];
const DEMAND = [row('m1', { f_teacher: ['t1'], f_class: ['c1'], f_subject: ['sub1'], f_hours: 2 })];

function makeHost(opts: { demand: typeof DEMAND; plans: { savePlan: (p: Plan) => string; cmd?: { open: string } } | null; run: (id: string) => boolean; mods?: Record<string, unknown> }): PluginHost {
    const nodes = {
        liveByType: (t: string) => (t === NODE_TYPES.bellSlot ? BELL : t === NODE_TYPES.demandRow ? opts.demand : []),
        subscribe: () => ({ dispose: () => {} }),
    };
    const mods: Record<string, unknown> = { nodes, staff, school, subjects, rooms, clock: clockApi, duty: dutyApi, plans: opts.plans, ...opts.mods };
    return {
        modules: { use: (n: string) => mods[n] ?? null },
        commands: { run: opts.run },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => false, estimate: async () => null },
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {} },
    } as unknown as PluginHost;
}

/** 가짜 worker — 시험이 직접 메시지를 흘려 보낸다. */
class FakeWorker implements WorkerLike {
    onmessage: WorkerLike['onmessage'] = null;
    onerror: WorkerLike['onerror'] = null;
    posted: unknown[] = [];
    terminated = false;
    postMessage(m: unknown) { this.posted.push(m); }
    terminate() { this.terminated = true; }
    emit(data: unknown) { this.onmessage?.({ data }); }
}

let root: Root; let container: HTMLDivElement;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

const q = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement | null;
const tick = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

const RESULT = {
    best: {
        label: '균형형', strategy: 's', hard: 0, soft: 2, unplaced: [{ demandId: 'm1', missing: 1 }],
        assignments: [
            { id: 'a1', kind: 'work', timetableId: 'x', trackId: 'c1', dayIndex: 0, slotIndex: 1, agentId: 't1', activityId: 'sub1' },
            { id: 'a2', kind: 'work', timetableId: 'x', trackId: 'c1', dayIndex: 2, slotIndex: 0, agentId: HOMEROOM_AGENT_ID, activityId: 'sub1' },
        ],
    },
    candidates: [], elapsedMs: 5,
};

describe('자동 편성 화면', () => {
    it('막힘(시수표가 빔)이 있으면 편성 단추가 막히고 막힘이 선생님 말로 보인다', () => {
        const w = new FakeWorker();
        const host = makeHost({ demand: [], plans: { savePlan: () => 'p1' }, run: () => true });
        act(() => { root.render(<SolverTab host={host} createWorker={() => w} />); });
        expect(q('solver-start')!.disabled).toBe(true);
        expect(container.textContent).toContain('시수표에 수업 줄이 하나도 없습니다');
        act(() => { q('solver-start')!.click(); });
        expect(w.posted).toEqual([]);
    });

    it('막힘마다 「열기」 단추가 있고 누르면 그 꾸러미 약속의 명령을 부른다(반 없음 → 학교 정보 · 시수표 빔 → 시수표) — T-10ft', () => {
        const run = vi.fn(() => true);
        const emptySchool = { ...school, classesIn: () => [], cmd: { open: 'school-open' } };
        const host = makeHost({ demand: [], plans: { savePlan: () => 'p1' }, run, mods: { school: emptySchool, 'demand-table': { version: 1, cmd: { open: 'demand-open' } } } });
        act(() => { root.render(<SolverTab host={host} createWorker={() => new FakeWorker()} />); });
        act(() => { q('solver-fix-no-class')!.click(); });
        expect(run).toHaveBeenLastCalledWith('school-open');
        expect(q('solver-fix-no-class')!.textContent).toBe('학교 정보 열기');
        act(() => { q('solver-fix-no-demand')!.click(); });
        expect(run).toHaveBeenLastCalledWith('demand-open');
    });

    it('고칠 꾸러미가 꺼져 있으면 단추를 안 단다', () => {
        const host = makeHost({ demand: [], plans: { savePlan: () => 'p1' }, run: () => true });
        act(() => { root.render(<SolverTab host={host} createWorker={() => new FakeWorker()} />); });
        expect(container.textContent).toContain('시수표에 수업 줄이 하나도 없습니다');
        expect(q('solver-fix-no-demand')).toBeNull();
    });

    it('편성안 플러그인이 꺼져 있으면 단추가 막힌다', () => {
        const host = makeHost({ demand: DEMAND, plans: null, run: () => true });
        act(() => { root.render(<SolverTab host={host} createWorker={() => new FakeWorker()} />); });
        expect(q('solver-start')!.disabled).toBe(true);
        expect(container.textContent).toContain('편성안 플러그인이 꺼져 있어');
    });

    it('막힘이 없으면 worker 로 돌리고, 진행률을 보이고, 결과를 savePlan 으로 보내고, 편성안에서 보기를 안내한다', async () => {
        const w = new FakeWorker();
        const saved: Plan[] = [];
        const run = vi.fn(() => true);
        const host = makeHost({ demand: DEMAND, plans: { cmd: { open: 'plans-open' }, savePlan: (p) => { saved.push(p); return 'p1'; } }, run });
        act(() => { root.render(<SolverTab host={host} createWorker={() => w} />); });
        expect(q('solver-start')!.disabled).toBe(false);

        act(() => { q('solver-start')!.click(); });
        await tick();
        expect(w.posted).toHaveLength(1);
        expect(q('solver-start')!.disabled).toBe(true);
        expect(q('solver-stop')).not.toBeNull();

        act(() => { w.emit({ type: 'progress', progress: { candidate: 2, of: 4, hard: 1, soft: 3, elapsedMs: 10 } }); });
        expect(q('solver-progress')!.textContent).toContain('2/4');

        act(() => { w.emit({ type: 'result', result: RESULT }); });
        await tick();
        expect(saved).toHaveLength(1);
        expect(saved[0].summary).toEqual({ score: null, hardViolations: 0, softViolations: 2 });
        // 1번 칸 = 2교시(월), 센티널 칸은 담임(t2) 선생님으로 되찾아 수요일 1교시
        expect(saved[0].placements).toEqual([
            { classId: 'c1', day: 1, period: 2, subjectId: 'sub1', teacherId: 't1' },
            { classId: 'c1', day: 3, period: 1, subjectId: 'sub1', teacherId: 't2' },
        ]);
        expect(w.terminated).toBe(true);
        expect(q('solver-saved')!.textContent).toContain('못 채운 시수가 1시간');
        act(() => { q('solver-open-plans')!.click(); });
        expect(run).toHaveBeenCalledWith('plans-open');
    });

    it('멈춤을 누르면 worker 를 끝내고 아무것도 담지 않는다', async () => {
        const w = new FakeWorker();
        const savePlan = vi.fn(() => 'p1');
        const host = makeHost({ demand: DEMAND, plans: { savePlan }, run: () => true });
        act(() => { root.render(<SolverTab host={host} createWorker={() => w} />); });
        act(() => { q('solver-start')!.click(); });
        await tick();
        act(() => { q('solver-stop')!.click(); });
        await tick();
        expect(w.terminated).toBe(true);
        expect(savePlan).not.toHaveBeenCalled();
        expect(container.textContent).toContain('편성을 멈췄습니다');
        expect(q('solver-start')!.disabled).toBe(false);
    });

    it('worker 오류는 화면에 선생님 말로 보이고 담지 않는다', async () => {
        const w = new FakeWorker();
        const savePlan = vi.fn(() => 'p1');
        const host = makeHost({ demand: DEMAND, plans: { savePlan }, run: () => true });
        act(() => { root.render(<SolverTab host={host} createWorker={() => w} />); });
        act(() => { q('solver-start')!.click(); });
        await tick();
        act(() => { w.emit({ type: 'error', error: '가상 오류' }); });
        await tick();
        expect(container.querySelector('[role="alert"]')!.textContent).toContain('가상 오류');
        expect(savePlan).not.toHaveBeenCalled();
    });
});
