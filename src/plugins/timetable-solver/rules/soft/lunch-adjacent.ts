/**
 * 소프트 규칙 「lunch-adjacent」 — 편성 규칙 낱개 기여 하나(F2b · v1 engine/rules.ts 에서 글자 그대로 옮김).
 *   선생님 말: 선생님이 점심 바로 앞과 바로 뒤에 잇달아 수업하지 않게.
 */
import type { Violation } from '../../types/schema';
import type { ClockRange } from '../../engine/api';
import type { RuleContribution } from '../../contracts/rule';
import { agentRef, gradeLunches, agentSoftDays, isSoftAgent, sViol } from '../kit';

export const lunchAdjacent: RuleContribution = {
    about: '선생님이 점심 바로 앞과 바로 뒤에 잇달아 수업하지 않게',
    id: 'lunch-adjacent', label: '점심 앞뒤 연속 수업', kind: 'soft', bucket: 'preferred', params: [],
    description: '교사가 점심 바로 앞 칸과 바로 뒤 칸에 모두 수업하면 점수가 붙습니다.',
    defaultMessage: '{교사} 교사가 {요일}요일 점심 앞뒤로 이어서 수업합니다',
    evaluate(_p, ctx) {
        const out: Violation[] = [];
        for (const ag of ctx.doc.agents) {
            if (!isSoftAgent(ctx, ag.id)) continue;
            for (const [day, list] of agentSoftDays(ctx, ag.id)) {
                const clocks = list.map((a) => ctx.clockOf(a)).filter((c): c is ClockRange => !!c);
                const grades = new Set<number>();
                for (const a of list) { const g = ctx.tracks.get(a.trackId)?.grade; if (g != null) grades.add(g); }
                let hit = false;
                for (const g of grades) {
                    const lunches = gradeLunches(ctx, g, day);
                    for (const L of lunches) {
                        const before = clocks.some((c) => c.endMin === L.startMin);
                        const after = clocks.some((c) => c.startMin === L.endMin);
                        if (before && after) { hit = true; break; }
                    }
                    if (hit) break;
                }
                if (hit) {
                    out.push(sViol(ctx, 'lunch-adjacent', 'preferred', this.defaultMessage,
                        list.map((a) => a.id), 1, ag.id, list[0].trackId, day, agentRef(ag.id)));
                }
            }
        }
        return out;
    },
};
