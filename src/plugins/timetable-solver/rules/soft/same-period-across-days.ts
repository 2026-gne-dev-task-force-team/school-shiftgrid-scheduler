/**
 * 소프트 규칙 「same-period-across-days」 — 편성 규칙 낱개 기여 하나(F2b · v1 engine/rules.ts 에서 글자 그대로 옮김).
 *   선생님 말: 같은 반 같은 과목은 요일이 달라도 되도록 같은 교시에.
 */
import type { Assignment, Violation } from '../../types/schema';
import type { RuleContribution } from '../../contracts/rule';
import { trackRef, sViol } from '../kit';

export const samePeriodAcrossDays: RuleContribution = {
    about: '같은 반 같은 과목은 요일이 달라도 되도록 같은 교시에',
    id: 'same-period-across-days', label: '요일별 동일 교시', kind: 'soft', bucket: 'preferred', params: [],
    description: '같은 반·같은 과목이 여러 요일에 있을 때 교시가 다른 수입니다(같은 교시로 모을수록 좋습니다). 고정 수업은 셈에서 뺍니다.',
    defaultMessage: '{반} {과목} 교시가 요일마다 다릅니다',
    evaluate(_p, ctx) {
        const out: Violation[] = [];
        const groups = new Map<string, Assignment[]>();
        for (const a of ctx.doc.assignments) {
            if (!a.activityId || a.fixed) continue;
            const k = `${a.trackId}|${a.activityId}`;
            (groups.get(k) ?? groups.set(k, []).get(k)!).push(a);
        }
        for (const [, list] of groups) {
            if (list.length < 2) continue;
            const freq = new Map<number, number>();
            for (const a of list) freq.set(a.slotIndex, (freq.get(a.slotIndex) ?? 0) + 1);
            const maxFreq = Math.max(...freq.values());
            const mag = list.length - maxFreq;
            if (mag > 0) {
                out.push(sViol(ctx, 'same-period-across-days', 'preferred', this.defaultMessage,
                    list.map((a) => a.id), mag, list[0].agentId, list[0].trackId, list[0].dayIndex, trackRef(list[0].trackId)));
            }
        }
        return out;
    },
};
