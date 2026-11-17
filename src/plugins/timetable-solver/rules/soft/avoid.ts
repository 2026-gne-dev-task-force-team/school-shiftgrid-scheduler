/**
 * 소프트 규칙 「avoid」 — 편성 규칙 낱개 기여 하나(F2b · v1 engine/rules.ts 에서 글자 그대로 옮김).
 *   선생님 말: 「되도록 피함」으로 표시한 시간에는 되도록 수업이 안 들어가게.
 */
import type { Violation, WeeklyBlock } from '../../types/schema';
import type { ClockRange, EngineContext } from '../../engine/api';
import { hm } from '../../engine/context';
import type { RuleContribution } from '../../contracts/rule';
import { agentRef, trackRef, softFixable } from '../kit';

function weeklyBlockRange(ctx: EngineContext, wb: WeeklyBlock, trackId: string): ClockRange | undefined {
    if (wb.slotIndex != null) {
        const slot = ctx.specOfTrack(trackId)?.slots.find((s) => s.index === wb.slotIndex);
        if (!slot) return undefined;
        return { dayIndex: wb.dayIndex, startMin: hm(slot.start), endMin: hm(slot.end) };
    }
    if (wb.from) return { dayIndex: wb.dayIndex, startMin: hm(wb.from), endMin: wb.to ? hm(wb.to) : 24 * 60 };
    return { dayIndex: wb.dayIndex, startMin: 0, endMin: 24 * 60 };
}

export const avoid: RuleContribution = {
    about: '「되도록 피함」으로 표시한 시간에는 되도록 수업이 안 들어가게',
    id: 'avoid', label: '되도록 피함 칸 사용', kind: 'soft', bucket: 'preferred', params: [],
    description: '되도록 피함 칸에 수업이 들어가 있습니다. 우선순위가 높은 교사일수록 점수가 더 크게 붙습니다(고정 수업 제외).',
    defaultMessage: '{교사} 교사가 되도록 피함 시간에 배치됐습니다',
    evaluate(_p, ctx) {
        const out: Violation[] = [];
        const softBlocks = ctx.doc.weeklyBlocks.filter((w) => w.soft);
        if (softBlocks.length === 0) return out;
        for (const a of ctx.doc.assignments) {
            if (a.fixed) continue; // 고정 배치는 권장 감점 대상이 아니다(옮길 수 없다)
            const c = ctx.clockOf(a);
            if (!c) continue;
            const hit = softBlocks.some((wb) => {
                if (wb.dayIndex !== a.dayIndex) return false;
                const t = a.agentId, tr = a.trackId, rs = a.resourceId;
                const matches = wb.targets.length === 0 || wb.targets.some((x) =>
                    (x.kind === 'agent' && x.id === t) ||
                    (x.kind === 'track' && x.id === tr) ||
                    (x.kind === 'resource' && x.id === rs));
                if (!matches) return false;
                const r = weeklyBlockRange(ctx, wb, a.trackId);
                return !!r && ctx.overlaps(c, r);
            });
            if (hit) {
                const tier = a.agentId ? ctx.agents.get(a.agentId)?.tier : undefined;
                const avoidTW = tier === 1 ? 100 : tier === 2 ? 10 : 1;
                out.push({
                    ruleId: 'avoid', templateId: 'avoid', kind: 'soft',
                    message: this.defaultMessage, assignmentIds: [a.id],
                    weight: ctx.bucketWeight('preferred') * avoidTW,
                    fixable: softFixable(ctx, a.trackId, a.dayIndex),
                    subject: a.agentId ? agentRef(a.agentId) : trackRef(a.trackId),
                });
            }
        }
        return out;
    },
};
