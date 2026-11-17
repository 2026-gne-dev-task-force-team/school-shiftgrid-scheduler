/**
 * 하드 규칙 「blocked-cell」 — 편성 규칙 낱개 기여 하나(F2a · v1 engine/rules.ts 에서 글자 그대로 옮김).
 *   선생님 말: 수업을 못 넣게 막아 둔 칸(협의회·행사 등)에는 수업이 들어가지 않게.
 */
import type { Violation } from '../../types/schema';
import { isHomeroomAgent } from '../../types/schema';
import type { RuleContribution } from '../../contracts/rule';
import { agentRef, trackRef, resourceRef, mkViol } from '../kit';

export const blockedCell: RuleContribution = {
    about: '수업을 못 넣게 막아 둔 칸(협의회·행사 등)에는 수업이 들어가지 않게',
    id: 'blocked-cell', label: '배정 불가 칸 사용', kind: 'hard', params: [],
    description: '수업이 배정 불가 칸에 들어가 있습니다. 교사·반·특별실을 각각 봅니다. 함께 수업이면 두 교사 모두 봅니다.',
    defaultMessage: '{반} {요일}요일 수업이 배정 불가 칸에 들어가 있습니다',
    evaluate(_p, ctx) {
        const out: Violation[] = [];
        for (const a of ctx.doc.assignments) {
            if (a.fixed) continue; // 고정 배치는 그 금지칸의 이유이지 위반이 아니다(예: 동아리 칸의 창체)
            const c = ctx.clockOf(a);
            if (!c) continue;
            let hit = false;
            if (ctx.isBlocked(trackRef(a.trackId), c, a.trackId)) hit = true;
            if (!hit && a.agentId && !isHomeroomAgent(a.agentId) && ctx.isBlocked(agentRef(a.agentId), c, a.trackId)) hit = true;
            if (!hit && a.coAgentId && !isHomeroomAgent(a.coAgentId) && ctx.isBlocked(agentRef(a.coAgentId), c, a.trackId)) hit = true;
            if (!hit && a.resourceId && ctx.isBlocked(resourceRef(a.resourceId), c, a.trackId)) hit = true;
            if (hit) {
                out.push(mkViol({
                    templateId: 'blocked-cell', kind: 'hard',
                    message: this.defaultMessage, assignmentIds: [a.id],
                    weight: 0, fixable: true, subject: trackRef(a.trackId),
                }));
            }
        }
        return out;
    },
};
