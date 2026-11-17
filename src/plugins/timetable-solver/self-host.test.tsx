// @vitest-environment jsdom
/**
 * T-10fe 회귀 — 엔진 약속 readInput 은 **엔진 자기 host** 로 정본을 읽는다.
 *   실제 host(makeHost)는 선언 안 한 인터페이스를 use 하면 던진다. 옛 꼴(readInput(부른 쪽 host))은
 *   clock·duty 를 선언 안 한 ops-check·v1-file 화면을 깨뜨렸다(빌드 실측: 「편성안 점검」 탭 · 「v1 파일로 내보내기」).
 *   🔴 가짜 host 대신 진짜 레지스트리(activateAll)·진짜 makeHost·진짜 manifest 로 잰다 — 가짜 host 는 이 검사를 안 해 놓쳤다.
 */
import { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { activateAll, makeHost, type PluginModule } from '../../pane-ui-system/plugin';
import type { Solver } from './contracts/solver';
import type { Plan, Plans } from '../timetable-plans/contracts/plans';
import { timetableSolverPlugin } from './index';
import { opsCheckPlugin } from '../ops-check/index';
import { v1FilePlugin } from '../v1-file/index';
import { timetablePlansPlugin } from '../timetable-plans/index';
import { PlanCheck } from '../ops-check/PlanCheck';
import { ExportTab } from '../v1-file/views/ExportTab';
import { clockApi } from '../bell/clock';
import { dutyApi } from '../duty/api';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** 약속 하나만 채우는 가짜 제공자 — 엔진(진짜)이 자기 host 로 clock·duty·plans 를 받게 한다. */
function provider(id: string, iface: string, mod: unknown): PluginModule {
    return {
        manifest: { id, name: id, version: '0.1.0', minHostVersion: '0.1.0', provides: { [iface]: '0.1.0' } },
        modules: { [iface]: mod },
    } as PluginModule;
}
const NO_PLANS: ReturnType<Plans['listPlans']> = [];   // 같은 배열 — useSyncExternalStore 스냅숏은 안 바뀌면 같아야 한다
// T-10fm — 편성안이 하나 저장된 상태(빌드 화면은 이 상태에서 점수까지 그렸다)
const ONE_PLAN: Plan = {
    name: '시험안', madeAt: '2099-01-01T00:00:00.000Z', chosen: true,
    placements: [{ classId: 'c1', day: 1, period: 1, subjectId: 's1', teacherId: 't1' }],
    summary: { score: null, hardViolations: 0, softViolations: 0 },
};
const ONE_LIST: ReturnType<Plans['listPlans']> = [{ id: 'p1', name: ONE_PLAN.name, summary: ONE_PLAN.summary, chosen: true }];
let planList = NO_PLANS;
const fakePlans: Plans = {
    version: 1, cmd: { open: 'plans-open' }, savePlan: () => '', listPlans: () => planList,
    getPlan: (id) => (id === 'p1' && planList === ONE_LIST ? ONE_PLAN : null), subscribe: () => () => {},
};

let root: Root | null = null;
let el: HTMLDivElement;
// 🔴 화면은 렌더 오류를 ErrorBoundary 로 격리해 콘솔에만 남긴다 — 시험도 콘솔을 잰다(T-10fm). 「선언 안 한 인터페이스」가 찍히면 실패.
let errSpy: MockInstance<typeof console.error>;
const undeclaredErrors = () => errSpy.mock.calls.map((c) => c.map((x) => (x instanceof Error ? x.message : String(x))).join(' ')).filter((t) => t.includes('선언 안 한 인터페이스'));
beforeEach(() => {
    errSpy = vi.spyOn(console, 'error');
    planList = NO_PLANS;
    activateAll([
        timetableSolverPlugin,
        provider('t10fe-clock', 'clock', clockApi),
        provider('t10fe-duty', 'duty', dutyApi),
        provider('t10fe-plans', 'plans', fakePlans),
    ]);
    el = document.createElement('div');
    document.body.appendChild(el);
});
afterEach(() => {
    act(() => root?.unmount());
    root = null;
    el.remove();
    const bad = undeclaredErrors();
    errSpy.mockRestore();
    expect(bad).toEqual([]);
});

/** 부르는 쪽 플러그인의 진짜 host — 그 플러그인 manifest 의 선언으로만 use 된다. */
const hostOf = (p: PluginModule) => makeHost(p.manifest.id, undefined, p.manifest);

describe('엔진 readInput — 부른 쪽이 clock·duty 를 선언 안 해도 던지지 않는다', () => {
    it.each([opsCheckPlugin, v1FilePlugin, timetablePlansPlugin])('$manifest.id 의 host 로 받은 solver.readInput()', (p) => {
        const solver = hostOf(p).modules.use<Solver>('solver');
        expect(solver).not.toBeNull();
        expect(() => solver!.readInput()).not.toThrow();
    });
    it('부르는 쪽 manifest 는 clock 을 선언하지 않는다(증상 고침으로 덮지 않았다는 증거)', () => {
        for (const p of [opsCheckPlugin, v1FilePlugin]) {
            expect(() => hostOf(p).modules.use('clock')).toThrow(/선언 안 한 인터페이스/);
        }
    });
});

describe('화면 — 진짜 host 로 그린다', () => {
    it('「편성안 점검」 탭이 깨지지 않고 그려진다', () => {
        root = createRoot(el);
        act(() => root!.render(h(PlanCheck, { host: hostOf(opsCheckPlugin) })));
        expect(el.textContent).toContain('점검할 편성안이 없습니다');
    });
    it('편성안이 있는 상태 — 「편성안 점검」 탭이 점수까지 그린다(T-10fm)', () => {
        planList = ONE_LIST;
        root = createRoot(el);
        act(() => root!.render(h(PlanCheck, { host: hostOf(opsCheckPlugin) })));
        expect(el.textContent).toContain('점수');
    });
    it.each([['편성안 없음', NO_PLANS], ['편성안 있음', ONE_LIST]] as const)('「v1 파일로 내보내기」를 누르면 결과 문구가 뜬다(던지면 문구가 안 뜬다) — %s', async (_n, list) => {
        planList = list;
        root = createRoot(el);
        act(() => root!.render(h(ExportTab, { host: hostOf(v1FilePlugin) })));
        const btn = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('v1 파일로 내보내기'));
        expect(btn).toBeTruthy();
        // jsdom 엔 내려받기 길이 없다 — 글이 만들어지면 끝까지 간 것으로 본다
        URL.createObjectURL = () => 'blob:t10fe';
        URL.revokeObjectURL = () => {};
        HTMLAnchorElement.prototype.click = () => {};
        await act(async () => { btn!.click(); await new Promise((r) => setTimeout(r, 0)); });
        expect(el.querySelector('[role="status"]')?.textContent ?? '').not.toBe('');
    });
});
