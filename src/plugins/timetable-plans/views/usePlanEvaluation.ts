/**
 * 편성안 한 벌의 **지금 점검 결과** — 「위반 N건」 머리(PlansTab)와 펼친 목록(PlanCheckProps)이 같은 출처를 쓰게 하는 한 곳(T-10gl).
 *   옛 꼴: 머리는 안에 담아 둔 summary(만들 때 찍은 값 · 입력이 바뀌면 낡음), 목록은 지금 evaluate 라 수가 어긋났다(머리 3 · 목록 1).
 *   지금 입력 기준 evaluate 가 맞다 — 목록이 이미 그걸 보이고, 편성 입력(교사·시수·일과)은 안을 만든 뒤에도 바뀐다.
 *   엔진·입력이 없으면 null — 머리는 담아 둔 summary 로 물러선다.
 */
import { useMemo } from 'react';
import type { PluginHost } from '../../../pane-ui-system/plugin';
import type { Placement } from '../contracts/plans';
import type { PlanEvaluation, Solver, SolverInput } from '../../timetable-solver/contracts/solver';

export interface PlanEvaluationResult { input: SolverInput; ev: PlanEvaluation }

export function usePlanEvaluation(host: PluginHost, placements: readonly Placement[] | null | undefined): PlanEvaluationResult | null {
    const solver = host.modules.use<Solver>('solver');
    const input = useMemo(() => solver?.readInput() ?? null, [solver]);
    return useMemo(() => (placements && input && solver ? { input, ev: solver.evaluate(input, placements) } : null), [placements, input, solver]);
}

/** 머리에 적는 위반 수 = 지금 점검의 필수+권장(목록의 ❌·⚠️ 줄 수와 같다). */
export const violationCount = (ev: PlanEvaluation): number => ev.hard + ev.soft;
