/**
 * 소프트 규칙 「subjects-per-day-track」 — 편성 규칙 낱개 기여 하나(F2b · v1 engine/rules.ts 에서 글자 그대로 옮김).
 *   선생님 말: 한 반이 하루에 전담 과목을 너무 많이 받지 않게.
 */
import type { Assignment, Violation } from '../../types/schema';
import type { RuleContribution } from '../../contracts/rule';
import { num, trackRef, sViol } from '../kit';

export const subjectsPerDayTrack: RuleContribution = {
    about: '한 반이 하루에 전담 과목을 너무 많이 받지 않게',
    id: 'subjects-per-day-track', label: '반 하루 전담 과목 수', kind: 'soft', bucket: 'important',
    params: [{ key: 'max', label: '하루 전담 과목 상한', type: 'number', default: 3 }],
    description: '한 반이 하루에 받는 전담 과목 수가 상한(기본 3)을 넘으면 점수가 붙습니다(고정 수업 제외).',
    defaultMessage: '{반}이 {요일}요일에 전담 과목이 너무 많습니다',
    evaluate(p, ctx) {
        const out: Violation[] = [];
        const max = num(p, 'max', 3);
        const byTrackDay = new Map<string, Assignment[]>();
        for (const a of ctx.doc.assignments) {
            if (a.fixed) continue;
            const k = `${a.trackId}|${a.dayIndex}`;
            (byTrackDay.get(k) ?? byTrackDay.set(k, []).get(k)!).push(a);
        }
        for (const [k, list] of byTrackDay) {
            const [trackId, dayStr] = k.split('|');
            const day = Number(dayStr);
            const acts = new Set(list.map((a) => a.activityId).filter(Boolean));
            const mag = acts.size - max;
            if (mag > 0) {
                out.push(sViol(ctx, 'subjects-per-day-track', 'important', this.defaultMessage,
                    list.map((a) => a.id), mag, undefined, trackId, day, trackRef(trackId)));
            }
        }
        return out;
    },
};
