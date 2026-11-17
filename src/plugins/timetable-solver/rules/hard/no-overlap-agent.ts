/**
 * 하드 규칙 「no-overlap-agent」 — 편성 규칙 낱개 기여 하나(F2a · v1 engine/rules.ts 에서 글자 그대로 옮김).
 *   선생님 말: 한 선생님이 같은 시간에 두 반에 들어가지 않게.
 */
import type { Violation } from '../../types/schema';
import type { RuleContribution } from '../../contracts/rule';
import { agentRef, agentDays, mkViol } from '../kit';

export const noOverlapAgent: RuleContribution = {
    about: '한 선생님이 같은 시간에 두 반에 들어가지 않게',
    id: 'no-overlap-agent', label: '교사 겹침', kind: 'hard', params: [],
    description: '같은 교사가 겹치는 시각에 두 반에 들어가 있습니다(교시 번호가 아니라 실제 시각으로 봅니다). 함께 수업으로 같은 반 같은 칸에 함께 드는 것은 예외입니다. 담임은 반이 정하므로 이 규칙에서 뺍니다.',
    defaultMessage: '{교사} 교사가 {요일}요일 같은 시각에 두 반에 들어가 있습니다',
    evaluate(_p, ctx) {
        const out: Violation[] = [];
        for (const ag of ctx.doc.agents) {
            const byDay = agentDays(ctx, ag.id);
            for (const [, list] of byDay) {
                const clocks = list.map((a) => ({ a, c: ctx.clockOf(a) }));
                for (let i = 0; i < clocks.length; i++) {
                    for (let j = i + 1; j < clocks.length; j++) {
                        const A = clocks[i], B = clocks[j];
                        if (!A.c || !B.c) continue;
                        if (!ctx.overlaps(A.c, B.c)) continue;
                        // 같은 반 같은 칸은 예외 (협력수업)
                        if (A.a.trackId === B.a.trackId && A.a.slotIndex === B.a.slotIndex) continue;
                        out.push(mkViol({
                            templateId: 'no-overlap-agent', kind: 'hard',
                            message: this.defaultMessage, assignmentIds: [A.a.id, B.a.id],
                            weight: 0, fixable: true, subject: agentRef(ag.id),
                        }));
                    }
                }
            }
        }
        return out;
    },
};
