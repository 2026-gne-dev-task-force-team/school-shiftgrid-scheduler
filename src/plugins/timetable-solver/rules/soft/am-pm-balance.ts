/**
 * 소프트 규칙 「am-pm-balance」 — 편성 규칙 낱개 기여 하나(F2b · v1 engine/rules.ts 에서 글자 그대로 옮김).
 *   선생님 말: 선생님의 하루 수업이 오전이나 오후 한쪽으로 쏠리지 않게.
 */
import type { Violation } from '../../types/schema';
import type { RuleContribution } from '../../contracts/rule';
import { agentRef, gradeLunches, agentSoftDays, isSoftAgent, sViol } from '../kit';

export const amPmBalance: RuleContribution = {
    about: '선생님의 하루 수업이 오전이나 오후 한쪽으로 쏠리지 않게',
    id: 'am-pm-balance', label: '오전·오후 균형', kind: 'soft', bucket: 'preferred', params: [],
    description: '교사의 하루 오전·오후 수업 수 차이입니다(오후 = 점심 뒤).',
    defaultMessage: '{교사} 교사 {요일}요일 오전·오후가 치우쳤습니다',
    evaluate(_p, ctx) {
        const out: Violation[] = [];
        for (const ag of ctx.doc.agents) {
            if (!isSoftAgent(ctx, ag.id)) continue;
            for (const [day, list] of agentSoftDays(ctx, ag.id)) {
                let am = 0, pm = 0;
                for (const a of list) {
                    const c = ctx.clockOf(a);
                    if (!c) continue;
                    const lunches = gradeLunches(ctx, ctx.tracks.get(a.trackId)?.grade, day);
                    const lunchEnd = lunches.length ? Math.min(...lunches.map((l) => l.endMin)) : Infinity;
                    if (c.startMin >= lunchEnd) pm++; else am++;
                }
                const mag = Math.abs(am - pm);
                if (mag > 0) {
                    out.push(sViol(ctx, 'am-pm-balance', 'preferred', this.defaultMessage,
                        list.map((a) => a.id), mag, ag.id, list[0].trackId, day, agentRef(ag.id)));
                }
            }
        }
        return out;
    },
};
