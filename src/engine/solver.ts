/**
 * 자동 배정 — 구성적 초기화 → min-conflicts(하드 0) → 소프트 힐클라이밍.
 * seed 로 재현 가능(자체 PRNG, Math.random 안 씀). Worker 가 있으면 Worker 에서 돈다.
 */
import type { Doc } from '../types/doc';
import type { Assignment, TimetableSpec } from '../types/schema';
import type {
    EngineContext, SolveOptions, SolveProgress, SolveResult, SolveCandidate,
} from './api';
import { buildContext, hm } from './context';
import { evaluateAll } from './evaluate';

// ──────────────────────────────── PRNG (mulberry32)
function makePRNG(seed: number) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const pick = <T>(rng: () => number, arr: T[]): T => arr[Math.floor(rng() * arr.length) % arr.length];

// ──────────────────────────────── 전략 포트폴리오
interface Strategy { label: string; strategy: string; mul: Record<string, number>; }
const STRATEGIES: Strategy[] = [
    { label: '균형형', strategy: 'balanced', mul: {} },
    { label: '부장 보호형', strategy: 'protect', mul: { avoid: 3, 'priority-early': 3 } },
    { label: '연강·붙이기형', strategy: 'adjacent', mul: { 'subject-adjacent': 3, 'prefer-consecutive': 2 } },
    { label: '공강 압축형', strategy: 'compact', mul: { 'compact-day': 3, 'lunch-adjacent': 2 } },
];

interface Cell { day: number; slots: number[]; }
interface Var {
    baseId: string;
    demandId: string;
    agentId?: string;
    trackId: string;
    activityId?: string;
    resourceId?: string;
    span: number;
    blockId?: string;
    seq: number;
    cellIds: string[];      // 칸마다 붙일 assignment id
    domain: Cell[];
    initial?: Cell;
    reserved?: { s: number; e: number }; // 이 교사의 식사 확보용 예약 점심 시각(분)
}

const ck = (t: string, d: number, s: number) => `${t}|${d}|${s}`;

function timetableOfTrack(doc: Doc, ctx: EngineContext): (trackId: string) => string {
    const bySpec = new Map<string, string>();
    for (const tt of doc.timetables) if (!bySpec.has(tt.specId)) bySpec.set(tt.specId, tt.id);
    return (trackId: string) => {
        const spec = ctx.specOfTrack(trackId);
        return (spec && bySpec.get(spec.id)) || doc.timetables[0]?.id || '';
    };
}

function computeDomain(ctx: EngineContext, v: { trackId: string; agentId?: string; resourceId?: string; span: number; reserved?: { s: number; e: number } }, keptOccupied: Set<string>, spec: TimetableSpec | undefined): Cell[] {
    const out: Cell[] = [];
    if (!spec) return out;
    const days = spec.activeDays ?? [0, 1, 2, 3, 4];
    const trackRef = { kind: 'track' as const, id: v.trackId };
    const agentRef = v.agentId ? { kind: 'agent' as const, id: v.agentId } : undefined;
    const resRef = v.resourceId ? { kind: 'resource' as const, id: v.resourceId } : undefined;
    const freeCell = (day: number, idx: number): boolean => {
        if (keptOccupied.has(ck(v.trackId, day, idx))) return false;
        const slot = spec.slots.find((s) => s.index === idx);
        if (!slot) return false;
        const clock = { dayIndex: day, startMin: hm(slot.start), endMin: hm(slot.end) };
        // 예약 점심 시각과 겹치면 뺀다 → 교사 식사 슬롯을 구성 단계에서 비워 둔다
        if (v.reserved && clock.startMin < v.reserved.e && v.reserved.s < clock.endMin) return false;
        if (ctx.isBlocked(trackRef, clock, v.trackId)) return false;
        if (agentRef && ctx.isBlocked(agentRef, clock, v.trackId)) return false;
        if (resRef && ctx.isBlocked(resRef, clock, v.trackId)) return false;
        return true;
    };
    for (const day of days) {
        const ls = ctx.lessonSlots(v.trackId, day);
        for (let i = 0; i < ls.length; i++) {
            if (v.span === 1) {
                if (freeCell(day, ls[i].index)) out.push({ day, slots: [ls[i].index] });
            } else {
                if (i + v.span - 1 >= ls.length) continue;
                const slots: number[] = [];
                let ok = true;
                for (let k = 0; k < v.span; k++) {
                    const idx = ls[i + k].index;
                    if (k > 0 && idx !== ls[i + k - 1].index + 1) { ok = false; break; }
                    if (!freeCell(day, idx)) { ok = false; break; }
                    slots.push(idx);
                }
                if (ok) out.push({ day, slots });
            }
        }
    }
    return out;
}

