/**
 * 🔴 약속 「plans」 0.1.0 — 편성안을 담아 두는 자리의 서명(값 0 · 1.2v 편성기 분해 U20 F6).
 *   ⛔ 값(const·function) 0 — 실체는 제공자 플러그인 timetable-plans 안(./api · ./nodes)에 산다.
 *   자동 편성 화면(timetable-solver)은 host.modules.use<Plans>('plans') 로만 부른다 — 이 조각 내부를 import 하지 않는다.
 *   🔴 안은 정본 항목 **id 로만** 가리킨다(이름·정원 복사 ⛔).
 */
export type { Plan, Placement, PlanSummary, PlanDay } from '../types';
import type { Plan, PlanSummary } from '../types';

/** 편성안 목록 한 줄 — 노드 id + 이름·요약. */
export interface PlanListItem { id: string; name: string; summary: PlanSummary; chosen: boolean }

export interface Plans {
    readonly version: 1;
    /** 편성안 저장 — 새 안으로 맨 위에 담는다. 새 안의 id, 못 담았으면 ''. */
    savePlan(plan: Plan): string;
    /** 담아 둔 편성안 목록(읽기만) — 맨 위가 가장 새 안. */
    listPlans(): PlanListItem[];
    /** 편성안 한 벌(읽기만) — 없으면 null. */
    getPlan(id: string): Plan | null;
    /** 목록이 바뀔 때 부른다. 끄는 함수를 돌려준다. */
    subscribe(fn: () => void): () => void;
}
