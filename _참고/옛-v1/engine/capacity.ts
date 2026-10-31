/**
 * checkCapacity — 자동 배정을 돌리기 전에 「구조적으로 못 푸는 시수표」를 잡는다 (v3).
 *   교사·특별실·반 각각에서 「필요한 시수」가 「들어갈 수 있는 칸 수」를 넘으면 어떤 방법으로도 필수 위반 0 이 안 된다.
 *   need > capacity 인 것만 돌려준다. 비어 있으면 통과.
 */
import type { Doc } from '../types/doc';
import type { CapacityIssue } from './api';
import { buildContext, hm } from './context';
import type { EngineContext } from './api';
import { isHomeroomAgent } from '../types/schema';

const agentRef = (id: string) => ({ kind: 'agent' as const, id });
const trackRef = (id: string) => ({ kind: 'track' as const, id });

/** 여러 반의 수업 슬롯을 요일×start 로 합집합한 칸들 (대표 trackId 를 함께 준다) */
function unionCells(ctx: EngineContext, trackIds: Iterable<string>):
    { day: number; startMin: number; endMin: number; trackId: string }[] {
    const seen = new Set<string>();
    const out: { day: number; startMin: number; endMin: number; trackId: string }[] = [];
    for (const tid of trackIds) {
        const spec = ctx.specOfTrack(tid);
        if (!spec) continue;
        for (const day of spec.activeDays) {
            for (const slot of ctx.lessonSlots(tid, day)) {
                const k = `${day}|${slot.start}`;
                if (seen.has(k)) continue;
                seen.add(k);
                out.push({ day, startMin: hm(slot.start), endMin: hm(slot.end), trackId: tid });
            }
        }
    }
    return out;
}

export function checkCapacity(doc: Doc): CapacityIssue[] {
    const ctx = buildContext(doc);
    const out: CapacityIssue[] = [];

    // ── 교사 (담임 제외 · 협력수업 둘째 교사로 든 시수도 그 교사에 합산)
    for (const ag of doc.agents) {
        if (isHomeroomAgent(ag.id)) continue;
        let need = 0;
        const tracks = new Set<string>();
        for (const d of doc.demands) {
            if (d.agentId !== ag.id && d.coAgentId !== ag.id) continue;
            need += d.count;
            tracks.add(d.trackId);
        }
        if (need === 0) continue;
        const cells = unionCells(ctx, tracks);
        let blocked = 0;
        for (const c of cells) {
            if (ctx.isBlocked(agentRef(ag.id), { dayIndex: c.day, startMin: c.startMin, endMin: c.endMin }, c.trackId)) blocked++;
        }
        const capacity = cells.length - blocked;
        if (need > capacity) {
            out.push({
                kind: 'agent', id: ag.id, name: ag.name, need, capacity,
                message: `${ag.name} 교사: 주 ${need}시간이 필요하지만 들어갈 수 있는 수업 칸은 ${capacity}개입니다. 담당 반을 나누거나 시수를 줄이세요.`,
            });
        }
    }

    // ── 특별실 — 「특별실 정원 초과」 규칙과 같은 눈으로 본다: 한 과목이 쓰는 특별실은 정원을 합쳐서(체육관+운동장) 판정한다.
    //    과목별로 (그 과목의 특별실 시수 합) vs (시각 칸 수 × 그 과목을 받는 특별실 정원 합).
    const byAct = new Map<string, { need: number; tracks: Set<string>; referenced: Set<string> }>();
    for (const d of doc.demands) {
        if (!d.resourceId) continue;
        const cur = byAct.get(d.activityId) ?? { need: 0, tracks: new Set<string>(), referenced: new Set<string>() };
        cur.need += d.roomHours ?? d.count;
        cur.tracks.add(d.trackId);
        cur.referenced.add(d.resourceId);
        byAct.set(d.activityId, cur);
    }
    for (const [actId, g] of byAct) {
        if (g.need === 0) continue;
        const pool = doc.resources.filter((r) =>
            !r.activityIds || r.activityIds.length === 0 || r.activityIds.includes(actId) || g.referenced.has(r.id));
        const pooledCap = Math.max(1, pool.reduce((s, r) => s + (r.capacity ?? 1), 0));
        const capacity = unionCells(ctx, g.tracks).length * pooledCap;
        if (g.need > capacity) {
            const first = pool.find((r) => g.referenced.has(r.id)) ?? pool[0];
            const names = pool.map((r) => r.name).join('·');
            const actName = ctx.activities.get(actId)?.name ?? '과목';
            out.push({
                kind: 'resource', id: first?.id ?? actId, name: names, need: g.need, capacity,
                message: `${names}(${actName}): 주 ${g.need}시간을 써야 하지만 수용 가능 칸은 ${capacity}개입니다. 수용 수를 올리거나 특별실을 추가하세요.`,
            });
        }
    }

    // ── 반 (그 반 수요 시수 합 + 고정 수업 칸 vs 주간 수업 칸 − 반 금지칸)
    const fixedByTrack = new Map<string, number>();
    for (const a of doc.assignments) {
        if (!a.fixed) continue;
        fixedByTrack.set(a.trackId, (fixedByTrack.get(a.trackId) ?? 0) + 1);
    }
    for (const t of doc.tracks) {
        let need = fixedByTrack.get(t.id) ?? 0;
        for (const d of doc.demands) if (d.trackId === t.id) need += d.count;
        if (need === 0) continue;
        const spec = ctx.specOfTrack(t.id);
        if (!spec) continue;
        let cells = 0, blocked = 0;
        for (const day of spec.activeDays) {
            for (const slot of ctx.lessonSlots(t.id, day)) {
                cells++;
                if (ctx.isBlocked(trackRef(t.id), { dayIndex: day, startMin: hm(slot.start), endMin: hm(slot.end) }, t.id)) blocked++;
            }
        }
        const capacity = cells - blocked;
        if (need > capacity) {
            out.push({
                kind: 'track', id: t.id, name: t.name, need, capacity,
                message: `${t.name}반: 주 ${need}시간을 넣어야 하지만 들어갈 수 있는 수업 칸은 ${capacity}개입니다. 고정 수업을 줄이거나 시수를 조정하세요.`,
            });
        }
    }

    return out;
}
