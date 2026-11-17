/**
 * 소프트 규칙 「subjects-per-day-agent」 — 편성 규칙 낱개 기여 하나(F2b · v1 engine/rules.ts 에서 글자 그대로 옮김).
 *   선생님 말: 한 선생님이 하루에 너무 많은 학년·과목을 오가지 않게.
 */
import type { Violation } from '../../types/schema';
import type { RuleContribution } from '../../contracts/rule';
import { num, agentRef, agentSoftDays, isSoftAgent, sViol } from '../kit';

export const subjectsPerDayAgent: RuleContribution = {
    about: '한 선생님이 하루에 너무 많은 학년·과목을 오가지 않게',
    id: 'subjects-per-day-agent', label: '교사 하루 과목 수', kind: 'soft', bucket: 'important',
    params: [{ key: 'max', label: '하루 과목 상한', type: 'number', default: 3 }],
    description: '교사가 하루에 맡는 (학년·과목) 가짓수가 상한(기본 3)을 넘으면 점수가 붙습니다.',
    defaultMessage: '{교사} 교사가 {요일}요일에 과목을 너무 많이 맡습니다',
    evaluate(p, ctx) {
        const out: Violation[] = [];
        const max = num(p, 'max', 3);
        for (const ag of ctx.doc.agents) {
            if (!isSoftAgent(ctx, ag.id)) continue;
            for (const [day, list] of agentSoftDays(ctx, ag.id)) {
                const kinds = new Set<string>();
                for (const a of list) kinds.add(`${ctx.tracks.get(a.trackId)?.grade}|${a.activityId}`);
                const mag = kinds.size - max;
                if (mag > 0) {
                    out.push(sViol(ctx, 'subjects-per-day-agent', 'important', this.defaultMessage,
                        list.map((a) => a.id), mag, ag.id, list[0].trackId, day, agentRef(ag.id)));
                }
            }
        }
        return out;
    },
};
