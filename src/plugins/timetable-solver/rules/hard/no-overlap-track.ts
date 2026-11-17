/**
 * 하드 규칙 「no-overlap-track」 — 편성 규칙 낱개 기여 하나(F2a · v1 engine/rules.ts 에서 글자 그대로 옮김).
 *   선생님 말: 한 반의 한 칸에는 수업이 하나만 들어가게.
 */
import type { Assignment, Violation } from '../../types/schema';
import type { RuleContribution } from '../../contracts/rule';
import { trackRef, mkViol } from '../kit';

export const noOverlapTrack: RuleContribution = {
    about: '한 반의 한 칸에는 수업이 하나만 들어가게',
    id: 'no-overlap-track', label: '같은 반 겹침', kind: 'hard', params: [],
    description: '같은 반의 한 칸에 수업이 둘 이상 들어가 있습니다.',
    defaultMessage: '{반} {요일}요일에 한 칸에 수업이 겹칩니다',
    evaluate(_p, ctx) {
        const out: Violation[] = [];
        const buckets = new Map<string, Assignment[]>();
        for (const a of ctx.doc.assignments) {
            const k = `${a.trackId}|${a.dayIndex}|${a.slotIndex}`;
            (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(a);
        }
        for (const arr of buckets.values()) {
            if (arr.length > 1) {
                out.push(mkViol({
                    templateId: 'no-overlap-track', kind: 'hard',
                    message: this.defaultMessage, assignmentIds: arr.map((a) => a.id),
                    weight: 0, fixable: true, subject: trackRef(arr[0].trackId),
                }));
            }
        }
        return out;
    },
};