/** 학년의 점심 시각(분) — 대표 반의 규격에서 */
function lunchWindowOfGrade(ctx: EngineContext, grade: number): { s: number; e: number } | undefined {
    for (const t of ctx.doc.tracks) {
        if (t.grade !== grade) continue;
        const lunch = ctx.specOfTrack(t.id)?.slots.find((s) => s.kind === 'lunch');
        if (lunch) return { s: hm(lunch.start), e: hm(lunch.end) };
    }
    return undefined;
}

/** 학년별 주간 수업 시각(분) 목록 — 규격에서 */
function gradeClockList(ctx: EngineContext): Map<number, { key: string; s: number; e: number }[]> {
    const m = new Map<number, { key: string; s: number; e: number }[]>();
    for (const t of ctx.doc.tracks) {
        if (t.grade == null || m.has(t.grade)) continue;
        const sp = ctx.specOfTrack(t.id); if (!sp) continue;
        const arr: { key: string; s: number; e: number }[] = [];
        for (const d of sp.activeDays) for (const sl of sp.slots) if (sl.assignable && sl.kind !== 'lunch') arr.push({ key: `${d}|${sl.start}`, s: hm(sl.start), e: hm(sl.end) });
        m.set(t.grade, arr);
    }
    return m;
}

/**
 * 전담별 「예약 점심 시각」 — 가르치는 학년 중 가장 낮은 학년(≤4)의 점심을 잡는다.
 * 구성 단계에서 이 시각을 도메인에서 빼면 식사 슬롯이 늘 비어 agent-lunch-free 가 0이 된다.
 * 🔴 단 예약해서 그 교사의 남는 칸이 시수보다 적어지면(과부하 전담) 예약을 걸지 않는다
 *    — 안 그러면 식사 확보하려다 교사 겹침을 강제로 만든다(오히려 손해).
 */
function computeReservations(doc: Doc, ctx: EngineContext): Map<string, { s: number; e: number }> {
    const res = new Map<string, { s: number; e: number }>();
    const gradeClocks = gradeClockList(ctx);
    for (const ag of doc.agents) {
        if (ag.role === '담임') continue;
        const grades = new Set<number>(); let load = 0; let low: number | undefined;
        for (const d of doc.demands) {
            if (d.agentId !== ag.id) continue;
            load += d.count;
            const g = ctx.tracks.get(d.trackId)?.grade;
            if (g != null) { grades.add(g); if (g <= 4) low = low == null ? g : Math.min(low, g); }
        }
        if (low == null) continue;
        const lw = lunchWindowOfGrade(ctx, low); if (!lw) continue;
        const avail = new Map<string, { s: number; e: number }>();
        for (const g of grades) for (const c of gradeClocks.get(g) ?? []) avail.set(c.key, c);
        let removed = 0; for (const [, c] of avail) if (c.s < lw.e && lw.s < c.e) removed++;
        if (avail.size - removed >= load) res.set(ag.id, lw); // 예약해도 배치 가능할 때만
    }
    return res;
}

