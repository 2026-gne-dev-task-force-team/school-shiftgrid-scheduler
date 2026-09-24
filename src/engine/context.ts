/**
 * 문맥(EngineContext) 만들기 — Doc 에서 조회표를 미리 계산해 둔다.
 * 규칙 evaluate 와 솔버가 여기서 나온 ctx 하나로 세계를 본다.
 */
import type { Doc } from '../types/doc';
import type {
    Agent, Track, Resource, Activity, Assignment, Demand, TimetableSpec, Slot,
    TargetRef, RuleBucket, WeeklyBlock,
} from '../types/schema';
import type { ClockRange, EngineContext } from './api';

/** "HH:mm" → 분 */
export function hm(s: string): number {
    const [h, m] = s.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}

/** 분 → "HH:mm" */
export function fmt(t: number): string {
    const h = Math.floor(t / 60);
    const m = t % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const cellKey = (trackId: string, day: number, slot: number) => `${trackId}|${day}|${slot}`;

export function buildContext(doc: Doc): EngineContext {
    const agents = new Map<string, Agent>(doc.agents.map((a) => [a.id, a]));
    const tracks = new Map<string, Track>(doc.tracks.map((t) => [t.id, t]));
    const resources = new Map<string, Resource>(doc.resources.map((r) => [r.id, r]));
    const activities = new Map<string, Activity>(doc.activities.map((a) => [a.id, a]));
    const specs = new Map<string, TimetableSpec>(doc.specs.map((s) => [s.id, s]));
    const demands = new Map<string, Demand>(doc.demands.map((d) => [d.id, d]));
    const assignments = new Map<string, Assignment>(doc.assignments.map((a) => [a.id, a]));

    const specOfTrack = (trackId: string): TimetableSpec | undefined => {
        const t = tracks.get(trackId);
        if (!t) return undefined;
        const sid = t.specId ?? (t.attr?.specId as string | undefined);
        return sid ? specs.get(sid) : undefined;
    };

    const lessonSlots = (trackId: string, dayIndex: number): Slot[] => {
        const spec = specOfTrack(trackId);
        if (!spec) return [];
        let ls = spec.slots.filter((s) => s.assignable && s.kind !== 'lunch');
        const n = spec.lessonsPerDay?.[dayIndex];
        if (n != null) ls = ls.slice(0, n);
        return ls;
    };

    const clockOf = (a: Assignment): ClockRange | undefined => {
        const spec = specOfTrack(a.trackId);
        if (!spec) return undefined;
        const s = spec.slots.find((x) => x.index === a.slotIndex);
        if (!s) return undefined;
        return { dayIndex: a.dayIndex, startMin: hm(s.start), endMin: hm(s.end) };
    };

    // 색인
    const byCellMap = new Map<string, Assignment[]>();
    const byAgentDayMap = new Map<string, Assignment[]>();
    const byResourceDayMap = new Map<string, Assignment[]>();
    const byDemandMap = new Map<string, Assignment[]>();
    const push = (m: Map<string, Assignment[]>, k: string, a: Assignment) => {
        const arr = m.get(k);
        if (arr) arr.push(a);
        else m.set(k, [a]);
    };
    for (const a of doc.assignments) {
        push(byCellMap, cellKey(a.trackId, a.dayIndex, a.slotIndex), a);
        if (a.agentId) push(byAgentDayMap, `${a.agentId}|${a.dayIndex}`, a);
        if (a.resourceId) push(byResourceDayMap, `${a.resourceId}|${a.dayIndex}`, a);
        if (a.demandId) push(byDemandMap, a.demandId, a);
    }
    // 교사 하루 배치는 시각순
    for (const arr of byAgentDayMap.values()) {
        arr.sort((a, b) => (clockOf(a)?.startMin ?? 0) - (clockOf(b)?.startMin ?? 0));
    }
    // 수요별 배치는 seq 순
    for (const arr of byDemandMap.values()) {
        arr.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    }

    const overlaps = (a: ClockRange, b: ClockRange): boolean =>
        a.dayIndex === b.dayIndex && a.startMin < b.endMin && b.startMin < a.endMin;

    const blockRange = (
        wb: WeeklyBlock, trackId: string | undefined, target: TargetRef,
    ): { startMin: number; endMin: number } | undefined => {
        if (wb.slotIndex != null) {
            const tid = trackId ?? (target.kind === 'track' ? target.id : undefined);
            const spec = tid ? specOfTrack(tid) : undefined;
            const slot = spec?.slots.find((s) => s.index === wb.slotIndex);
            if (!slot) return undefined;
            return { startMin: hm(slot.start), endMin: hm(slot.end) };
        }
        if (wb.from) return { startMin: hm(wb.from), endMin: wb.to ? hm(wb.to) : 24 * 60 };
        return { startMin: 0, endMin: 24 * 60 }; // 종일
    };

    const isBlocked = (target: TargetRef, clock: ClockRange, trackId?: string): boolean => {
        for (const wb of doc.weeklyBlocks) {
            if (wb.soft) continue; // 하드 금지칸만
            if (wb.dayIndex !== clock.dayIndex) continue;
            if (wb.targets.length > 0 &&
                !wb.targets.some((t) => t.kind === target.kind && t.id === target.id)) continue;
            const r = blockRange(wb, trackId, target);
            if (!r) continue;
            if (clock.startMin < r.endMin && r.startMin < clock.endMin) return true;
        }
        return false;
    };

    const tierWeight = (agentId: string): number => {
        const t = agents.get(agentId)?.tier;
        return t === 1 ? 3 : t === 2 ? 2 : 1;
    };

    const bucketWeight = (bucket: RuleBucket | undefined): number =>
        bucket === 'essential' ? 100 : bucket === 'important' ? 20 : bucket === 'preferred' ? 3 : 1;

    return {
        doc, agents, tracks, resources, activities, specs, demands, assignments,
        specOfTrack, lessonSlots, clockOf,
        byCell: (trackId, day, slot) => byCellMap.get(cellKey(trackId, day, slot)) ?? [],
        byAgentDay: (agentId, day) => byAgentDayMap.get(`${agentId}|${day}`) ?? [],
        byResourceDay: (resourceId, day) => byResourceDayMap.get(`${resourceId}|${day}`) ?? [],
        byDemand: (demandId) => byDemandMap.get(demandId) ?? [],
        overlaps, isBlocked, tierWeight, bucketWeight,
    };
}
