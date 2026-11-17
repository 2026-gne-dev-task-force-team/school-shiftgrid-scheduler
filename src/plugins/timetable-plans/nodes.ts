/**
 * 편성안 ↔ 노드 시스템 다리 — 편성안 한 벌이 노드(timetable-plans.plan)다. 저장·휴지통은 노드 시스템이 쥔다.
 *   ⛔ host.store·persist·tree 를 직접 안 본다 — NodesApi 하나로만.
 *   🔴 「이 안 고르기」→ 격자: 격자는 시간표 노드(timetable-grid.sheet)의 data(글자 칸)를 읽는다. 그 노드를 NodesApi.create 로 만들어 넘길 뿐
 *      격자 코드는 건드리지 않는다(약속 = 노드 약속 + 시간표 data 꼴 · 타입만 import).
 */
import type { NodesApi, PublicNode, NodeTypeImplFns } from '../../pane-ui-system/core/nodes/contracts/nodes';
import type { Disposable, NodeTypeContribution, PluginHost } from '../../pane-ui-system/plugin';
import { classesOf, planToGridData } from './model';
import type { LabelOf, Plan } from './types';

export const PLAN_TYPE = 'timetable-plans.plan';
/** 격자 시간표 노드 타입 — 남의 플러그인 값은 못 끌어오니 이름만 적는다(구조 검사 ⑨). */
export const GRID_SHEET_TYPE = 'timetable-grid.sheet';
const VIEW_ID = 'timetable-plans.plans';

let api: NodesApi | null = null;
const subs = new Set<() => void>();
let planNodes: PublicNode[] = [];

function recompute(): void {
    planNodes = api ? api.liveByType(PLAN_TYPE) : [];
    for (const s of subs) s();
}

export function initPlans(nodes: NodesApi | null): Disposable | null {
    api = nodes;
    recompute();
    return nodes ? nodes.subscribe(() => recompute()) : null;
}
export const subscribePlans = (fn: () => void): (() => void) => { subs.add(fn); return () => { subs.delete(fn); }; };
export const getPlanNodes = (): PublicNode[] => planNodes;
export const planOf = (id: string): Plan | null => (api?.get(id)?.data as Plan | undefined) ?? null;

/** 편성안 저장 — 새 노드로(맨 위). 새 id, 못 하면 ''. */
export function savePlan(plan: Plan): string {
    if (!api) return '';
    return api.create(api.roots.main, { type: PLAN_TYPE, name: plan.name, data: plan });
}

/** 이 안 고르기 — 고른 안만 chosen=true(나머지는 해제). 한 번의 되돌리기 칸. */
export function choosePlan(id: string): boolean {
    const a = api;
    if (!a || !planOf(id)) return false;
    a.batch(() => {
        for (const n of planNodes) {
            const p = n.data as Plan | undefined;
            if (!p) continue;
            const want = n.id === id;
            if (!!p.chosen !== want) a.setData(n.id, { ...p, chosen: want });
        }
    });
    return true;
}
export const chosenPlanId = (): string | null => planNodes.find((n) => (n.data as Plan | undefined)?.chosen)?.id ?? null;

/**
 * 고른 안을 격자에 보낸다 — 폴더 「편성안 {이름}」 밑에 반마다 시간표 한 장(글자 칸). 만든 시간표 id 목록.
 *   격자에 이미 있는 노드 약속만 쓴다. 같은 안을 다시 보내면 새 폴더가 하나 더 생긴다(격자 노드는 우리가 덮어쓸 수 없다).
 */
export function sendToGrid(id: string, label: LabelOf): string[] {
    const plan = planOf(id);
    const a = api;
    if (!a || !plan) return [];
    const out: string[] = [];
    a.batch(() => {
        const folder = a.create(a.roots.main, { type: 'folder', name: `편성안 ${plan.name}` });
        for (const c of classesOf(plan)) {
            const sid = a.create(folder, { type: GRID_SHEET_TYPE, name: label('class', c), data: planToGridData(plan, c, label) });
            if (sid) out.push(sid);
        }
    });
    return out;
}

export const planNodeTypeImpl = {
    plan: {
        open: (host: PluginHost) => { host.workspace.open(VIEW_ID, { where: 'center' }); },
    } satisfies NodeTypeImplFns,
};

export const planNodeTypes: NodeTypeContribution<'plan'>[] = [
    { type: PLAN_TYPE, label: '편성안', icon: 'layers', openable: true, impl: 'plan' },
];
