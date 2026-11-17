/**
 * 하드 규칙 「cycle-order」 — 편성 규칙 낱개 기여 하나(F2a · v1 engine/rules.ts 에서 글자 그대로 옮김).
 *   선생님 말: 진도를 맞추는 과목은 모든 반이 앞 차시를 한 뒤에 다음 차시로 넘어가게.
 */
import type { Assignment, Violation } from '../../types/schema';
import type { EngineContext } from '../../engine/api';
import type { RuleContribution } from '../../contracts/rule';
import { trackRef, mkViol } from '../kit';

/** cycle-order 용 세션(연강 blockId 는 1세션) */
function sessionsOf(ctx: EngineContext, list: Assignment[]): { time: number; ids: string[] }[] {
    const byBlock = new Map<string, { time: number; ids: string[] }>();
    const singles: { time: number; ids: string[] }[] = [];
    for (const a of list) {
        const c = ctx.clockOf(a);
        const t = c ? c.dayIndex * 100000 + c.startMin : 0;
        if (a.blockId) {
            const s = byBlock.get(a.blockId);
            if (s) { s.time = Math.min(s.time, t); s.ids.push(a.id); }
            else byBlock.set(a.blockId, { time: t, ids: [a.id] });
        } else {
            singles.push({ time: t, ids: [a.id] });
        }
    }
    const sessions = [...byBlock.values(), ...singles];
    sessions.sort((x, y) => x.time - y.time);
    return sessions;
}

export const cycleOrder: RuleContribution = {
    about: '진도를 맞추는 과목은 모든 반이 앞 차시를 한 뒤에 다음 차시로 넘어가게',
    id: 'cycle-order', label: '진도 맞춤', kind: 'hard', params: [],
    description: '진도 맞춤(순배)을 켠 수업은 같은 교사·학년·과목의 모든 반이 앞 차시를 시작한 뒤에야 다음 차시를 시작할 수 있습니다(차시 번호가 아니라 실제 시각 순서로 봅니다).',
    defaultMessage: '{반} 진도 맞춤 순서가 어긋났습니다',
    evaluate(_p, ctx) {
        const out: Violation[] = [];
        // (agentId, grade, activityId) 로 묶는다
        const groups = new Map<string, Map<string, Assignment[]>>(); // key -> trackId -> assignments
        for (const d of ctx.doc.demands) {
            if (!d.cycle) continue;
            const grade = ctx.tracks.get(d.trackId)?.grade;
            const key = `${d.agentId}|${grade}|${d.activityId}`;
            const g = groups.get(key) ?? groups.set(key, new Map()).get(key)!;
            const arr = g.get(d.trackId) ?? g.set(d.trackId, []).get(d.trackId)!;
            for (const a of ctx.byDemand(d.id)) arr.push(a);
        }
        for (const [, tracksMap] of groups) {
            const perTrack = [...tracksMap.entries()].map(([trackId, list]) => ({ trackId, sessions: sessionsOf(ctx, list) }));
            const maxOrd = Math.max(0, ...perTrack.map((t) => t.sessions.length));
            for (let k = 1; k < maxOrd; k++) {
                for (const T of perTrack) {
                    const sk = T.sessions[k];
                    if (!sk) continue;
                    let prevMax = -Infinity;
                    for (const U of perTrack) {
                        if (U.trackId === T.trackId) continue;
                        const sp = U.sessions[k - 1];
                        if (sp) prevMax = Math.max(prevMax, sp.time);
                    }
                    if (prevMax !== -Infinity && sk.time < prevMax) {
                        out.push(mkViol({
                            templateId: 'cycle-order', kind: 'hard',
                            message: this.defaultMessage, assignmentIds: sk.ids,
                            weight: 0, fixable: true, subject: trackRef(T.trackId),
                        }));
                    }
                }
            }
        }
        return out;
    },
};
