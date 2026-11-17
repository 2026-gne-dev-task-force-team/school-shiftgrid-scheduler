/**
 * 소프트 규칙 「compact-day」 — 편성 규칙 낱개 기여 하나(F2b · v1 engine/rules.ts 에서 글자 그대로 옮김).
 *   선생님 말: 선생님의 하루 첫 수업과 마지막 수업 사이에 빈 시간(공강)이 적게.
 */
import type { Violation } from '../../types/schema';
import type { ClockRange } from '../../engine/api';
import type { RuleContribution } from '../../contracts/rule';
import { agentRef, gradeLessonIntervals, agentSoftDays, isSoftAgent, sViol } from '../kit';

export const compactDay: RuleContribution = {
    about: '선생님의 하루 첫 수업과 마지막 수업 사이에 빈 시간(공강)이 적게',
    id: 'compact-day', label: '공강 줄이기', kind: 'soft', bucket: 'important', params: [],
    description: '교사의 하루 첫 수업과 마지막 수업 사이의 빈 칸 수입니다. 그날 가르치는 학년의 점심 시각은 빈 칸에서 뺍니다.',
    defaultMessage: '{교사} 교사 {요일}요일에 공강이 있습니다',
    evaluate(_p, ctx) {
        const out: Violation[] = [];
        for (const ag of ctx.doc.agents) {
            if (!isSoftAgent(ctx, ag.id)) continue;
            for (const [day, list] of agentSoftDays(ctx, ag.id)) {
                const grades = new Set<number>();
                for (const a of list) { const g = ctx.tracks.get(a.trackId)?.grade; if (g != null) grades.add(g); }
                const intervalsMap = new Map<string, ClockRange>();
                for (const g of grades) for (const iv of gradeLessonIntervals(ctx, g, day)) intervalsMap.set(`${iv.startMin}-${iv.endMin}`, iv);
                const intervals = [...intervalsMap.values()].sort((a, b) => a.startMin - b.startMin);
                if (intervals.length === 0) continue;
                const clocks = list.map((a) => ctx.clockOf(a)).filter((c): c is ClockRange => !!c);
                const occ = intervals.map((iv) => clocks.some((c) => c.startMin < iv.endMin && iv.startMin < c.endMin));
                const first = occ.indexOf(true);
                const last = occ.lastIndexOf(true);
                if (first < 0 || first === last) continue;
                let gap = 0;
                for (let i = first; i <= last; i++) if (!occ[i]) gap++;
                if (gap > 0) {
                    out.push(sViol(ctx, 'compact-day', 'important', this.defaultMessage,
                        list.map((a) => a.id), gap, ag.id, list[0].trackId, day, agentRef(ag.id)));
                }
            }
        }
        return out;
    },
};
