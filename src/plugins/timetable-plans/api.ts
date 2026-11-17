/**
 * 🔴 plans 인터페이스 모듈 — manifest.provides.plans 와 짝. host.modules.use<Plans>('plans') 가 이걸 받는다.
 */
import type { Plans, PlanListItem } from './contracts/plans';
import { savePlan, getPlanNodes, planOf, subscribePlans } from './nodes';

// 같은 노드 목록이면 같은 배열을 돌려준다(useSyncExternalStore 가 바뀌었나를 참조로 본다).
let memoFor: unknown = null;
let memo: PlanListItem[] = [];
const listPlans = (): PlanListItem[] => {
    const nodes = getPlanNodes();
    if (nodes === memoFor) return memo;
    memoFor = nodes;
    memo = nodes.flatMap((n) => {
        const p = planOf(n.id);
        return p ? [{ id: n.id, name: p.name, summary: p.summary, chosen: !!p.chosen }] : [];
    });
    return memo;
};

export const plansApi: Plans = { version: 1, savePlan, listPlans, getPlan: planOf, subscribe: subscribePlans };
