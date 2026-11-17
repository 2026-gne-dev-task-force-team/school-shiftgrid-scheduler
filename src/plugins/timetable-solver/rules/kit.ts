/**
 * 편성 규칙 공용 도구 — 규칙 기여들이 함께 쓴다(v1 legacy/engine/rules.ts 1-116 에서 글자 그대로 옮김 · F2a).
 *   🔴 알고리즘 변경 0 — 꼴만 옮겼다(rules/split-equivalence.test.ts 가 지킨다).
 */
import type { Assignment, RuleParams, TargetRef, Violation } from '../types/schema';
import { isHomeroomAgent } from '../types/schema';
import type { ClockRange, EngineContext } from '../engine/api';
import { hm } from '../engine/context';

export const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
export const CONSEC_GAP = 15; // 이 분 이내로 붙으면 '연속 수업'으로 본다

export const num = (p: RuleParams, k: string, d: number) => (typeof p[k] === 'number' ? (p[k] as number) : d);
export const bool = (p: RuleParams, k: string, d: boolean) => (typeof p[k] === 'boolean' ? (p[k] as boolean) : d);
export const str = (p: RuleParams, k: string, d: string) => (typeof p[k] === 'string' ? (p[k] as string) : d);

export const agentRef = (id: string): TargetRef => ({ kind: 'agent', id });
export const trackRef = (id: string): TargetRef => ({ kind: 'track', id });
export const resourceRef = (id: string): TargetRef => ({ kind: 'resource', id });

/** 소프트 위반의 fixable — 같은 반·같은 날에 안 막힌 빈 수업 칸이 하나라도 있으면 true */
export function softFixable(ctx: EngineContext, trackId: string, day: number): boolean {
    return ctx.lessonSlots(trackId, day).some((s) =>
        ctx.byCell(trackId, day, s.index).length === 0 &&
        !ctx.isBlocked(trackRef(trackId), { dayIndex: day, startMin: hm(s.start), endMin: hm(s.end) }, trackId));
}

/** 학년의 규격을 대표 반 하나에서 얻는다 */
export function specByGrade(ctx: EngineContext, grade: number | undefined) {
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
export function gradeLunches(ctx: EngineContext, grade: number | undefined, day: number): ClockRange[] {
    const sp = specByGrade(ctx, grade);
    if (!sp) return [];
    return sp.slots.filter((s) => s.kind === 'lunch')
        .map((s) => ({ dayIndex: day, startMin: hm(s.start), endMin: hm(s.end) }));
}

/** 학년의 그날 수업 슬롯 시각 구간들 */
export function gradeLessonIntervals(ctx: EngineContext, grade: number | undefined, day: number): ClockRange[] {
    const sp = specByGrade(ctx, grade);
    if (!sp) return [];
    let ls = sp.slots.filter((s) => s.assignable && s.kind !== 'lunch');
    const n = sp.lessonsPerDay?.[day];
    if (n != null) ls = ls.slice(0, n);
    return ls.map((s) => ({ dayIndex: day, startMin: hm(s.start), endMin: hm(s.end) }));
}

/** 교사 하루 배치를 시각순으로 '연속 토막'으로 나눈다 */
export function runsOf(ctx: EngineContext, list: Assignment[]): Assignment[][] {
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
export const involvesAgent = (a: Assignment, agentId: string) => a.agentId === agentId || a.coAgentId === agentId;

export function agentDays(ctx: EngineContext, agentId: string): Map<number, Assignment[]> {
    const m = new Map<number, Assignment[]>();
    for (const a of ctx.doc.assignments) {
        if (!involvesAgent(a, agentId)) continue;
        (m.get(a.dayIndex) ?? m.set(a.dayIndex, []).get(a.dayIndex)!).push(a);
    }
    return m;
}

/** 교사 축 소프트용 — 고정 배치(fixed)는 빼고 요일별로 묶는다. 담임·담임 겸 전담은 호출부에서 거른다 */
export function agentSoftDays(ctx: EngineContext, agentId: string): Map<number, Assignment[]> {
    const m = new Map<number, Assignment[]>();
    for (const a of ctx.doc.assignments) {
        if (!involvesAgent(a, agentId) || a.fixed) continue;
        (m.get(a.dayIndex) ?? m.set(a.dayIndex, []).get(a.dayIndex)!).push(a);
    }
    return m;
}

/** 교사 축 소프트용 — 고정이 아닌 그 교사의 배치 전부(협력수업 둘째 교사 포함) */
export const agentSoftAll = (ctx: EngineContext, agentId: string): Assignment[] =>
    ctx.doc.assignments.filter((a) => involvesAgent(a, agentId) && !a.fixed);

/** 교사 축 소프트 규칙의 대상 교사인가 — 담임(HOMEROOM)·담임 겸 전담은 뺀다(하루 종일 제 반이라 압축·균형이 무의미) */
export const isSoftAgent = (ctx: EngineContext, agentId: string) =>
    !isHomeroomAgent(agentId) && ctx.agents.get(agentId)?.role !== '담임 겸 전담';

export function mkViol(v: Omit<Violation, 'ruleId'> & { templateId: string }): Violation {
    return { ...v, ruleId: v.templateId };
}
