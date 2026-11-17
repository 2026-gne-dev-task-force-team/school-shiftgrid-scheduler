/**
 * 규칙 등록표 — 하드 9 · 소프트 14.
 * 각 규칙은 ctx(EngineContext) 하나만 보고 위반 목록을 돌려준다.
 * 소프트 벌점 weight = 건수(magnitude) × bucketWeight × tierWeight(해당 교사).
 *   ⭐ F2a: 하드 9와 공용 도구는 낱개 기여로 나갔다 — ../rules/hard/*.ts · ../rules/kit.ts(글자 그대로 옮김).
 *     소프트 14는 아직 여기(F2b 몫). 🔴 등록 순서는 v1 과 같다 — ../rules/split-equivalence.test.ts.
 */
import type {
    Assignment, ConflictRule, RuleParams, RuleBucket, TargetRef, Violation, WeeklyBlock,
} from '../types/schema';
import { isHomeroomAgent } from '../types/schema';
import type { ClockRange, EngineContext, EngineRule } from './api';
import { hm } from './context';
import {
    DAYS, num, bool, str, agentRef, trackRef, resourceRef, softFixable, gradeLunches, gradeLessonIntervals,
    runsOf, agentSoftDays, agentSoftAll, isSoftAgent,
} from '../rules/kit';
import { HARD_RULES } from '../rules/hard';


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
    description: '같은 반·같은 과목이 여러 요일에 있을 때 교시가 다른 수입니다(같은 교시로 모을수록 좋습니다). 고정 수업은 셈에서 뺍니다.',
    defaultMessage: '{반} {과목} 교시가 요일마다 다릅니다',
    evaluate(_p, ctx) {
        const out: Violation[] = [];
        const groups = new Map<string, Assignment[]>();
        for (const a of ctx.doc.assignments) {
            if (!a.activityId || a.fixed) continue;
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
    description: '같은 반·같은 과목이 같은 날 둘 이상인데 이어지지 않거나 점심을 사이에 두면 점수가 붙습니다(고정 수업 제외).',
    defaultMessage: '{반} {과목}이 같은 날 떨어져 있습니다',
    evaluate(_p, ctx) {
        const out: Violation[] = [];
        const groups = new Map<string, Assignment[]>();
        for (const a of ctx.doc.assignments) {
            if (!a.activityId || a.fixed) continue;
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
    // 하드 9 — 낱개 기여(../rules/hard)
    ...HARD_RULES,
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
