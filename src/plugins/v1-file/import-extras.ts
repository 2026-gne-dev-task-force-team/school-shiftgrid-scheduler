/**
 * F10b 가져올 때 정본에 칸이 없던 것을 편성 쪽에 담는다 — 따로 둘 것(extras-store)은 저장하고, 배치는 편성안 약속(savePlan)으로 담는다.
 *   정본 쓰기(importV1 이 낸 writes 를 정본 약속으로 쓰는 일)는 가져오기 화면 몫이다 — 여기는 그 뒤에 부른다.
 */
import type { PluginHost } from '../../pane-ui-system/plugin';
import type { Plans } from '../timetable-plans/contracts/plans';
import type { Solver, SolverInput } from '../timetable-solver/contracts/solver';
import type { V1ImportResult } from './import-v1';
import { extractExtras } from './extras';
import { saveExtras } from './extras-store';

export interface SavedExtras { planId: string; placed: number; kept: number; savedOk: boolean }

export async function saveImportExtras(
    host: Pick<PluginHost, 'store'>,
    doc: SolverInput,
    result: Pick<V1ImportResult, 'writes'>,
    mods: { solver: Pick<Solver, 'toWeekday'>; plans: Pick<Plans, 'savePlan'> | null },
    planName: string,
): Promise<SavedExtras> {
    const homeroomOf = (classId: string) =>
        result.writes.staff.find((s) => s.kind === 'homeroom' && s.homeroomClassIds?.includes(classId))?.id;
    const { extras, plan } = extractExtras(doc, mods, homeroomOf, planName);
    // 편성안을 못 담으면(편성안 조각 꺼짐) planId 가 '' — 부른 쪽이 「배치는 안 담김」을 알린다(배치 원본은 불러온 파일에 그대로 있다).
    const planId = plan && mods.plans ? mods.plans.savePlan(plan) : '';
    const savedOk = await saveExtras(host, extras);
    return { planId, placed: planId ? (plan?.placements.length ?? 0) : 0, kept: extras.extraAssignments.length, savedOk };
}
