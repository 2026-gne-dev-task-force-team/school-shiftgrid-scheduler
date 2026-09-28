/**
 * 규칙 틀(EngineRule) 전부 — 하드 9 · 소프트 14.
 * 각 규칙은 ctx(EngineContext) 하나만 보고 위반 목록을 돌려준다.
 * 소프트 벌점 weight = 건수(magnitude) × bucketWeight × tierWeight(해당 교사).
 */
import type {
    Assignment, ConflictRule, RuleParams, RuleBucket, TargetRef, Violation, WeeklyBlock,
} from '../types/schema';
import { isHomeroomAgent } from '../types/schema';
import type { ClockRange, EngineContext, EngineRule } from './api';
import { hm } from './context';

const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
const CONSEC_GAP = 15; // 이 분 이내로 붙으면 '연속 수업'으로 본다

const num = (p: RuleParams, k: string, d: number) => (typeof p[k] === 'number' ? (p[k] as number) : d);
const bool = (p: RuleParams, k: string, d: boolean) => (typeof p[k] === 'boolean' ? (p[k] as boolean) : d);
const str = (p: RuleParams, k: string, d: string) => (typeof p[k] === 'string' ? (p[k] as string) : d);

const agentRef = (id: string): TargetRef => ({ kind: 'agent', id });
const trackRef = (id: string): TargetRef => ({ kind: 'track', id });
const resourceRef = (id: string): TargetRef => ({ kind: 'resource', id });

/** 소프트 위반의 fixable — 같은 반·같은 날에 안 막힌 빈 수업 칸이 하나라도 있으면 true */
function softFixable(ctx: EngineContext, trackId: string, day: number): boolean {
    return ctx.lessonSlots(trackId, day).some((s) =>
        ctx.byCell(trackId, day, s.index).length === 0 &&
        !ctx.isBlocked(trackRef(trackId), { dayIndex: day, startMin: hm(s.start), endMin: hm(s.end) }, trackId));
}

/** 학년의 규격을 대표 반 하나에서 얻는다 */
function specByGrade(ctx: EngineContext, grade: number | undefined) {
    if (grade == null) return undefined;
    for (const t of ctx.doc.tracks) {
        if (t.grade === grade) {
            const sp = ctx.specOfTrack(t.id);
            if (sp) return sp;
        }
    }
    return undefined;
}

/** 학년의 점심 시각 구간들 */
function gradeLunches(ctx: EngineContext, grade: number | undefined, day: number): ClockRange[] {
    const sp = specByGrade(ctx, grade);
    if (!sp) return [];
    return sp.slots.filter((s) => s.kind === 'lunch')
        .map((s) => ({ dayIndex: day, startMin: hm(s.start), endMin: hm(s.end) }));
}

/** 학년의 그날 수업 슬롯 시각 구간들 */
function gradeLessonIntervals(ctx: EngineContext, grade: number | undefined, day: number): ClockRange[] {
    const sp = specByGrade(ctx, grade);
    if (!sp) return [];
    let ls = sp.slots.filter((s) => s.assignable && s.kind !== 'lunch');
    const n = sp.lessonsPerDay?.[day];
    if (n != null) ls = ls.slice(0, n);
    return ls.map((s) => ({ dayIndex: day, startMin: hm(s.start), endMin: hm(s.end) }));
}

/** 교사 하루 배치를 시각순으로 '연속 토막'으로 나눈다 */
function runsOf(ctx: EngineContext, list: Assignment[]): Assignment[][] {
    const withClock = list.map((a) => ({ a, c: ctx.clockOf(a) })).filter((x) => x.c) as { a: Assignment; c: ClockRange }[];
    withClock.sort((x, y) => x.c.startMin - y.c.startMin);
    const runs: Assignment[][] = [];
    let cur: { a: Assignment; c: ClockRange }[] = [];
    for (const x of withClock) {
        if (cur.length === 0) { cur = [x]; continue; }
        const prev = cur[cur.length - 1].c;
        if (x.c.startMin - prev.endMin <= CONSEC_GAP) cur.push(x);
        else { runs.push(cur.map((y) => y.a)); cur = [x]; }
    }
    if (cur.length) runs.push(cur.map((y) => y.a));
    return runs;
}

/** 이 배치에 이 교사가 들었나 — 담당(agentId)이거나 협력수업 둘째 교사(coAgentId)면 true */
const involvesAgent = (a: Assignment, agentId: string) => a.agentId === agentId || a.coAgentId === agentId;