// ──────────────────────────────── 변수 만들기
function buildVars(doc: Doc, ctx: EngineContext, opts: SolveOptions, keepPinned: boolean): { vars: Var[]; kept: Assignment[] } {
    const kept = doc.assignments.filter((a) => a.fixed || (keepPinned && a.pinned));
    const keptOccupied = new Set(kept.map((a) => ck(a.trackId, a.dayIndex, a.slotIndex)));
    const reservations = computeReservations(doc, ctx);

    if (opts.adjustOnly) {
        // 현재 배치를 변수로. pinned/fixed 는 kept 로 고정
        const movable = doc.assignments.filter((a) => !a.fixed && !(keepPinned && a.pinned));
        const byBlock = new Map<string, Assignment[]>();
        const singles: Assignment[] = [];
        for (const a of movable) {
            if (a.blockId) (byBlock.get(a.blockId) ?? byBlock.set(a.blockId, []).get(a.blockId)!).push(a);
            else singles.push(a);
        }
        const vars: Var[] = [];
        const mk = (base: string, group: Assignment[]): Var => {
            const g = [...group].sort((x, y) => x.slotIndex - y.slotIndex);
            const a0 = g[0];
            const spec = ctx.specOfTrack(a0.trackId);
            const v: Var = {
                baseId: base, demandId: a0.demandId ?? '', agentId: a0.agentId, trackId: a0.trackId,
                activityId: a0.activityId, resourceId: a0.resourceId, span: g.length, blockId: a0.blockId,
                seq: a0.seq ?? 1, cellIds: g.map((x) => x.id),
                domain: [], initial: { day: a0.dayIndex, slots: g.map((x) => x.slotIndex) },
                reserved: a0.agentId ? reservations.get(a0.agentId) : undefined,
            };
            v.domain = computeDomain(ctx, v, keptOccupied, spec);
            // 현재 자리도 도메인에 포함되게
            if (!v.domain.some((c) => c.day === v.initial!.day && c.slots[0] === v.initial!.slots[0])) v.domain.push(v.initial!);
            return v;
        };
        for (const [bid, group] of byBlock) vars.push(mk(bid, group));
        for (const a of singles) vars.push(mk(a.id, [a]));
        return { vars, kept };
    }

    // 새로 배정: 수요를 펼친다
    const vars: Var[] = [];
    for (const d of doc.demands) {
        const keptCount = kept.filter((a) => a.demandId === d.id).length;
        let remaining = d.count - keptCount;
        if (remaining <= 0) continue;
        const spec = ctx.specOfTrack(d.trackId);
        const effRoom = d.resourceId ? (d.roomHours ?? d.count) : 0;
        let roomUsed = keptCount; // 대략
        let seq = keptCount + 1;
        const blocks = (d.block ?? []).filter((b) => b >= 2);
        const makeVar = (span: number) => {
            const useRoom = d.resourceId && roomUsed < effRoom;
            const v: Var = {
                baseId: `${d.id}#${seq}`, demandId: d.id, agentId: d.agentId, trackId: d.trackId,
                activityId: d.activityId, resourceId: useRoom ? d.resourceId : undefined, span,
                blockId: span > 1 ? `blk-${d.id}-${seq}` : undefined, seq,
                cellIds: Array.from({ length: span }, (_, k) => `${d.id}#${seq}${span > 1 ? `-${k}` : ''}`),
                domain: [], reserved: reservations.get(d.agentId),
            };
            v.domain = computeDomain(ctx, v, keptOccupied, spec);
            vars.push(v);
            roomUsed += span;
            seq += span;
            remaining -= span;
        };
        for (const b of blocks) if (remaining >= b) makeVar(b);
        while (remaining >= 1) makeVar(1);
    }
    return { vars, kept };
}

// ──────────────────────────────── 배치 생성 + 하드 충돌
function buildAssignments(vars: Var[], state: (Cell | undefined)[], kept: Assignment[], ttOf: (t: string) => string): { list: Assignment[]; owners: number[] } {
    const list: Assignment[] = [...kept];
    const owners: number[] = kept.map(() => -1);
    for (let vi = 0; vi < vars.length; vi++) {
        const v = vars[vi];
        const cell = state[vi];
        if (!cell) continue;
        for (let k = 0; k < v.span; k++) {
            list.push({
                kind: 'work', id: v.cellIds[k], timetableId: ttOf(v.trackId), trackId: v.trackId,
                dayIndex: cell.day, slotIndex: cell.slots[k], agentId: v.agentId, activityId: v.activityId,
                resourceId: v.resourceId, demandId: v.demandId, seq: v.seq, blockId: v.blockId,
            });
            owners.push(vi);
        }
    }
    return { list, owners };
}

interface Sess { time: number; ids: string[]; }
/** 세션(연강 blockId 는 1세션) — 시각순 */
function sessionsOfList(ctx: EngineContext, list: Assignment[]): Sess[] {
    const byBlock = new Map<string, Sess>();
    const singles: Sess[] = [];
    for (const a of list) {
        const c = ctx.clockOf(a);
        const t = c ? c.dayIndex * 100000 + c.startMin : 0;
        if (a.blockId) {
            const s = byBlock.get(a.blockId);
            if (s) { s.time = Math.min(s.time, t); s.ids.push(a.id); } else byBlock.set(a.blockId, { time: t, ids: [a.id] });
        } else singles.push({ time: t, ids: [a.id] });
    }
    return [...byBlock.values(), ...singles].sort((x, y) => x.time - y.time);
}

/** 학년의 점심 시각 구간들 */
function gradeLunchesLocal(ctx: EngineContext, grade: number): { s: number; e: number }[] {
    for (const t of ctx.doc.tracks) {
        if (t.grade !== grade) continue;
        const sp = ctx.specOfTrack(t.id);
        if (sp) return sp.slots.filter((x) => x.kind === 'lunch').map((x) => ({ s: hm(x.start), e: hm(x.end) }));
    }
    return [];
}

function ownerMapOf(list: Assignment[], owners: number[]): Map<string, number> {
    const m = new Map<string, number>();
    for (let i = 0; i < list.length; i++) m.set(list[i].id, owners[i]);
    return m;
}

