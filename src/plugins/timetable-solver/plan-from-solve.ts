/**
 * 풀이 결과(엔진 후보) → 편성안(timetable-plans 약속의 Plan) 순수 변환. 저장·화면을 모른다.
 *   🔴 반·과목·교사·방은 정본 id 로만 — 엔진 입력의 id 가 정본 id 그대로라(build-context) 그대로 옮긴다.
 *   요일은 엔진 0=월 → 바깥 1=월(toWeekday), 시간은 칸 번호 → 「몇째 수업 시간」(점심·쉬는 시간 칸은 세지 않는다).
 *   담임이 자기 반을 맡는 수업(엔진 센티널)은 정본의 담임 관계로 선생님을 되찾는다 — 못 찾으면 그 칸은 빠지고 skipped 로 센다.
 */
import type { Plan, Placement, PlanDay } from '../timetable-plans/contracts/plans';
import type { SolveCandidate } from './engine/api';
import type { SolverInput } from './contracts/solver';
import { HOMEROOM_AGENT_ID } from './types/schema';
import { toWeekday } from './day';

export interface CandidatePlan { plan: Plan; skipped: number }

export function candidateToPlan(
    input: SolverInput,
    cand: Pick<SolveCandidate, 'hard' | 'soft' | 'assignments'>,
    name: string,
    homeroomTeacherOf: (classId: string) => string | undefined,
    now: Date = new Date(),
): CandidatePlan {
    const trackSpec = new Map(input.tracks.map((t) => [t.id, input.specs.find((s) => s.id === t.specId)]));
    const seen = new Set<string>();
    const placements: Placement[] = [];
    let skipped = 0;
    for (const a of cand.assignments) {
        const spec = trackSpec.get(a.trackId);
        const day = toWeekday(a.dayIndex);
        const teacherId = a.agentId === HOMEROOM_AGENT_ID ? homeroomTeacherOf(a.trackId) : a.agentId;
        let period = 0;
        for (const s of spec?.slots ?? []) if (s.index <= a.slotIndex && s.assignable) period++;
        if (!teacherId || !a.activityId || !spec || day < 1 || day > 6 || period < 1) { skipped++; continue; }
        const key = `${a.trackId}|${day}|${period}`;
        if (seen.has(key)) continue;      // 같은 칸 둘(협력수업 따위)은 앞엣것만 — 편성안은 한 칸에 하나
        seen.add(key);
        placements.push({
            classId: a.trackId, day: day as PlanDay, period, subjectId: a.activityId, teacherId,
            ...(a.resourceId ? { roomId: a.resourceId } : {}),
        });
    }
    return {
        plan: { name, madeAt: now.toISOString(), placements, summary: { score: null, hardViolations: cand.hard, softViolations: cand.soft } },
        skipped,
    };
}
