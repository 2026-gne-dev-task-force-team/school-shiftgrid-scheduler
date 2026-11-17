/**
 * 편성안(배치 결과) 자료 꼴 — 1.2v 편성기 분해 F7. 편성안 한 벌 = 이름 · 만든 시각 · 배치 목록 · 점수/위반 요약.
 *   🔴 기초 정보(반·과목·교사·방)는 **id 로만** 가리킨다 — 이름·정원을 복사 저장하지 않는다(이름은 보일 때 정본에서 읽는다).
 *   ⛔ 학교 낱말은 이 조각 안에서만 — 격자(timetable-grid)는 글자 칸만 받는다.
 */

/** 요일 — 1=월 … 6=토(격자 GridDay 와 같은 수). */
export type PlanDay = 1 | 2 | 3 | 4 | 5 | 6;

/** 배치 한 칸 — 어느 반이 무슨 요일·몇째 시간에 무슨 과목을 누구와 어느 방에서. 전부 정본 id. */
export interface Placement {
    classId: string;
    day: PlanDay;
    /** 몇째 시간(1부터). */
    period: number;
    subjectId: string;
    teacherId: string;
    /** 특별실 — 없으면 반 교실. */
    roomId?: string;
    /** 고정 수업 — 손으로도 자동으로도 옮기지 않는다. */
    fixed?: boolean;
    /** 잠금 — 사람이 정해 둔 칸이라 옮기지 않는다. */
    pinned?: boolean;
    /** 임시 잠금 — 손보는 동안만 잠가 두는 표시(풀면 다시 옮길 수 있다). */
    temp?: boolean;
}

/** 점수·위반 요약 — 엔진이 낸 숫자를 그대로 적는다(여기서 다시 셈하지 않는다). */
export interface PlanSummary {
    /** 높을수록 좋은 점수(없으면 null). */
    score: number | null;
    /** 반드시 지킬 규칙 위반 수. */
    hardViolations: number;
    /** 되도록 지킬 규칙 위반 수. */
    softViolations: number;
}

/** 편성안 한 벌 — 노드 data 에 그대로 들어간다. */
export interface Plan {
    /** 안 이름(사람이 붙인다). */
    name: string;
    /** 만든 시각 — ISO 글자. */
    madeAt: string;
    placements: Placement[];
    summary: PlanSummary;
    /** 「이 안 고르기」로 고른 안 — 한 번에 하나만 true. */
    chosen?: boolean;
}

/** 정본 id → 보일 이름. 못 찾으면 id 를 그대로 돌려줘도 된다. */
export type LabelOf = (kind: 'class' | 'subject' | 'teacher' | 'room', id: string) => string;
