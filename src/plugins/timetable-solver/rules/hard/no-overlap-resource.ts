/**
 * 하드 규칙 「no-overlap-resource」 — 편성 규칙 낱개 기여 하나(F2a · v1 engine/rules.ts 에서 글자 그대로 옮김).
 *   선생님 말: 과학실 같은 특별실을 같은 시간에 정원보다 많은 반이 쓰지 않게.
 */
import type { Assignment, Violation } from '../../types/schema';
import { pooledCapacity } from '../../engine/resource-pool';
import type { RuleContribution } from '../../contracts/rule';
import { mkViol } from '../kit';

export const noOverlapResource: RuleContribution = {
    about: '과학실 같은 특별실을 같은 시간에 정원보다 많은 반이 쓰지 않게',
    id: 'no-overlap-resource', label: '특별실 정원 초과', kind: 'hard', params: [],
    description: '같은 시각에 특별실을 정원보다 많이 쓰고 있습니다. 한 과목에 특별실이 여럿이면 그 과목이 쓰는 특별실 정원을 합쳐서 봅니다.',
    defaultMessage: '{요일}요일 같은 시각에 특별실 정원을 넘겼습니다',
    evaluate(_p, ctx) {
        const out: Violation[] = [];
        // 특별실을 쓰는 배치를 과목별로 묶는다
        const byAct = new Map<string, Assignment[]>();
        for (const a of ctx.doc.assignments) {
            if (!a.resourceId || !a.activityId) continue;
            (byAct.get(a.activityId) ?? byAct.set(a.activityId, []).get(a.activityId)!).push(a);
        }
        for (const [actId, list] of byAct) {
            const referenced = new Set(list.map((a) => a.resourceId!));
            const pooledCap = pooledCapacity(ctx.doc.resources, actId, referenced);
            // 요일별로 동시 사용 최대치 검사
            const byDay = new Map<number, Assignment[]>();
            for (const a of list) (byDay.get(a.dayIndex) ?? byDay.set(a.dayIndex, []).get(a.dayIndex)!).push(a);
            for (const [, day] of byDay) {
                const offenders = new Set<string>();
                for (const a of day) {
                    const ca = ctx.clockOf(a);
                    if (!ca) continue;
                    let sim = 0;
                    for (const b of day) {
                        const cb = ctx.clockOf(b);
                        if (cb && ctx.overlaps(ca, cb)) sim++;
                    }
                    if (sim > pooledCap) offenders.add(a.id);
                }
                if (offenders.size) {
                    out.push(mkViol({
                        templateId: 'no-overlap-resource', kind: 'hard',
                        message: this.defaultMessage, assignmentIds: [...offenders],
                        weight: 0, fixable: true,
                    }));
                }
            }
        }
        return out;
    },
};