function agentDays(ctx: EngineContext, agentId: string): Map<number, Assignment[]> {
    const m = new Map<number, Assignment[]>();
    for (const a of ctx.doc.assignments) {
        if (!involvesAgent(a, agentId)) continue;
        (m.get(a.dayIndex) ?? m.set(a.dayIndex, []).get(a.dayIndex)!).push(a);
    }
    return m;
}

/** 교사 축 소프트용 — 고정 배치(fixed)는 빼고 요일별로 묶는다. 담임·담임 겸 전담은 호출부에서 거른다 */
function agentSoftDays(ctx: EngineContext, agentId: string): Map<number, Assignment[]> {
    const m = new Map<number, Assignment[]>();
    for (const a of ctx.doc.assignments) {
        if (!involvesAgent(a, agentId) || a.fixed) continue;
        (m.get(a.dayIndex) ?? m.set(a.dayIndex, []).get(a.dayIndex)!).push(a);
    }
    return m;
}

/** 교사 축 소프트용 — 고정이 아닌 그 교사의 배치 전부(협력수업 둘째 교사 포함) */
const agentSoftAll = (ctx: EngineContext, agentId: string): Assignment[] =>
    ctx.doc.assignments.filter((a) => involvesAgent(a, agentId) && !a.fixed);

/** 교사 축 소프트 규칙의 대상 교사인가 — 담임(HOMEROOM)·담임 겸 전담은 뺀다(하루 종일 제 반이라 압축·균형이 무의미) */
const isSoftAgent = (ctx: EngineContext, agentId: string) =>
    !isHomeroomAgent(agentId) && ctx.agents.get(agentId)?.role !== '담임 겸 전담';

function mkViol(v: Omit<Violation, 'ruleId'> & { templateId: string }): Violation {
    return { ...v, ruleId: v.templateId };
}

// ══════════════════════════════════════════════════════════════
//  하드 규칙 8
// ══════════════════════════════════════════════════════════════

