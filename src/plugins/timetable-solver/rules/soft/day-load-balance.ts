/**
 * 소프트 규칙 「day-load-balance」 — 편성 규칙 낱개 기여 하나(F2b · v1 engine/rules.ts 에서 글자 그대로 옮김).
 *   선생님 말: 선생님의 요일별 수업 수가 들쭉날쭉하지 않게.
 */
import type { Violation } from '../../types/schema';
import type { RuleContribution } from '../../contracts/rule';
import { num, agentRef, agentSoftAll, isSoftAgent, sViol } from '../kit';

export const dayLoadBalance: RuleContribution = {
    about: '선생님의 요일별 수업 수가 들쭉날쭉하지 않게',
    id: 'day-load-balance', label: '요일 시수 균형', kind: 'soft', bucket: 'preferred',
    params: [{ key: 'tolerance', label: '허용 편차', type: 'number', default: 2 }],
    description: '교사의 요일별 수업 수가 평균 ± 허용치(기본 2)를 벗어나면 점수가 붙습니다.',
    defaultMessage: '{교사} 교사 요일별 시수가 들쭉날쭉합니다',
    evaluate(p, ctx) {
        const out: Violation[] = [];
        const tol = num(p, 'tolerance', 2);
        for (const ag of ctx.doc.agents) {
            if (!isSoftAgent(ctx, ag.id)) continue;
            const list = agentSoftAll(ctx, ag.id);
            if (list.length === 0) continue;
            const counts = [0, 0, 0, 0, 0];
            for (const a of list) if (a.dayIndex >= 0 && a.dayIndex < 5) counts[a.dayIndex]++;
            const mean = list.length / 5;
            let mag = 0;
            for (const c of counts) if (Math.abs(c - mean) > tol) mag++;
            if (mag > 0) {
                out.push(sViol(ctx, 'day-load-balance', 'preferred', this.defaultMessage,
                    list.map((a) => a.id), mag, ag.id, list[0].trackId, list[0].dayIndex, agentRef(ag.id)));
            }
        }
        return out;
    },
};