/** doc.rules 에서 켜진 하드 규칙 templateId 집합 */
const HARD_IDS = ['no-overlap-track', 'no-overlap-agent', 'no-overlap-resource', 'blocked-cell', 'demand-count', 'block-contiguous', 'cycle-order', 'agent-lunch-free'];
function enabledHard(doc: Doc): Set<string> {
    const on = new Set(doc.rules.filter((r) => r.enabled).map((r) => r.templateId));
    return new Set(HARD_IDS.filter((id) => on.has(id)));
}

/**
 * 종합 하드 스캔 — 켜진 하드 규칙 전부를 한 번에 세고, 변수별 위반 참여 수를 돌려준다.
 * ctx 는 doc 으로 한 번만 만든 정적 문맥(specOfTrack·clockOf·isBlocked 는 배치에 안 기댄다).
 * total===0 이면 evaluateAll 의 하드도 0 이다.
 */
function hardScan(ctx: EngineContext, doc: Doc, list: Assignment[], ownerById: Map<string, number>, nVars: number, on: Set<string>): { total: number; perVar: Int32Array } {
    const perVar = new Int32Array(nVars);
    let total = 0;
    const bump = (id: string) => { const o = ownerById.get(id); if (o != null && o >= 0) perVar[o]++; };
    const clocks = list.map((a) => ctx.clockOf(a));

    if (on.has('no-overlap-track')) {
        const m = new Map<string, number[]>();
        for (let i = 0; i < list.length; i++) { const a = list[i]; const k = ck(a.trackId, a.dayIndex, a.slotIndex); (m.get(k) ?? m.set(k, []).get(k)!).push(i); }
        for (const idxs of m.values()) if (idxs.length > 1) { total += idxs.length - 1; for (const i of idxs) bump(list[i].id); }
    }
    if (on.has('no-overlap-agent')) {
        const byAgent = new Map<string, number[]>();
        for (let i = 0; i < list.length; i++) { const a = list[i]; if (!a.agentId) continue; (byAgent.get(a.agentId) ?? byAgent.set(a.agentId, []).get(a.agentId)!).push(i); }
        for (const idxs of byAgent.values()) {
            for (let x = 0; x < idxs.length; x++) for (let y = x + 1; y < idxs.length; y++) {
                const A = list[idxs[x]], B = list[idxs[y]], ca = clocks[idxs[x]], cb = clocks[idxs[y]];
                if (!ca || !cb) continue;
                if (A.trackId === B.trackId && A.slotIndex === B.slotIndex && A.dayIndex === B.dayIndex) continue;
                if (ctx.overlaps(ca, cb)) { total++; bump(A.id); bump(B.id); }
            }
        }
    }
    if (on.has('no-overlap-resource')) {
        const byAct = new Map<string, number[]>();
        for (let i = 0; i < list.length; i++) { const a = list[i]; if (!a.resourceId || !a.activityId) continue; (byAct.get(a.activityId) ?? byAct.set(a.activityId, []).get(a.activityId)!).push(i); }
        for (const [actId, idxs] of byAct) {
            const referenced = new Set(idxs.map((i) => list[i].resourceId!));
            let cap = 0;
            for (const r of ctx.doc.resources) { const serves = !r.activityIds || r.activityIds.length === 0 || r.activityIds.includes(actId); if (serves || referenced.has(r.id)) cap += r.capacity ?? 1; }
            if (cap <= 0) cap = 1;
            for (const i of idxs) {
                const ca = clocks[i]; if (!ca) continue;
                let sim = 0; for (const j of idxs) { const cb = clocks[j]; if (cb && ctx.overlaps(ca, cb)) sim++; }
                if (sim > cap) { total++; bump(list[i].id); }
            }
        }
    }
    if (on.has('blocked-cell')) {
        for (let i = 0; i < list.length; i++) {
            const a = list[i]; if (a.fixed) continue; const c = clocks[i]; if (!c) continue;
            const hit = ctx.isBlocked({ kind: 'track', id: a.trackId }, c, a.trackId)
                || (!!a.agentId && ctx.isBlocked({ kind: 'agent', id: a.agentId }, c, a.trackId))
                || (!!a.resourceId && ctx.isBlocked({ kind: 'resource', id: a.resourceId }, c, a.trackId));
            if (hit) { total++; bump(a.id); }
        }
    }
    if (on.has('block-contiguous')) {
        const byBlock = new Map<string, number[]>();
        for (let i = 0; i < list.length; i++) { const a = list[i]; if (!a.blockId) continue; (byBlock.get(a.blockId) ?? byBlock.set(a.blockId, []).get(a.blockId)!).push(i); }
        for (const idxs of byBlock.values()) {
            if (idxs.length < 2) continue;
            const f = list[idxs[0]];
            let bad = !idxs.every((i) => list[i].trackId === f.trackId) || !idxs.every((i) => list[i].dayIndex === f.dayIndex);
            if (!bad) {
                const s = idxs.map((i) => list[i].slotIndex).sort((x, y) => x - y);
                if (s[s.length - 1] - s[0] !== s.length - 1 || new Set(s).size !== s.length) bad = true;
                else { const sp = ctx.specOfTrack(f.trackId); if (sp) for (let k = s[0]; k <= s[s.length - 1]; k++) if (sp.slots.find((x) => x.index === k)?.kind === 'lunch') { bad = true; break; } }
            }
            if (bad) { total++; for (const i of idxs) bump(list[i].id); }
        }
    }
    if (on.has('cycle-order')) {
        const byDemandList = new Map<string, Assignment[]>();
        for (const a of list) if (a.demandId) (byDemandList.get(a.demandId) ?? byDemandList.set(a.demandId, []).get(a.demandId)!).push(a);
        const groups = new Map<string, Map<string, Assignment[]>>();
        for (const d of doc.demands) {
            if (!d.cycle) continue;
            const grade = ctx.tracks.get(d.trackId)?.grade;
            const key = `${d.agentId}|${grade}|${d.activityId}`;
            const g = groups.get(key) ?? groups.set(key, new Map()).get(key)!;
            const arr = g.get(d.trackId) ?? g.set(d.trackId, []).get(d.trackId)!;
            for (const a of byDemandList.get(d.id) ?? []) arr.push(a);
        }
        for (const [, tracksMap] of groups) {
            const perTrack = [...tracksMap.entries()].map(([tid, l]) => ({ tid, sessions: sessionsOfList(ctx, l) }));
            const maxOrd = Math.max(0, ...perTrack.map((t) => t.sessions.length));
            for (let k = 1; k < maxOrd; k++) for (const T of perTrack) {
                const sk = T.sessions[k]; if (!sk) continue;
                let prevMax = -Infinity;
                for (const U of perTrack) { if (U.tid === T.tid) continue; const sp = U.sessions[k - 1]; if (sp) prevMax = Math.max(prevMax, sp.time); }
                if (prevMax !== -Infinity && sk.time < prevMax) { total++; for (const id of sk.ids) bump(id); }
            }
        }
    }
    if (on.has('agent-lunch-free')) {
        const byAD = new Map<string, Assignment[]>();
        for (const a of list) { if (!a.agentId) continue; const ag = ctx.agents.get(a.agentId); if (!ag || ag.role === '담임') continue; const k = `${a.agentId}|${a.dayIndex}`; (byAD.get(k) ?? byAD.set(k, []).get(k)!).push(a); }
        for (const [, l] of byAD) {
            const grades = new Set<number>(); for (const a of l) { const g = ctx.tracks.get(a.trackId)?.grade; if (g != null) grades.add(g); }
            const lunches: { s: number; e: number }[] = []; for (const g of grades) lunches.push(...gradeLunchesLocal(ctx, g));
            if (lunches.length === 0) continue;
            const cs = l.map((a) => ctx.clockOf(a)).filter((c): c is NonNullable<typeof c> => !!c);
            const free = lunches.some((L) => !cs.some((c) => c.startMin < L.e && L.s < c.endMin));
            if (!free) { total++; for (const a of l) bump(a.id); }
        }
    }
    if (on.has('demand-count')) {
        const cnt = new Map<string, number>(); const ids = new Map<string, string[]>();
        for (const a of list) if (a.demandId) { cnt.set(a.demandId, (cnt.get(a.demandId) ?? 0) + 1); (ids.get(a.demandId) ?? ids.set(a.demandId, []).get(a.demandId)!).push(a.id); }
        for (const d of doc.demands) { const placed = cnt.get(d.id) ?? 0; if (placed !== d.count) { total++; for (const id of ids.get(d.id) ?? []) bump(id); } }
    }
    return { total, perVar };
}