const noOverlapTrack: EngineRule = {
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

const noOverlapAgent: EngineRule = {
    id: 'no-overlap-agent', label: '교사 겹침', kind: 'hard', params: [],
    description: '같은 교사가 겹치는 시각에 두 반에 들어가 있습니다(교시 번호가 아니라 실제 시각으로 봅니다). 함께 수업으로 같은 반 같은 칸에 함께 드는 것은 예외입니다. 담임은 반이 정하므로 이 규칙에서 뺍니다.',
    defaultMessage: '{교사} 교사가 {요일}요일 같은 시각에 두 반에 들어가 있습니다',
    evaluate(_p, ctx) {
        const out: Violation[] = [];
        for (const ag of ctx.doc.agents) {
            const byDay = agentDays(ctx, ag.id);
            for (const [, list] of byDay) {
                const clocks = list.map((a) => ({ a, c: ctx.clockOf(a) }));
                for (let i = 0; i < clocks.length; i++) {
                    for (let j = i + 1; j < clocks.length; j++) {
                        const A = clocks[i], B = clocks[j];
                        if (!A.c || !B.c) continue;
                        if (!ctx.overlaps(A.c, B.c)) continue;
                        // 같은 반 같은 칸은 예외 (협력수업)
                        if (A.a.trackId === B.a.trackId && A.a.slotIndex === B.a.slotIndex) continue;
                        out.push(mkViol({
                            templateId: 'no-overlap-agent', kind: 'hard',
                            message: this.defaultMessage, assignmentIds: [A.a.id, B.a.id],
                            weight: 0, fixable: true, subject: agentRef(ag.id),
                        }));
                    }
                }
            }
        }
        return out;
    },
};

const noOverlapResource: EngineRule = {
    id: 'no-overlap-resource', label: '특별실 정원 초과', kind: 'hard', params: [],
    description: '같은 시각에 특별실을 정원보다 많이 쓰고 있습니다. 한 과목에 특별실이 여럿이면 그 과목이 쓰는 특별실 정원을 합쳐서 봅니다.',
    defaultMessage: '{요일}요일 같은 시각에 특별실 정원을 넘겼습니다',
    evaluate(_p, ctx) {
        const out: Violation[] = [];
        // 특별실을 쓰는 배치를 과목별로 묶는다
        const byAct = new Map<string, Assignment[]>();
        for (const a of ctx.doc.assignments) {
            if (!a.resourceId || !a.activityId) continue;
            (byAct.get(a.activityId) ?? byAct.set(a.activityId, []).get(a.activityId)!).push(a);
        }
        for (const [actId, list] of byAct) {
            const referenced = new Set(list.map((a) => a.resourceId!));
            let pooledCap = 0;
            for (const r of ctx.doc.resources) {
                const serves = !r.activityIds || r.activityIds.length === 0 || r.activityIds.includes(actId);
                if (serves || referenced.has(r.id)) pooledCap += r.capacity ?? 1;
            }
            if (pooledCap <= 0) pooledCap = 1;
            // 요일별로 동시 사용 최대치 검사
            const byDay = new Map<number, Assignment[]>();
            for (const a of list) (byDay.get(a.dayIndex) ?? byDay.set(a.dayIndex, []).get(a.dayIndex)!).push(a);
            for (const [, day] of byDay) {
                const offenders = new Set<string>();
                for (const a of day) {
                    const ca = ctx.clockOf(a);
                    if (!ca) continue;
                    let sim = 0;
                    for (const b of day) {
                        const cb = ctx.clockOf(b);
                        if (cb && ctx.overlaps(ca, cb)) sim++;
                    }
                    if (sim > pooledCap) offenders.add(a.id);
                }
                if (offenders.size) {
                    out.push(mkViol({
                        templateId: 'no-overlap-resource', kind: 'hard',
                        message: this.defaultMessage, assignmentIds: [...offenders],
                        weight: 0, fixable: true,
                    }));
                }
            }
        }
        return out;
    },
};

const blockedCell: EngineRule = {
    id: 'blocked-cell', label: '배정 불가 칸 사용', kind: 'hard', params: [],
    description: '수업이 배정 불가 칸에 들어가 있습니다. 교사·반·특별실을 각각 봅니다. 함께 수업이면 두 교사 모두 봅니다.',
    defaultMessage: '{반} {요일}요일 수업이 배정 불가 칸에 들어가 있습니다',
    evaluate(_p, ctx) {
        const out: Violation[] = [];
        for (const a of ctx.doc.assignments) {
            if (a.fixed) continue; // 고정 배치는 그 금지칸의 이유이지 위반이 아니다(예: 동아리 칸의 창체)
            const c = ctx.clockOf(a);
            if (!c) continue;
            let hit = false;
            if (ctx.isBlocked(trackRef(a.trackId), c, a.trackId)) hit = true;
            if (!hit && a.agentId && !isHomeroomAgent(a.agentId) && ctx.isBlocked(agentRef(a.agentId), c, a.trackId)) hit = true;
            if (!hit && a.coAgentId && !isHomeroomAgent(a.coAgentId) && ctx.isBlocked(agentRef(a.coAgentId), c, a.trackId)) hit = true;
            if (!hit && a.resourceId && ctx.isBlocked(resourceRef(a.resourceId), c, a.trackId)) hit = true;
            if (hit) {
                out.push(mkViol({
                    templateId: 'blocked-cell', kind: 'hard',
                    message: this.defaultMessage, assignmentIds: [a.id],
                    weight: 0, fixable: true, subject: trackRef(a.trackId),
                }));
            }
        }
        return out;
    },
};

const demandCount: EngineRule = {
    id: 'demand-count', label: '시수 부족·초과', kind: 'hard', params: [],
    description: '수요마다 배치한 수업 수가 정한 주당 시수와 같아야 합니다(부족·초과 모두 어긋납니다).',
    defaultMessage: '{교사} 시수가 정한 값과 다릅니다',
    evaluate(_p, ctx) {
        const out: Violation[] = [];
        for (const d of ctx.doc.demands) {
            const placed = ctx.byDemand(d.id);
            if (placed.length !== d.count) {
                const who = isHomeroomAgent(d.agentId)
                    ? `${ctx.tracks.get(d.trackId)?.homeroomName ?? ctx.tracks.get(d.trackId)?.name ?? '담임'} 담임`
                    : `${ctx.agents.get(d.agentId)?.name ?? d.agentId} 교사`;
                out.push(mkViol({
                    templateId: 'demand-count', kind: 'hard',
                    message: `${who} 시수 ${placed.length}/${d.count}`,
                    assignmentIds: placed.map((a) => a.id),
                    weight: 0, fixable: true, subject: agentRef(d.agentId),
                }));
            }
        }
        return out;
    },
};

const blockContiguous: EngineRule = {
    id: 'block-contiguous', label: '연속 수업 묶음', kind: 'hard', params: [],
    description: '연속 수업으로 묶인 수업은 같은 반·같은 날·이어지는 교시에 있어야 하고 사이에 점심이 없어야 합니다.',
    defaultMessage: '연속 수업이 이어져 있지 않습니다',
    evaluate(_p, ctx) {
        const out: Violation[] = [];
        const byBlock = new Map<string, Assignment[]>();
        for (const a of ctx.doc.assignments) {
            if (!a.blockId) continue;
            (byBlock.get(a.blockId) ?? byBlock.set(a.blockId, []).get(a.blockId)!).push(a);
        }
        for (const [, list] of byBlock) {
            if (list.length < 2) continue;
            const sameTrack = list.every((a) => a.trackId === list[0].trackId);
            const sameDay = list.every((a) => a.dayIndex === list[0].dayIndex);
            let bad = !sameTrack || !sameDay;
            if (!bad) {
                const idxs = list.map((a) => a.slotIndex).sort((x, y) => x - y);
                const contiguous = idxs[idxs.length - 1] - idxs[0] === idxs.length - 1
                    && new Set(idxs).size === idxs.length;
                if (!contiguous) bad = true;
                else {
                    // [min..max] 안에 점심 슬롯이 끼면 안 된다
                    const sp = ctx.specOfTrack(list[0].trackId);
                    if (sp) {
                        for (let i = idxs[0]; i <= idxs[idxs.length - 1]; i++) {
                            if (sp.slots.find((s) => s.index === i)?.kind === 'lunch') { bad = true; break; }
                        }
                    }
                }
            }
            if (bad) {
                out.push(mkViol({
                    templateId: 'block-contiguous', kind: 'hard',
                    message: this.defaultMessage, assignmentIds: list.map((a) => a.id),
                    weight: 0, fixable: true, subject: trackRef(list[0].trackId),
                }));
            }
        }
        return out;
    },
};

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

const cycleOrder: EngineRule = {
    id: 'cycle-order', label: '차시 순서 맞춤', kind: 'hard', params: [],
    description: '차시 순서를 맞추는 수요는 같은 교사·학년·과목의 모든 반이 앞 차시를 시작한 뒤에야 다음 차시를 시작할 수 있습니다(차시 번호가 아니라 실제 시각 순서로 봅니다).',
    defaultMessage: '{반} 차시 순서가 어긋났습니다',
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

const agentLunchFree: EngineRule = {
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

// ── 담임 겸 전담 자리 비움 (필수)
const homeroomPlusFree: EngineRule = {
    id: 'homeroom-plus-free', label: '담임 겸 전담 자리 비움', kind: 'hard', params: [],
    description: '담임 겸 전담 교사가 다른 반 수업을 하는 시각에는, 자기 담임반이 그 시각에 다른 교사의 수업을 받고 있어야 합니다(담임반이 담임 수업 중이면 그 교사가 자리를 비울 수 없습니다).',
    defaultMessage: '{교사} 교사 담임반이 비어 있지 않습니다',
    evaluate(_p, ctx) {
        const out: Violation[] = [];
        for (const ag of ctx.doc.agents) {
            if (ag.role !== '담임 겸 전담' || !ag.homeroomTrackIds?.length) continue;
            const hts = new Set(ag.homeroomTrackIds);
            for (const a of ctx.doc.assignments) {
                if (!involvesAgent(a, ag.id)) continue;
                if (hts.has(a.trackId)) continue;       // 자기 담임반 수업은 문제없음
                const ca = ctx.clockOf(a);
                if (!ca) continue;
                // 담임반 중 하나에 같은 시각 다른 교사의(고정 아님) 수업이 있어야 한다
                const covered = ctx.doc.assignments.some((b) => {
                    if (!hts.has(b.trackId)) return false;
                    if (!b.agentId || isHomeroomAgent(b.agentId) || b.agentId === ag.id || b.fixed) return false;
                    const cb = ctx.clockOf(b);
                    return !!cb && ctx.overlaps(ca, cb);
                });
                if (!covered) {
                    const day = DAYS[a.dayIndex] ?? String(a.dayIndex);
                    const period = ctx.specOfTrack(a.trackId)?.slots.find((s) => s.index === a.slotIndex)?.label ?? `${a.slotIndex}교시`;
                    const otherTrack = ctx.tracks.get(a.trackId)?.name ?? a.trackId;
                    const homeNames = [...hts].map((id) => ctx.tracks.get(id)?.name ?? id).join('·');
                    out.push(mkViol({
                        templateId: 'homeroom-plus-free', kind: 'hard',
                        message: `${ag.name} 교사: ${day} ${period}에 ${otherTrack}반 수업이 있지만 담임반 ${homeNames}은 그 시각에 담임 수업입니다`,
                        assignmentIds: [a.id], weight: 0, fixable: true, subject: agentRef(ag.id),
                    }));
                }
            }
        }
        return out;
    },
};

// ══════════════════════════════════════════════════════════════
//  소프트 규칙 14
// ══════════════════════════════════════════════════════════════

/** 소프트 위반 하나 만들기 (weight = magnitude × bucket × tier) */
function sViol(
    ctx: EngineContext, templateId: string, bucket: RuleBucket, message: string,
    assignmentIds: string[], magnitude: number, agentId: string | undefined,
    trackId: string, day: number, subject?: TargetRef,
): Violation {
    const w = magnitude * ctx.bucketWeight(bucket) * (agentId ? ctx.tierWeight(agentId) : 1);
    return {
        ruleId: templateId, templateId, kind: 'soft', message, assignmentIds,
        weight: w, fixable: softFixable(ctx, trackId, day), subject,
    };
}

function weeklyBlockRange(ctx: EngineContext, wb: WeeklyBlock, trackId: string): ClockRange | undefined {
    if (wb.slotIndex != null) {
        const slot = ctx.specOfTrack(trackId)?.slots.find((s) => s.index === wb.slotIndex);
        if (!slot) return undefined;
        return { dayIndex: wb.dayIndex, startMin: hm(slot.start), endMin: hm(slot.end) };
    }
    if (wb.from) return { dayIndex: wb.dayIndex, startMin: hm(wb.from), endMin: wb.to ? hm(wb.to) : 24 * 60 };
    return { dayIndex: wb.dayIndex, startMin: 0, endMin: 24 * 60 };
}

const avoid: EngineRule = {
    id: 'avoid', label: '되도록 피함 칸 사용', kind: 'soft', bucket: 'preferred', params: [],
    description: '되도록 피함 칸에 수업이 들어가 있습니다. 우선순위가 높은 교사일수록 점수가 더 크게 붙습니다.',
    defaultMessage: '{교사} 교사가 되도록 피함 시간에 배치됐습니다',
    evaluate(_p, ctx) {
        const out: Violation[] = [];
        const softBlocks = ctx.doc.weeklyBlocks.filter((w) => w.soft);
        if (softBlocks.length === 0) return out;
        for (const a of ctx.doc.assignments) {
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

const consecutiveLimit: EngineRule = {
    id: 'consecutive-limit', label: '연속 수업 상한', kind: 'soft', bucket: 'important',
    params: [{ key: 'limit', label: '연속 상한', type: 'number', default: 6 }],
    description: '교사가 하루에 쉬지 않고 이어서 하는 수업이 상한(기본 6)에 이르면 점수가 붙습니다.',
    defaultMessage: '{교사} 교사가 {요일}요일에 너무 오래 이어서 수업합니다',
    evaluate(p, ctx) {
        const out: Violation[] = [];
        const limit = num(p, 'limit', 6);
        for (const ag of ctx.doc.agents) {
            if (!isSoftAgent(ctx, ag.id)) continue;
            for (const [day, list] of agentSoftDays(ctx, ag.id)) {
                for (const run of runsOf(ctx, list)) {
                    if (run.length >= limit) {
                        out.push(sViol(ctx, 'consecutive-limit', 'important', this.defaultMessage,
                            run.map((a) => a.id), 1, ag.id, run[0].trackId, day, agentRef(ag.id)));
                    }
                }
            }
        }
        return out;
    },
};

const preferConsecutive: EngineRule = {
    id: 'prefer-consecutive', label: '수업 토막 줄이기', kind: 'soft', bucket: 'important', params: [],
    description: '교사의 하루 수업이 여러 토막으로 갈릴수록 점수가 붙습니다.',
    defaultMessage: '{교사} 교사 {요일}요일 수업이 토막나 있습니다',
    evaluate(_p, ctx) {
        const out: Violation[] = [];
        for (const ag of ctx.doc.agents) {
            if (!isSoftAgent(ctx, ag.id)) continue;
            for (const [day, list] of agentSoftDays(ctx, ag.id)) {
                const runs = runsOf(ctx, list);
                const mag = runs.length - 1;
                if (mag > 0) {
                    out.push(sViol(ctx, 'prefer-consecutive', 'important', this.defaultMessage,
                        list.map((a) => a.id), mag, ag.id, list[0].trackId, day, agentRef(ag.id)));
                }
            }
        }
        return out;
    },
};

const compactDay: EngineRule = {
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

const subjectsPerDayAgent: EngineRule = {
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

const subjectsPerDayTrack: EngineRule = {
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

const amPmBalance: EngineRule = {
    id: 'am-pm-balance', label: '오전·오후 균형', kind: 'soft', bucket: 'preferred', params: [],
    description: '교사의 하루 오전·오후 수업 수 차이입니다(오후 = 점심 뒤).',
    defaultMessage: '{교사} 교사 {요일}요일 오전·오후가 치우쳤습니다',
    evaluate(_p, ctx) {
        const out: Violation[] = [];
        for (const ag of ctx.doc.agents) {
            if (!isSoftAgent(ctx, ag.id)) continue;
            for (const [day, list] of agentSoftDays(ctx, ag.id)) {
                let am = 0, pm = 0;
                for (const a of list) {
                    const c = ctx.clockOf(a);
                    if (!c) continue;
                    const lunches = gradeLunches(ctx, ctx.tracks.get(a.trackId)?.grade, day);
                    const lunchEnd = lunches.length ? Math.min(...lunches.map((l) => l.endMin)) : Infinity;
                    if (c.startMin >= lunchEnd) pm++; else am++;
                }
                const mag = Math.abs(am - pm);
                if (mag > 0) {
                    out.push(sViol(ctx, 'am-pm-balance', 'preferred', this.defaultMessage,
                        list.map((a) => a.id), mag, ag.id, list[0].trackId, day, agentRef(ag.id)));
                }
            }
        }
        return out;
    },
};

const samePeriodAcrossDays: EngineRule = {
    id: 'same-period-across-days', label: '요일별 동일 교시', kind: 'soft', bucket: 'preferred', params: [],
    description: '같은 반·같은 과목이 여러 요일에 있을 때 교시가 다른 수입니다(같은 교시로 모을수록 좋습니다).',
    defaultMessage: '{반} {과목} 교시가 요일마다 다릅니다',
    evaluate(_p, ctx) {
        const out: Violation[] = [];
        const groups = new Map<string, Assignment[]>();
        for (const a of ctx.doc.assignments) {
            if (!a.activityId) continue;
            const k = `${a.trackId}|${a.activityId}`;
            (groups.get(k) ?? groups.set(k, []).get(k)!).push(a);
        }
        for (const [, list] of groups) {
            if (list.length < 2) continue;
            const freq = new Map<number, number>();
            for (const a of list) freq.set(a.slotIndex, (freq.get(a.slotIndex) ?? 0) + 1);
            const maxFreq = Math.max(...freq.values());
            const mag = list.length - maxFreq;
            if (mag > 0) {
                out.push(sViol(ctx, 'same-period-across-days', 'preferred', this.defaultMessage,
                    list.map((a) => a.id), mag, list[0].agentId, list[0].trackId, list[0].dayIndex, trackRef(list[0].trackId)));
            }
        }
        return out;
    },
};

const subjectAdjacent: EngineRule = {
    id: 'subject-adjacent', label: '같은 과목 붙이기', kind: 'soft', bucket: 'important', params: [],
    description: '같은 반·같은 과목이 같은 날 둘 이상인데 이어지지 않거나 점심을 사이에 두면 점수가 붙습니다.',
    defaultMessage: '{반} {과목}이 같은 날 떨어져 있습니다',
    evaluate(_p, ctx) {
        const out: Violation[] = [];
        const groups = new Map<string, Assignment[]>();
        for (const a of ctx.doc.assignments) {
            if (!a.activityId) continue;
            const k = `${a.trackId}|${a.activityId}|${a.dayIndex}`;
            (groups.get(k) ?? groups.set(k, []).get(k)!).push(a);
        }
        for (const [, list] of groups) {
            if (list.length < 2) continue;
            const idxs = list.map((a) => a.slotIndex).sort((x, y) => x - y);
            let bad = idxs[idxs.length - 1] - idxs[0] !== idxs.length - 1 || new Set(idxs).size !== idxs.length;
            if (!bad) {
                const sp = ctx.specOfTrack(list[0].trackId);
                if (sp) for (let i = idxs[0]; i <= idxs[idxs.length - 1]; i++) {
                    if (sp.slots.find((s) => s.index === i)?.kind === 'lunch') { bad = true; break; }
                }
            }
            if (bad) {
                out.push(sViol(ctx, 'subject-adjacent', 'important', this.defaultMessage,
                    list.map((a) => a.id), 1, list[0].agentId, list[0].trackId, list[0].dayIndex, trackRef(list[0].trackId)));
            }
        }
        return out;
    },
};

const dayCluster: EngineRule = {
    id: 'day-cluster', label: '교사 요일 몰기/분산', kind: 'soft', bucket: 'preferred',
    params: [{ key: 'mode', label: '방식', type: 'select', options: ['몰기', '분산'], default: '몰기' }],
    description: '몰기는 교사가 쓰는 요일 수를 줄이고, 분산은 요일별 수업 수를 고르게 합니다.',
    defaultMessage: '{교사} 교사 요일 배치가 목표와 다릅니다',
    evaluate(p, ctx) {
        const out: Violation[] = [];
        const mode = str(p, 'mode', '몰기');
        for (const ag of ctx.doc.agents) {
            if (!isSoftAgent(ctx, ag.id)) continue;
            const byDay = agentSoftDays(ctx, ag.id);
            const list = agentSoftAll(ctx, ag.id);
            if (list.length === 0) continue;
            let mag = 0;
            if (mode === '분산') {
                const counts = [0, 0, 0, 0, 0];
                for (const a of list) if (a.dayIndex >= 0 && a.dayIndex < 5) counts[a.dayIndex]++;
                const mean = list.length / 5;
                mag = Math.round(counts.reduce((s, c) => s + (c - mean) * (c - mean), 0));
            } else {
                mag = byDay.size - 1;
            }
            if (mag > 0) {
                out.push(sViol(ctx, 'day-cluster', 'preferred', this.defaultMessage,
                    list.map((a) => a.id), mag, ag.id, list[0].trackId, list[0].dayIndex, agentRef(ag.id)));
            }
        }
        return out;
    },
};

const onePlacePerDay: EngineRule = {
    id: 'one-place-per-day', label: '하루 한 장소', kind: 'soft', bucket: 'essential',
    params: [{ key: 'enabled', label: '적용', type: 'boolean', default: false }],
    description: '교사가 하루에 일반 교실 수업과 특별실 수업을 섞으면 점수가 붙습니다(선택).',
    defaultMessage: '{교사} 교사가 {요일}요일 교실과 특별실을 오갑니다',
    evaluate(p, ctx) {
        const out: Violation[] = [];
        if (!bool(p, 'enabled', false)) return out;
        for (const ag of ctx.doc.agents) {
            if (!isSoftAgent(ctx, ag.id)) continue;
            for (const [day, list] of agentSoftDays(ctx, ag.id)) {
                const hasRoom = list.some((a) => a.resourceId);
                const hasClass = list.some((a) => !a.resourceId);
                if (hasRoom && hasClass) {
                    out.push(sViol(ctx, 'one-place-per-day', 'essential', this.defaultMessage,
                        list.map((a) => a.id), 1, ag.id, list[0].trackId, day, agentRef(ag.id)));
                }
            }
        }
        return out;
    },
};

const lunchAdjacent: EngineRule = {
    id: 'lunch-adjacent', label: '점심 앞뒤 연속 수업', kind: 'soft', bucket: 'preferred', params: [],
    description: '교사가 점심 바로 앞 칸과 바로 뒤 칸에 모두 수업하면 점수가 붙습니다.',
    defaultMessage: '{교사} 교사가 {요일}요일 점심 앞뒤로 이어서 수업합니다',
    evaluate(_p, ctx) {
        const out: Violation[] = [];
        for (const ag of ctx.doc.agents) {
            if (!isSoftAgent(ctx, ag.id)) continue;
            for (const [day, list] of agentSoftDays(ctx, ag.id)) {
                const clocks = list.map((a) => ctx.clockOf(a)).filter((c): c is ClockRange => !!c);
                const grades = new Set<number>();
                for (const a of list) { const g = ctx.tracks.get(a.trackId)?.grade; if (g != null) grades.add(g); }
                let hit = false;
                for (const g of grades) {
                    const lunches = gradeLunches(ctx, g, day);
                    for (const L of lunches) {
                        const before = clocks.some((c) => c.endMin === L.startMin);
                        const after = clocks.some((c) => c.startMin === L.endMin);
                        if (before && after) { hit = true; break; }
                    }
                    if (hit) break;
                }
                if (hit) {
                    out.push(sViol(ctx, 'lunch-adjacent', 'preferred', this.defaultMessage,
                        list.map((a) => a.id), 1, ag.id, list[0].trackId, day, agentRef(ag.id)));
                }
            }
        }
        return out;
    },
};

const dayLoadBalance: EngineRule = {
    id: 'day-load-balance', label: '요일 시수 균형', kind: 'soft', bucket: 'preferred',
    params: [{ key: 'tolerance', label: '허용 편차', type: 'number', default: 2 }],
    description: '교사의 요일별 수업 수가 평균 ± 허용치(기본 2)를 벗어나면 점수가 붙습니다.',
    defaultMessage: '{교사} 교사 요일별 시수가 들쭉날쭉합니다',
    evaluate(p, ctx) {
        const out: Violation[] = [];
        const tol = num(p, 'tolerance', 2);
        for (const ag of ctx.doc.agents) {
            if (!isSoftAgent(ctx, ag.id)) continue;
            const list = agentSoftAll(ctx, ag.id);
            if (list.length === 0) continue;
            const counts = [0, 0, 0, 0, 0];
            for (const a of list) if (a.dayIndex >= 0 && a.dayIndex < 5) counts[a.dayIndex]++;
            const mean = list.length / 5;
            let mag = 0;
            for (const c of counts) if (Math.abs(c - mean) > tol) mag++;
            if (mag > 0) {
                out.push(sViol(ctx, 'day-load-balance', 'preferred', this.defaultMessage,
                    list.map((a) => a.id), mag, ag.id, list[0].trackId, list[0].dayIndex, agentRef(ag.id)));
            }
        }
        return out;
    },
};

const priorityEarly: EngineRule = {
    id: 'priority-early', label: '우선순위 높은 교사 이른 시각 우선', kind: 'soft', bucket: 'preferred', params: [],
    description: '공유 특별실에서 우선순위가 낮은 교사가 우선순위가 높은 교사보다 이른 시각을 차지하면 점수가 붙습니다.',
    defaultMessage: '특별실 이른 시각을 우선순위가 낮은 교사가 차지했습니다',
    evaluate(_p, ctx) {
        const out: Violation[] = [];
        for (const r of ctx.doc.resources) {
            const list = ctx.doc.assignments.filter((a) => a.resourceId === r.id && a.agentId && !a.fixed && isSoftAgent(ctx, a.agentId));
            const items = list.map((a) => {
                const c = ctx.clockOf(a);
                // 담임은 이 비교에서 빠지지만(isSoftAgent=false), 혹 들어오면 우선순위 없음 → 2로 본다
                const tierNum = isHomeroomAgent(a.agentId) ? 2 : (ctx.agents.get(a.agentId!)?.tier ?? 3);
                return { a, tierNum, t: c ? c.dayIndex * 100000 + c.startMin : 0 };
            }).sort((x, y) => x.t - y.t);
            let inv = 0;
            const ids: string[] = [];
            for (let i = 0; i < items.length; i++) {
                for (let j = i + 1; j < items.length; j++) {
                    if (items[i].tierNum > items[j].tierNum) { inv++; ids.push(items[i].a.id); }
                }
            }
            if (inv > 0) {
                out.push({
                    ruleId: 'priority-early', templateId: 'priority-early', kind: 'soft',
                    message: this.defaultMessage, assignmentIds: [...new Set(ids)],
                    weight: inv * ctx.bucketWeight('preferred'), fixable: true,
                    subject: resourceRef(r.id),
                });
            }
        }
        return out;
    },
};

// ══════════════════════════════════════════════════════════════

export const RULES: EngineRule[] = [
    // 하드 9
    noOverlapTrack, noOverlapAgent, noOverlapResource, blockedCell,
    demandCount, blockContiguous, cycleOrder, agentLunchFree, homeroomPlusFree,
    // 소프트 14
    avoid, consecutiveLimit, preferConsecutive, compactDay,
    subjectsPerDayAgent, subjectsPerDayTrack, amPmBalance, samePeriodAcrossDays,
    subjectAdjacent, dayCluster, onePlacePerDay, lunchAdjacent,
    dayLoadBalance, priorityEarly,
];

export function defaultRules(): ConflictRule[] {
    return RULES.map((t) => ({
        id: `rule-${t.id}`,
        templateId: t.id,
        name: t.label,
        enabled: t.id !== 'one-place-per-day',
        params: Object.fromEntries(t.params.map((p) => [p.key, p.default])) as RuleParams,
    }));
}

export const DAY_NAMES = DAYS;
