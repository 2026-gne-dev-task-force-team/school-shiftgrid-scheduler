/**
 * 편성안 배치 → 엔진 점검 — 약속 solver 의 evaluate. 순수 셈이다(저장·화면을 모른다).
 *   🔴 엔진 알고리즘은 그대로 — 배치를 엔진 입력(Doc)에 얹어 evaluateAll·diagnose·demandStatus 를 부르기만 한다.
 *   🔴 기초 정보(반·과목·교사·방)는 id 로만 읽고 다시 저장하지 않는다.
 */
import type { Placement } from '../timetable-plans/contracts/plans';
import type { Assignment } from './types/schema';
import { isHomeroomAgent } from './types/schema';
import type { SolverInput, PlanEvaluation } from './contracts/solver';
import { evaluateAll, diagnose, demandStatus, defaultRules } from './engine/core';
import { toDayIndex } from './day';

/** 점수 — 100 에서 어긴 필수 규칙 하나당 10 · 권장 규칙 하나당 1 을 깎는다(0 밑으로는 안 내려간다). 높을수록 좋다. */
export const SCORE_FULL = 100;

/** 편성안 배치를 엔진 입력에 얹는다 — 시간 틀에 없는 교시·모르는 반은 빠진다. 시수(demand)는 반·과목·선생님이 맞는 줄에 채운다. */
export function placementsToDoc(input: SolverInput, placements: readonly Placement[]): SolverInput {
    const filled = new Map<string, number>();
    const assignments: Assignment[] = [];
    placements.forEach((p, i) => {
        const track = input.tracks.find((t) => t.id === p.classId);
        const spec = input.specs.find((s) => s.id === track?.specId);
        const slot = (spec?.slots ?? []).filter((s) => s.assignable)[p.period - 1];
        if (!track || !slot) return;
        const timetableId = (input.timetables.find((t) => t.specId === track.specId) ?? input.timetables[0])?.id ?? '';
        const fits = input.demands.filter((d) => d.trackId === p.classId && d.activityId === p.subjectId && (d.agentId === p.teacherId || isHomeroomAgent(d.agentId)));
        const demand = fits.find((d) => (filled.get(d.id) ?? 0) < d.count) ?? fits[0];
        if (demand) filled.set(demand.id, (filled.get(demand.id) ?? 0) + 1);
        assignments.push({
            kind: 'work', id: `pl${i}`, timetableId, trackId: p.classId, dayIndex: toDayIndex(p.day), slotIndex: slot.index,
            agentId: p.teacherId, activityId: p.subjectId,
            ...(p.roomId ? { resourceId: p.roomId } : {}),
            ...(demand ? { demandId: demand.id } : {}),
            ...(p.fixed ? { fixed: true } : {}),
            ...(p.pinned || p.temp ? { pinned: true } : {}),
            ...(p.temp ? { temp: true } : {}),
        });
    });
    // 정본에서 지은 입력엔 규칙이 비어 있다 — 비어 있으면 엔진의 기본 규칙으로 판정한다.
    const rules = input.rules.length > 0 ? input.rules : defaultRules();
    return { ...input, rules, assignments };
}

export function evaluatePlan(input: SolverInput, placements: readonly Placement[]): PlanEvaluation {
    const doc = placementsToDoc(input, placements);
    const byId = new Map(doc.assignments.map((x) => [x.id, x]));
    // 칸 정보가 없는 위반은 걸린 배치에서 칸을 채워 준다(화면이 「어느 반 어느 칸」을 말하게).
    const violations = evaluateAll(doc).map((v) => v.cells?.length ? v : {
        ...v,
        cells: v.assignmentIds.flatMap((id) => { const x = byId.get(id); return x ? [{ trackId: x.trackId, agentId: x.agentId, dayIndex: x.dayIndex, slotIndex: x.slotIndex }] : []; }),
    });
    const diagnosis = diagnose(doc);
    const demands = demandStatus(doc);
    const hard = violations.filter((v) => v.kind === 'hard').length;
    const soft = violations.length - hard;
    const score = Math.max(0, Math.round(SCORE_FULL - hard * 10 - soft));
    return { violations, hard, soft, score, diagnosis, demands };
}
