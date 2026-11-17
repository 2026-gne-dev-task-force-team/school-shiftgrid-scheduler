/**
 * 소프트 규칙 「day-cluster」 — 편성 규칙 낱개 기여 하나(F2b · v1 engine/rules.ts 에서 글자 그대로 옮김).
 *   선생님 말: 선생님 수업을 적은 요일에 몰거나(몰기) 요일마다 고르게 나누게(분산).
 */
import type { Violation } from '../../types/schema';
import type { RuleContribution } from '../../contracts/rule';
import { str, agentRef, agentSoftDays, agentSoftAll, isSoftAgent, sViol } from '../kit';

export const dayCluster: RuleContribution = {
    about: '선생님 수업을 적은 요일에 몰거나(몰기) 요일마다 고르게 나누게(분산)',
    id: 'day-cluster', label: '교사 요일 몰기/분산', kind: 'soft', bucket: 'preferred',
    params: [{ key: 'mode', label: '방식', type: 'select', options: ['몰기', '분산'], default: '몰기' }],
    description: '몰기는 교사가 쓰는 요일 수를 줄이고, 분산은 요일별 수업 수를 고르게 합니다.',
    defaultMessage: '{교사} 교사 요일 배치가 목표와 다릅니다',
    evaluate(p, ctx) {
        const out: Violation[] = [];
        const mode = str(p, 'mode', '몰기');
        for (const ag of ctx.doc.agents) {
            if (!isSoftAgent(ctx, ag.id)) continue;
            const byDay = agentSoftDays(ctx, ag.id);
            const list = agentSoftAll(ctx, ag.id);
            if (list.length === 0) continue;
            let mag = 0;
            if (mode === '분산') {
                const counts = [0, 0, 0, 0, 0];
                for (const a of list) if (a.dayIndex >= 0 && a.dayIndex < 5) counts[a.dayIndex]++;
                const mean = list.length / 5;
                mag = Math.round(counts.reduce((s, c) => s + (c - mean) * (c - mean), 0));
            } else {
                mag = byDay.size - 1;
            }
            if (mag > 0) {
                out.push(sViol(ctx, 'day-cluster', 'preferred', this.defaultMessage,
                    list.map((a) => a.id), mag, ag.id, list[0].trackId, list[0].dayIndex, agentRef(ag.id)));
            }
        }
        return out;
    },
};