/** prng 로 배열에서 n 개를 뽑는다(중복 없이) */
function sampleN<T>(rng: () => number, arr: T[], n: number): T[] {
    if (arr.length <= n) return arr;
    const copy = arr.slice();
    for (let i = 0; i < n; i++) { const j = i + Math.floor(rng() * (copy.length - i)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
    return copy.slice(0, n);
}

// ──────────────────────────────── 소프트 점수
function scoreOf(doc: Doc, list: Assignment[], mul: Record<string, number>): { hard: number; soft: number; weighted: number } {
    const viols = evaluateAll({ ...doc, assignments: list });
    let hard = 0, soft = 0, weighted = 0;
    for (const v of viols) {
        if (v.kind === 'hard') hard++;
        else { soft += v.weight; weighted += v.weight * (mul[v.templateId] ?? 1); }
    }
    return { hard, soft, weighted };
}

// ──────────────────────────────── 한 후보 풀기
function solveCandidate(doc: Doc, ctx: EngineContext, vars: Var[], kept: Assignment[], ttOf: (t: string) => string, strat: Strategy, seed: number, budgetMs: number): SolveCandidate {
    const rng = makePRNG(seed);
    const t0 = Date.now();
    const state: (Cell | undefined)[] = vars.map((v) => v.initial);

    // 구성적 초기화 — 도메인 작은 것부터, 특별실 쓰는 것부터(fail-first).
    // 놓을 때 반 셀·교사 시각·특별실 정원이 모두 안 겹치는 첫 자리를 고른다(놓자마자 하드가 거의 0).
    const order = vars.map((_, i) => i).sort((a, b) => {
        const ra = vars[a].resourceId ? 0 : 1, rb = vars[b].resourceId ? 0 : 1;
        if (ra !== rb) return ra - rb;
        return vars[a].domain.length - vars[b].domain.length;
    });
    const occ = new Set<string>();
    const agentBusy = new Map<string, { d: number; s: number; e: number }[]>();
    const resBusy = new Map<string, { d: number; s: number; e: number }[]>(); // key = activityId (과목별 합산)
    const capCache = new Map<string, number>();
    const capOf = (actId: string): number => {
        let c = capCache.get(actId);
        if (c == null) { c = 0; for (const r of ctx.doc.resources) if (!r.activityIds || !r.activityIds.length || r.activityIds.includes(actId)) c += r.capacity ?? 1; if (c <= 0) c = 1; capCache.set(actId, c); }
        return c;
    };
    const slotTime = (trackId: string, day: number, idx: number) => {
        const slot = ctx.specOfTrack(trackId)?.slots.find((x) => x.index === idx);
        return slot ? { d: day, s: hm(slot.start), e: hm(slot.end) } : undefined;
    };
    const trackFree = (trackId: string, cell: Cell) => cell.slots.every((s) => !occ.has(ck(trackId, cell.day, s)));
    const agentFree = (v: Var, cell: Cell): boolean => {
        if (!v.agentId) return true;
        const busy = agentBusy.get(v.agentId); if (!busy) return true;
        for (const s of cell.slots) { const t = slotTime(v.trackId, cell.day, s); if (t && busy.some((b) => b.d === t.d && b.s < t.e && t.s < b.e)) return false; }
        return true;
    };
    const resFree = (v: Var, cell: Cell): boolean => {
        if (!v.resourceId || !v.activityId) return true;
        const busy = resBusy.get(v.activityId); if (!busy) return true;
        const cap = capOf(v.activityId);
        for (const s of cell.slots) { const t = slotTime(v.trackId, cell.day, s); if (!t) continue; let sim = 0; for (const b of busy) if (b.d === t.d && b.s < t.e && t.s < b.e) sim++; if (sim >= cap) return false; }
        return true;
    };
    const register = (v: { agentId?: string; trackId: string; resourceId?: string; activityId?: string }, cell: Cell) => {
        for (const s of cell.slots) {
            occ.add(ck(v.trackId, cell.day, s));
            const t = slotTime(v.trackId, cell.day, s); if (!t) continue;
            if (v.agentId) (agentBusy.get(v.agentId) ?? agentBusy.set(v.agentId, []).get(v.agentId)!).push(t);
            if (v.resourceId && v.activityId) (resBusy.get(v.activityId) ?? resBusy.set(v.activityId, []).get(v.activityId)!).push(t);
        }
    };
    for (const a of kept) register(a, { day: a.dayIndex, slots: [a.slotIndex] });
    for (let i = 0; i < vars.length; i++) { const c = state[i]; if (c) register(vars[i], c); }
    for (const vi of order) {
        const v = vars[vi];
        if (v.domain.length === 0) { state[vi] = undefined; continue; }
        if (state[vi]) continue; // 조정 모드: 이미 현재 자리가 있다
        let chosen = v.domain.find((c) => trackFree(v.trackId, c) && agentFree(v, c) && resFree(v, c))
            ?? v.domain.find((c) => trackFree(v.trackId, c) && agentFree(v, c))
            ?? v.domain.find((c) => trackFree(v.trackId, c))
            ?? v.domain[0];
        state[vi] = chosen;
        register(v, chosen);
    }

    // min-conflicts (하드) — 증분 지역 충돌(반 셀·교사 시각·특별실 시각)로 칸을 빠르게 고르고,
    // 종합 하드 스캔(순배·식사 포함)으로는 「지금까지 최선」만 주기적으로 갱신한다.
    const on = enabledHard(doc);
    const cellCnt = new Map<string, number>();
    const agentIv = new Map<string, { s: number; e: number; track: string; slot: number }[]>();
    const resIv = new Map<string, { s: number; e: number }[]>();
    type Placeable = { agentId?: string; trackId: string; resourceId?: string; activityId?: string };
    const place = (v: Placeable, cell: Cell, delta: number) => {
        for (const s of cell.slots) {
            const key = ck(v.trackId, cell.day, s);
            cellCnt.set(key, (cellCnt.get(key) ?? 0) + delta);
            const t = slotTime(v.trackId, cell.day, s); if (!t) continue;
            if (v.agentId) {
                const k = `${v.agentId}|${cell.day}`; const arr = agentIv.get(k) ?? agentIv.set(k, []).get(k)!;
                if (delta > 0) arr.push({ s: t.s, e: t.e, track: v.trackId, slot: s });
                else { const i = arr.findIndex((x) => x.s === t.s && x.e === t.e && x.track === v.trackId && x.slot === s); if (i >= 0) arr.splice(i, 1); }
            }
            if (v.resourceId && v.activityId) {
                const k = `${v.activityId}|${cell.day}`; const arr = resIv.get(k) ?? resIv.set(k, []).get(k)!;
                if (delta > 0) arr.push({ s: t.s, e: t.e });
                else { const i = arr.findIndex((x) => x.s === t.s && x.e === t.e); if (i >= 0) arr.splice(i, 1); }
            }
        }
    };
    // 지역 비용 = 반 셀 겹침 + 교사 시각 겹침 + 특별실 정원 초과.
    // (식사 확보는 구성 단계 예약으로 다룬다. 과부하 전담은 예약을 못 걸어 식사가 구조적으로 깨지지만,
    //  그건 교사 겹침(물리적 불가능)보다 덜 나쁘므로 여기서 겹침을 최소화한다.)
    const localCost = (v: Var, cell: Cell): number => { // v 는 구조에서 빠져 있다고 가정
        let c = 0;
        for (const s of cell.slots) {
            c += cellCnt.get(ck(v.trackId, cell.day, s)) ?? 0;
            const t = slotTime(v.trackId, cell.day, s); if (!t) continue;
            if (v.agentId) for (const iv of agentIv.get(`${v.agentId}|${cell.day}`) ?? []) if (iv.s < t.e && t.s < iv.e) { if (iv.track === v.trackId && iv.slot === s) continue; c++; }
            if (v.resourceId && v.activityId) { const cap = capOf(v.activityId); let sim = 0; for (const iv of resIv.get(`${v.activityId}|${cell.day}`) ?? []) if (iv.s < t.e && t.s < iv.e) sim++; if (sim >= cap) c += sim - cap + 1; }
        }
        return c;
    };
    for (const a of kept) place(a, { day: a.dayIndex, slots: [a.slotIndex] }, 1);
    for (let i = 0; i < vars.length; i++) { const c = state[i]; if (c) place(vars[i], c, 1); }

    const fullScan = () => { const { list, owners } = buildAssignments(vars, state, kept, ttOf); return hardScan(ctx, doc, list, ownerMapOf(list, owners), vars.length, on); };
    const hardCap = budgetMs * 0.85;
    let bestState = state.slice();
    let bestTotal = fullScan().total;
    if (bestTotal > 0) {
        const movable = vars.map((_, i) => i).filter((i) => vars[i].domain.length > 1);
        let conflicted: number[] = movable;
        let refresh = 0;
        const maxIters = Math.min(400000, 6000 + vars.length * 1500);
        for (let it = 0; it < maxIters; it++) {
            if (refresh <= 0) {
                const r = fullScan();
                if (r.total < bestTotal) { bestTotal = r.total; bestState = state.slice(); }
                if (r.total === 0) break;
                if (Date.now() - t0 > hardCap) break;
                conflicted = movable.filter((i) => r.perVar[i] > 0);
                if (conflicted.length === 0) break;
                refresh = 48;
            }
            refresh--;
            const vi = pick(rng, conflicted);
            const v = vars[vi];
            const old = state[vi]!;
            place(v, old, -1);
            let bestCell = old; let bestC = localCost(v, old);
            const cells = v.domain.length > 16 ? sampleN(rng, v.domain, 16) : v.domain;
            for (const c of cells) { const lc = localCost(v, c); if (lc < bestC || (lc === bestC && rng() < 0.2)) { bestC = lc; bestCell = c; if (lc === 0) break; } }
            state[vi] = bestCell;
            place(v, bestCell, 1);
        }
        const rf = fullScan(); if (rf.total < bestTotal) { bestTotal = rf.total; bestState = state.slice(); }
    }
    for (let i = 0; i < state.length; i++) state[i] = bestState[i];

    // 소프트 힐클라이밍
    const softIters = Math.min(20000, 400 + vars.length * 80);
    let curScore = scoreOf(doc, buildAssignments(vars, state, kept, ttOf).list, strat.mul);
    let curKey = curScore.hard * 1000 + curScore.weighted;
    const movable = vars.map((_, i) => i).filter((i) => vars[i].domain.length > 1);
    if (movable.length > 0) {
        for (let it = 0; it < softIters; it++) {
            if ((it & 7) === 0 && Date.now() - t0 > budgetMs) break;
            const vi = pick(rng, movable);
            const old = state[vi];
            const c = pick(rng, vars[vi].domain);
            if (old && c.day === old.day && c.slots[0] === old.slots[0]) continue;
            state[vi] = c;
            const sc = scoreOf(doc, buildAssignments(vars, state, kept, ttOf).list, strat.mul);
            const key = sc.hard * 1000 + sc.weighted;
            if (key <= curKey) { curKey = key; curScore = sc; }
            else state[vi] = old; // 되돌림 (탐욕)
        }
    }

    const { list } = buildAssignments(vars, state, kept, ttOf);
    const plain = scoreOf(doc, list, {});
    // 미배정
    const placedByDemand = new Map<string, number>();
    for (const a of list) if (a.demandId) placedByDemand.set(a.demandId, (placedByDemand.get(a.demandId) ?? 0) + 1);
    const unplaced: { demandId: string; missing: number }[] = [];
    for (const d of doc.demands) {
        const missing = d.count - (placedByDemand.get(d.id) ?? 0);
        if (missing > 0) unplaced.push({ demandId: d.id, missing });
    }
    return { label: strat.label, strategy: strat.strategy, hard: plain.hard, soft: plain.soft, assignments: list, unplaced };
}

// ──────────────────────────────── 동기 솔버
export function solveSync(doc: Doc, opts: SolveOptions = {}, onProgress?: (p: SolveProgress) => void): SolveResult {
    const t0 = Date.now();
    const ctx = buildContext(doc);
    const keepPinned = opts.keepPinned !== false;
    const { vars, kept } = buildVars(doc, ctx, opts, keepPinned);
    const ttOf = timetableOfTrack(doc, ctx);
    const nCand = Math.max(1, opts.candidates ?? 4);
    const budgetMs = opts.budgetMs ?? 2000;
    const baseSeed = opts.seed ?? 12345;

    const candidates: SolveCandidate[] = [];
    for (let i = 0; i < nCand; i++) {
        const strat = opts.strategy
            ? (STRATEGIES.find((s) => s.strategy === opts.strategy) ?? STRATEGIES[0])
            : STRATEGIES[i % STRATEGIES.length];
        const cand = solveCandidate(doc, ctx, vars, kept, ttOf, strat, baseSeed + i * 1000 + 7, budgetMs);
        candidates.push(cand);
        onProgress?.({ candidate: i + 1, of: nCand, hard: cand.hard, soft: cand.soft, elapsedMs: Date.now() - t0 });
    }
    candidates.sort((a, b) => (a.hard - b.hard) || (a.soft - b.soft));
    return { best: candidates[0], candidates, elapsedMs: Date.now() - t0 };
}

// ──────────────────────────────── 공개 API (Worker 분기)
export async function solve(doc: Doc, opts: SolveOptions = {}, onProgress?: (p: SolveProgress) => void): Promise<SolveResult> {
    if (typeof Worker !== 'undefined') {
        try {
            return await new Promise<SolveResult>((resolve, reject) => {
                const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
                worker.onmessage = (e: MessageEvent) => {
                    const msg = e.data;
                    if (msg?.type === 'progress') onProgress?.(msg.progress);
                    else if (msg?.type === 'result') { resolve(msg.result); worker.terminate(); }
                    else if (msg?.type === 'error') { reject(new Error(msg.error)); worker.terminate(); }
                };
                worker.onerror = (err) => { reject(err instanceof Error ? err : new Error(String(err))); worker.terminate(); };
                worker.postMessage({ doc, opts });
            });
        } catch {
            return solveSync(doc, opts, onProgress);
        }
    }
    return solveSync(doc, opts, onProgress);
}

export async function autoAdjust(doc: Doc, opts: SolveOptions = {}, onProgress?: (p: SolveProgress) => void): Promise<SolveResult> {
    return solve(doc, { ...opts, adjustOnly: true }, onProgress);
}
