/**
 * Agent — 시간표에 배치되는 '사람'. 교사·전담·강사·보조인력을 아우른다.
 * 학교마다 필요한 정보가 달라, 고정 필드는 최소로 두고 나머지는 attr로 확장한다.
 * (당직 근무자·간호 인력 등 어떤 배치 대상에도 그대로 쓰인다.)
 */
export interface Agent {
    id: string;                 // UUID 식별자
    name: string;               // 표시 이름 (교사·강사 등)
    attr: Record<string, any>;  // 커스텀 속성 (교사 유형, 담당 학년 등)
}

/**
 * Track — 고유한 시간표를 갖는 '레인' 하나. 에이전트가 배치되어 일하는 대상.
 * 전체 시간표를 나란한 세로줄로 볼 때 그 한 줄에 해당한다.
 * 학교에선 한 반, 당직에선 당직 자리, 간호에선 근무 스테이션.
 */
export interface Track {
    id: string;                 // UUID 식별자
    name: string;               // 표시 이름 (반·당직 자리 등)
    attr: Record<string, any>;  // 커스텀 속성 (학년 등)
}

/**
 * Absence — 에이전트 1명이 '특정 날짜의 특정 시간대'에 자리를 비운다는 사실.
 *
 * 근태가 필요한 이유는 단 하나: 그날 '땜방(보결)'이 필요/가능한지 판정하는 것.
 * 그래서 기록의 존재 자체가 "이 시간대에 부재"를 뜻하고, 로직은 [from, to]만 본다.
 * (부재 없는 날은 기록도 없음. 하루 종일 부재면 근무 시간 전체를 구간으로.)
 */
export interface Absence {
    id: string;                 // UUID 식별자
    agentId: string;            // 대상 에이전트 (Agent.id)
    date: string;               // 날짜 "YYYY-MM-DD"
    from: string;               // 부재 시작 "HH:mm" (필수)
    to: string;                 // 부재 종료 "HH:mm" (필수)
    attr?: Record<string, any>; // 사유 등 표시용 속성
}

/**
 * Slot — 하루를 쪼갠 한 '빈 칸'의 규격. 여기에 Assignment가 채워진다.
 * 학교의 "1교시", 근무의 "오전 근무", 그 사이 "점심·쉬는시간"까지 모두 슬롯.
 */
export interface Slot {
    index: number;              // 하루 안에서의 순서 (0-based)
    label: string;              // 표시명 ("1교시", "점심", "오전 근무" 등)
    start: string;              // 시작 "HH:mm"
    end: string;                // 종료 "HH:mm"
    assignable: boolean;        // 배치 가능 여부 (점심·쉬는시간 = false)
}

/**
 * TimetableSpec — 시간표의 '규격'. 실제 배치(Assignment) 없이 빈 격자 구조만 정의한다.
 *   1) 일주기   : 며칠 단위로 반복되나
 *   2) 일 패턴  : 주기 안에서 어떤 날이 근무일인가
 *   3) 하루 범위 : 하루가 언제 시작하고 끝나나
 *   4) 분할 패턴 : 그 범위를 어떤 슬롯들로 쪼개나 (= Assignment를 끼울 빈 칸)
 */
export interface TimetableSpec {
    id: string;                 // UUID 식별자
    name: string;               // 표시 이름 ("2학기 기본 시간표" 등)

    cycleDays: number;          // 1) 일주기 — 반복 주기(일). 주간이면 7
    activeDays: number[];       // 2) 일 패턴 — 주기 내 근무일 인덱스(0-based). 월~금이면 [0,1,2,3,4]

    dayStart: string;           // 3) 하루 시작 "HH:mm"
    dayEnd: string;             // 3) 하루 종료 "HH:mm"

    slots: Slot[];              // 4) [dayStart, dayEnd]를 쪼갠 빈 칸들

    attr?: Record<string, any>; // 커스텀 속성
}

/**
 * Assignment — 격자의 한 칸(어느 Track의, 주기 몇째 날, 몇 번째 슬롯)을 채우는 배치.
 * `kind`로 분화해 다양한 배치 형태를 표현한다 (discriminated union).
 * 새 형태가 필요하면 kind를 가진 인터페이스를 추가해 union에 넣는다.
 */
export interface AssignmentBase {
    id: string;                 // UUID 식별자
    trackId: string;            // 어느 Track의 시간표인지 (Track.id)
    dayIndex: number;           // 주기 내 날짜 인덱스 (activeDays 중 하나)
    slotIndex: number;          // 칸 위치 (Slot.index)
    attr?: Record<string, any>; // 커스텀 속성
}

/** WorkAssignment — 일반 배치(수업·근무). 담당 에이전트와 (선택) 특별실 등 자원. */
export interface WorkAssignment extends AssignmentBase {
    kind: 'work';
    agentId?: string;           // 담당 에이전트 (Agent.id)
    resourceId?: string;        // 특별실 등 자원
    label?: string;             // 표시명 ("수학", "당직" 등)
}

/** BlockedAssignment — 배치 차단. 쓸 수 없는 칸 (도움반 국·수 고정 시간, 예약 불가 등). */
export interface BlockedAssignment extends AssignmentBase {
    kind: 'blocked';
    reason?: string;            // 차단 사유
}

export type Assignment = WorkAssignment | BlockedAssignment;
