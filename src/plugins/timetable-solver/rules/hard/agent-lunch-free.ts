/**
 * 하드 규칙 「agent-lunch-free」 — 편성 규칙 낱개 기여 하나(F2a · v1 engine/rules.ts 에서 글자 그대로 옮김).
 *   선생님 말: 전담 선생님이 날마다 점심 먹을 빈 시간이 있게.
 */
import type { Violation } from '../../types/schema';
import { isHomeroomAgent } from '../../types/schema';
import type { ClockRange } from '../../engine/api';
import { hm } from '../../engine/context';
import type { RuleContribution } from '../../contracts/rule';
import { num, agentRef, gradeLunches, agentDays, mkViol } from '../kit';

export const agentLunchFree: RuleContribution = {
    about: '전담 선생님이 날마다 점심 먹을 빈 시간이 있게',
    id: 'agent-lunch-free', label: '교사 점심 시간 확보', kind: 'hard',
    params: [{ key: 'window', label: '점심 허용 오차(분)', type: 'number', default: 0, help: '점심 시각 기준 ±분까지 봐 줍니다' }],
    description: '전담 교사는 그날 가르치는 학년들의 점심 시각 중 적어도 하나에는 수업이 없어야 합니다. 점심 기준을 정한 교사는 그 시간 틀의 점심 시각이 비어 있어야 합니다. 담임은 반이 정하므로 뺍니다.',
    defaultMessage: '{교사} 교사가 {요일}요일 점심에 쉴 칸이 없습니다',
    evaluate(p, ctx) {
        const out: Violation[] = [];
        const window = num(p, 'window', 0);
        for (const ag of ctx.doc.agents) {
            if (isHomeroomAgent(ag.id) || ag.role === '담임 겸 전담') continue;
            const byDay = agentDays(ctx, ag.id);
            for (const [day, list] of byDay) {
                const clocks = list.map((a) => ctx.clockOf(a)).filter((c): c is ClockRange => !!c);
                let violated: boolean;
                if (ag.lunchSpecId) {
                    // 점심 기준 틀의 점심 시각이 비어 있어야 한다(모두)
                    const sp = ctx.specs.get(ag.lunchSpecId);
                    const lunches = sp
                        ? sp.slots.filter((s) => s.kind === 'lunch')
                            .map((s) => ({ dayIndex: day, startMin: hm(s.start), endMin: hm(s.end) }))
                        : [];
                    if (lunches.length === 0) continue;
                    violated = lunches.some((L) => {
                        const lo = L.startMin - window, hi = L.endMin + window;
                        return clocks.some((c) => c.startMin < hi && lo < c.endMin);
                    });
                } else {
                    // 그날 가르치는 학년들의 점심 중 하나만 비어도 통과
                    const grades = new Set<number>();
                    for (const a of list) {
                        const g = ctx.tracks.get(a.trackId)?.grade;
                        if (g != null) grades.add(g);
                    }
                    const lunches: ClockRange[] = [];
                    for (const g of grades) lunches.push(...gradeLunches(ctx, g, day));
                    if (lunches.length === 0) continue;
                    const free = lunches.some((L) => {
                        const lo = L.startMin - window, hi = L.endMin + window;
                        return !clocks.some((c) => c.startMin < hi && lo < c.endMin);
                    });
                    violated = !free;
                }
                if (violated) {
                    out.push(mkViol({
                        templateId: 'agent-lunch-free', kind: 'hard',
                        message: this.defaultMessage, assignmentIds: list.map((a) => a.id),
                        weight: 0, fixable: true, subject: agentRef(ag.id),
                    }));
                }
            }
        }
        return out;
    },
};
