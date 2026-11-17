/**
 * 소프트 규칙 「priority-early」 — 편성 규칙 낱개 기여 하나(F2b · v1 engine/rules.ts 에서 글자 그대로 옮김).
 *   선생님 말: 공유 특별실의 이른 시각은 우선순위가 높은 선생님이 먼저 쓰게.
 */
import type { Violation } from '../../types/schema';
import { isHomeroomAgent } from '../../types/schema';
import type { RuleContribution } from '../../contracts/rule';
import { resourceRef, isSoftAgent } from '../kit';

export const priorityEarly: RuleContribution = {
    about: '공유 특별실의 이른 시각은 우선순위가 높은 선생님이 먼저 쓰게',
    id: 'priority-early', label: '우선순위 높은 교사 이른 시각 우선', kind: 'soft', bucket: 'preferred', params: [],
    description: '공유 특별실에서 우선순위가 낮은 교사가 우선순위가 높은 교사보다 이른 시각을 차지하면 점수가 붙습니다.',
    defaultMessage: '특별실 이른 시각을 우선순위가 낮은 교사가 차지했습니다',
    evaluate(_p, ctx) {
        const out: Violation[] = [];
        for (const r of ctx.doc.resources) {
            const list = ctx.doc.assignments.filter((a) => a.resourceId === r.id && a.agentId && !a.fixed && isSoftAgent(ctx, a.agentId));
            const items = list.map((a) => {
                const c = ctx.clockOf(a);
                // 담임은 이 비교에서 빠지지만(isSoftAgent=false), 혹 들어오면 우선순위 없음 → 2로 본다
                const tierNum = isHomeroomAgent(a.agentId) ? 2 : (ctx.agents.get(a.agentId!)?.tier ?? 3);
                return { a, tierNum, t: c ? c.dayIndex * 100000 + c.startMin : 0 };
            }).sort((x, y) => x.t - y.t);
            let inv = 0;
            const ids: string[] = [];
            for (let i = 0; i < items.length; i++) {
                for (let j = i + 1; j < items.length; j++) {
                    if (items[i].tierNum > items[j].tierNum) { inv++; ids.push(items[i].a.id); }
                }
            }
            if (inv > 0) {
                out.push({
                    ruleId: 'priority-early', templateId: 'priority-early', kind: 'soft',
                    message: this.defaultMessage, assignmentIds: [...new Set(ids)],
                    weight: inv * ctx.bucketWeight('preferred'), fixable: true,
                    subject: resourceRef(r.id),
                });
            }
        }
        return out;
    },
};
