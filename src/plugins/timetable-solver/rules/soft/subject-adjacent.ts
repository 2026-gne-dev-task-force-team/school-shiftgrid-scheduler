/**
 * 소프트 규칙 「subject-adjacent」 — 편성 규칙 낱개 기여 하나(F2b · v1 engine/rules.ts 에서 글자 그대로 옮김).
 *   선생님 말: 같은 반 같은 과목이 하루에 둘 이상이면 떨어지지 않고 붙어서(점심을 사이에 두지 않게).
 */
import type { Assignment, Violation } from '../../types/schema';
import type { RuleContribution } from '../../contracts/rule';
import { trackRef, sViol } from '../kit';

export const subjectAdjacent: RuleContribution = {
    about: '같은 반 같은 과목이 하루에 둘 이상이면 떨어지지 않고 붙어서(점심을 사이에 두지 않게)',
    id: 'subject-adjacent', label: '같은 과목 붙이기', kind: 'soft', bucket: 'important', params: [],
    description: '같은 반·같은 과목이 같은 날 둘 이상인데 이어지지 않거나 점심을 사이에 두면 점수가 붙습니다(고정 수업 제외).',
    defaultMessage: '{반} {과목}이 같은 날 떨어져 있습니다',
    evaluate(_p, ctx) {
        const out: Violation[] = [];
        const groups = new Map<string, Assignment[]>();
        for (const a of ctx.doc.assignments) {
            if (!a.activityId || a.fixed) continue;
            const k = `${a.trackId}|${a.activityId}|${a.dayIndex}`;
            (groups.get(k) ?? groups.set(k, []).get(k)!).push(a);
        }
        for (const [, list] of groups) {
            if (list.length < 2) continue;
            const idxs = list.map((a) => a.slotIndex).sort((x, y) => x - y);
            let bad = idxs[idxs.length - 1] - idxs[0] !== idxs.length - 1 || new Set(idxs).size !== idxs.length;
            if (!bad) {
                const sp = ctx.specOfTrack(list[0].trackId);
                if (sp) for (let i = idxs[0]; i <= idxs[idxs.length - 1]; i++) {
                    if (sp.slots.find((s) => s.index === i)?.kind === 'lunch') { bad = true; break; }
                }
            }
            if (bad) {
                out.push(sViol(ctx, 'subject-adjacent', 'important', this.defaultMessage,
                    list.map((a) => a.id), 1, list[0].agentId, list[0].trackId, list[0].dayIndex, trackRef(list[0].trackId)));
            }
        }
        return out;
    },
};
