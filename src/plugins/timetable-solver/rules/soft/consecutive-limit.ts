/**
 * 소프트 규칙 「consecutive-limit」 — 편성 규칙 낱개 기여 하나(F2b · v1 engine/rules.ts 에서 글자 그대로 옮김).
 *   선생님 말: 한 선생님이 쉬는 틈 없이 너무 오래 이어서 수업하지 않게.
 */
import type { Violation } from '../../types/schema';
import type { RuleContribution } from '../../contracts/rule';
import { num, agentRef, runsOf, agentSoftDays, isSoftAgent, sViol } from '../kit';

export const consecutiveLimit: RuleContribution = {
    about: '한 선생님이 쉬는 틈 없이 너무 오래 이어서 수업하지 않게',
    id: 'consecutive-limit', label: '연속 수업 상한', kind: 'soft', bucket: 'important',
    params: [{ key: 'limit', label: '연속 상한', type: 'number', default: 6 }],
    description: '교사가 하루에 쉬지 않고 이어서 하는 수업이 상한(기본 6)에 이르면 점수가 붙습니다.',
    defaultMessage: '{교사} 교사가 {요일}요일에 너무 오래 이어서 수업합니다',
    evaluate(p, ctx) {
        const out: Violation[] = [];
        const limit = num(p, 'limit', 6);
        for (const ag of ctx.doc.agents) {
            if (!isSoftAgent(ctx, ag.id)) continue;
            for (const [day, list] of agentSoftDays(ctx, ag.id)) {
                for (const run of runsOf(ctx, list)) {
                    if (run.length >= limit) {
                        out.push(sViol(ctx, 'consecutive-limit', 'important', this.defaultMessage,
                            run.map((a) => a.id), 1, ag.id, run[0].trackId, day, agentRef(ag.id)));
                    }
                }
            }
        }
        return out;
    },
};
