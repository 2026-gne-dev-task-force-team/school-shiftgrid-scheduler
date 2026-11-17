/**
 * 하드 규칙 「homeroom-plus-free」 — 편성 규칙 낱개 기여 하나(F2a · v1 engine/rules.ts 에서 글자 그대로 옮김).
 *   선생님 말: 담임 겸 전담 선생님은 자기 반에 다른 선생님 수업이 있을 때만 다른 반에 들어가게.
 */
import type { Violation } from '../../types/schema';
import { isHomeroomAgent } from '../../types/schema';
import type { RuleContribution } from '../../contracts/rule';
import { DAYS, agentRef, involvesAgent, mkViol } from '../kit';

// ── 담임 겸 전담 자리 비움 (필수)
export const homeroomPlusFree: RuleContribution = {
    about: '담임 겸 전담 선생님은 자기 반에 다른 선생님 수업이 있을 때만 다른 반에 들어가게',
    id: 'homeroom-plus-free', label: '담임 겸 전담 자리 비움', kind: 'hard', params: [],
    description: '담임 겸 전담 교사가 다른 반 수업을 하는 시각에는, 자기 담임반이 그 시각에 다른 교사의 수업을 받고 있어야 합니다(담임반이 담임 수업 중이면 그 교사가 자리를 비울 수 없습니다).',
    defaultMessage: '{교사} 교사 담임반이 비어 있지 않습니다',
    evaluate(_p, ctx) {
        const out: Violation[] = [];
        for (const ag of ctx.doc.agents) {
            if (ag.role !== '담임 겸 전담' || !ag.homeroomTrackIds?.length) continue;
            const hts = new Set(ag.homeroomTrackIds);
            for (const a of ctx.doc.assignments) {
                if (!involvesAgent(a, ag.id)) continue;
                if (hts.has(a.trackId)) continue;       // 자기 담임반 수업은 문제없음
                const ca = ctx.clockOf(a);
                if (!ca) continue;
                // 담임반 중 하나에 같은 시각 다른 교사의(고정 아님) 수업이 있어야 한다
                const covered = ctx.doc.assignments.some((b) => {
                    if (!hts.has(b.trackId)) return false;
                    if (!b.agentId || isHomeroomAgent(b.agentId) || b.agentId === ag.id || b.fixed) return false;
                    const cb = ctx.clockOf(b);
                    return !!cb && ctx.overlaps(ca, cb);
                });
                if (!covered) {
                    const day = DAYS[a.dayIndex] ?? String(a.dayIndex);
                    const period = ctx.specOfTrack(a.trackId)?.slots.find((s) => s.index === a.slotIndex)?.label ?? `${a.slotIndex}교시`;
                    const otherTrack = ctx.tracks.get(a.trackId)?.name ?? a.trackId;
                    const homeNames = [...hts].map((id) => ctx.tracks.get(id)?.name ?? id).join('·');
                    out.push(mkViol({
                        templateId: 'homeroom-plus-free', kind: 'hard',
                        message: `${ag.name} 교사: ${day} ${period}에 ${otherTrack}반 수업이 있지만 담임반 ${homeNames}은 그 시각에 담임 수업입니다`,
                        assignmentIds: [a.id], weight: 0, fixable: true, subject: agentRef(ag.id),
                    }));
                }
            }
        }
        return out;
    },
};
