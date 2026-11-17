/**
 * 소프트 규칙 「one-place-per-day」 — 편성 규칙 낱개 기여 하나(F2b · v1 engine/rules.ts 에서 글자 그대로 옮김).
 *   선생님 말: 한 선생님이 하루 동안 교실과 특별실을 오가지 않게(골라서 켬).
 */
import type { Violation } from '../../types/schema';
import type { RuleContribution } from '../../contracts/rule';
import { bool, agentRef, agentSoftDays, isSoftAgent, sViol } from '../kit';

export const onePlacePerDay: RuleContribution = {
    about: '한 선생님이 하루 동안 교실과 특별실을 오가지 않게(골라서 켬)',
    id: 'one-place-per-day', label: '하루 한 장소', kind: 'soft', bucket: 'essential',
    params: [{ key: 'enabled', label: '적용', type: 'boolean', default: false }],
    description: '교사가 하루에 일반 교실 수업과 특별실 수업을 섞으면 점수가 붙습니다(선택).',
    defaultMessage: '{교사} 교사가 {요일}요일 교실과 특별실을 오갑니다',
    evaluate(p, ctx) {
        const out: Violation[] = [];
        if (!bool(p, 'enabled', false)) return out;
        for (const ag of ctx.doc.agents) {
            if (!isSoftAgent(ctx, ag.id)) continue;
            for (const [day, list] of agentSoftDays(ctx, ag.id)) {
                const hasRoom = list.some((a) => a.resourceId);
                const hasClass = list.some((a) => !a.resourceId);
                if (hasRoom && hasClass) {
                    out.push(sViol(ctx, 'one-place-per-day', 'essential', this.defaultMessage,
                        list.map((a) => a.id), 1, ag.id, list[0].trackId, day, agentRef(ag.id)));
                }
            }
        }
        return out;
    },
};
