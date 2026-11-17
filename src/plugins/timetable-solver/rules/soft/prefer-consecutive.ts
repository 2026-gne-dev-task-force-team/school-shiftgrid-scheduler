/**
 * 소프트 규칙 「prefer-consecutive」 — 편성 규칙 낱개 기여 하나(F2b · v1 engine/rules.ts 에서 글자 그대로 옮김).
 *   선생님 말: 선생님의 하루 수업이 여러 토막으로 갈리지 않고 이어지게.
 */
import type { Violation } from '../../types/schema';
import type { RuleContribution } from '../../contracts/rule';
import { agentRef, runsOf, agentSoftDays, isSoftAgent, sViol } from '../kit';

export const preferConsecutive: RuleContribution = {
    about: '선생님의 하루 수업이 여러 토막으로 갈리지 않고 이어지게',
    id: 'prefer-consecutive', label: '수업 토막 줄이기', kind: 'soft', bucket: 'important', params: [],
    description: '교사의 하루 수업이 여러 토막으로 갈릴수록 점수가 붙습니다.',
    defaultMessage: '{교사} 교사 {요일}요일 수업이 토막나 있습니다',
    evaluate(_p, ctx) {
        const out: Violation[] = [];
        for (const ag of ctx.doc.agents) {
            if (!isSoftAgent(ctx, ag.id)) continue;
            for (const [day, list] of agentSoftDays(ctx, ag.id)) {
                const runs = runsOf(ctx, list);
                const mag = runs.length - 1;
                if (mag > 0) {
                    out.push(sViol(ctx, 'prefer-consecutive', 'important', this.defaultMessage,
                        list.map((a) => a.id), mag, ag.id, list[0].trackId, day, agentRef(ag.id)));
                }
            }
        }
        return out;
    },
};
