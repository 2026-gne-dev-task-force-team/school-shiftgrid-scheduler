/**
 * 하드 규칙 「demand-count」 — 편성 규칙 낱개 기여 하나(F2a · v1 engine/rules.ts 에서 글자 그대로 옮김).
 *   선생님 말: 시수표에 적은 주당 시수만큼 정확히 수업이 들어가게(모자라도·넘쳐도 안 됨).
 */
import type { Violation } from '../../types/schema';
import { isHomeroomAgent } from '../../types/schema';
import type { RuleContribution } from '../../contracts/rule';
import { agentRef, mkViol } from '../kit';

export const demandCount: RuleContribution = {
    about: '시수표에 적은 주당 시수만큼 정확히 수업이 들어가게(모자라도·넘쳐도 안 됨)',
    id: 'demand-count', label: '시수 부족·초과', kind: 'hard', params: [],
    description: '수요마다 배치한 수업 수가 정한 주당 시수와 같아야 합니다(부족·초과 모두 어긋납니다).',
    defaultMessage: '{교사} 시수가 정한 값과 다릅니다',
    evaluate(_p, ctx) {
        const out: Violation[] = [];
        for (const d of ctx.doc.demands) {
            const placed = ctx.byDemand(d.id);
            if (placed.length !== d.count) {
                const who = isHomeroomAgent(d.agentId)
                    ? `${ctx.tracks.get(d.trackId)?.homeroomName ?? ctx.tracks.get(d.trackId)?.name ?? '담임'} 담임`
                    : `${ctx.agents.get(d.agentId)?.name ?? d.agentId} 교사`;
                out.push(mkViol({
                    templateId: 'demand-count', kind: 'hard',
                    message: `${who} 시수 ${placed.length}/${d.count}`,
                    assignmentIds: placed.map((a) => a.id),
                    weight: 0, fixable: true, subject: agentRef(d.agentId),
                }));
            }
        }
        return out;
    },
};
