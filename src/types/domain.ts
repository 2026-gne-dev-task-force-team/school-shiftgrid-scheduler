/**
 * ════════════════════════════════════════════════════════════
 *  도메인 데이터 모델
 * ════════════════════════════════════════════════════════════
 * 이 시스템이 다루는 세계는 하나의 사건(event) 문장으로 압축된다:
 *
 *   "누가(Agent) · 어느 줄에서(Track) · 무엇을 가지고(Resource)
 *    · 무슨 행위를(Activity) · 언제(시간 규격) 한다."
 *
 * WorkAssignment 한 장이 이 튜플 한 줄이고, '언제'만 시간 규격
 * (TimetableSpec/Timetable)이 격자로 공급한다. 구조는 "격자(when) ×
 * 튜플(나머지)"로 갈린다 — 학교든 간호 교대든 당직이든, 튜플 칸에
 * 뭘 꽂느냐만 달라지고 뼈대는 그대로다.
 *
 * Track vs Resource (헷갈리기 쉬운 경계):
 *   Track    = 전용 시간표 한 줄을 '소유'하는 주체 (반·병동·당직 라인)
 *   Resource = 여러 Track이 공유하며 '경합'하는 것 (특별실·장비)
 *   기준은 장소냐 아니냐가 아니라 '전용 칼럼이냐 vs 공유·경합이냐'.
 *
 * 규칙(ConflictRule 등)은 이 튜플들을 '검증'하는 보조 도구 층이지
 * 세계를 구성하는 요소가 아니다. 배치 도우미·가능 인원 탐색과 함께
 * helper 레이어에서 논다.
 * ════════════════════════════════════════════════════════════
 */

/**
 * Entity — 배치에 참조되는 'named 엔티티'의 공통 골격.
 * Agent(사람)·Track(레인)·Resource(시설물)·Activity(활동)가 이 모양을 공유한다.
 * `kind` 태그로 서로 대입되는 실수를 막는다 (구조적 타이핑 차단).
 * 고정 필드는 최소로 두고, 학교/도메인별 정보는 attr로 자유롭게 확장한다.
 */
export interface Entity<K extends string = string> {
    kind: K;                    // 종류 태그 ('agent' | 'track' | 'resource')
    id: string;                 // UUID 식별자
    name: string;               // 표시 이름
    attr: Record<string, any>;  // 커스텀 속성
}

/**
 * Agent — 시간표에 배치되는 '사람'. 교사·전담·강사·보조인력을 아우른다.
 * (당직 근무자·간호 인력 등 어떤 배치 대상에도 그대로 쓰인다.)
 */
export interface Agent extends Entity<'agent'> {}

/**
 * Track — 고유한 시간표를 갖는 '레인' 하나. 에이전트가 배치되어 일하는 대상.
 * 전체 시간표를 나란한 세로줄로 볼 때 그 한 줄에 해당한다.
 * 학교에선 한 반, 당직에선 당직 자리, 간호에선 근무 스테이션.
 */
export interface Track extends Entity<'track'> {}

/**
 * Resource — 배치에 함께 묶이는 '시설물·자원'. 특별실(과학실·체육관·음악실), 장비 등.
 * 스스로 시간표를 갖지 않는다. 언제 점유되는지는 이 자원을 참조한 Assignment들로 결정되고,
 * 같은 (dayIndex, slotIndex)에서 한 자원이 두 번 쓰이면 중복 예약 — 이게 중복 방지 판정의 근거다.
 */
export interface Resource extends Entity<'resource'> {}

/**
 * Activity — 배치의 '내용' 분류. 그 칸에서 수행되는 일의 종류이자 집계 축.
 * 학교의 과목(수학·체육), 간호의 근무 유형(주간·야간), 당직의 종류(일직·주말) 등.
 * 자유 문자열(label) 대신 엔티티로 두어야 반·인원·종류별 통계가 정확해진다
 * (같은 '수학'/'야간'이 오타·표기 차이로 흩어지지 않음).
 */
export interface Activity extends Entity<'activity'> {}

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
 * CalendarEvent — 학사일정의 '특이 날짜' 하나. 순수 데이터(저장 대상).
 * '수업일 여부'나 '날짜 → 주기 인덱스(dayIndex)' 매핑은 저장하지 않는다 —
 * 이 데이터와 Timetable/Spec을 근거로 필요할 때 계산(유도)한다.
 */
export interface CalendarEvent {
    id: string;                 // UUID 식별자
    name: string;               // "설날", "개교기념일", "여름방학", "운동회" 등
    startDate: string;          // 시작 "YYYY-MM-DD" (포함)
    endDate: string;            // 종료 "YYYY-MM-DD" (포함, 하루면 startDate와 동일)
    off: boolean;               // true=수업 없는 날(공휴일·방학·휴업일) / false=수업은 하되 일정만 표시(운동회 등)
    attr?: Record<string, any>; // 커스텀 속성
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
 * Timetable — 특정 기간에 특정 규격을 입혀 실제로 굴러가는 시간표 한 장.
 * '기본'과 '특별'을 타입으로 나누지 않는다 — 특별 시간표 = 더 좁은 기간 + 더 높은 priority.
 * 어떤 날짜를 조회하면, 그 날짜를 품는 Timetable들 중 priority가 가장 높은 것이 이긴다.
 * (예: 학기 전체를 덮는 '기본'(priority 0) 위에 '운동회 주간'(priority 10)이 그 주만 덮어씀.)
 */
export interface Timetable {
    id: string;                 // UUID 식별자
    name: string;               // 표시 이름 ("2학기 기본", "운동회 주간" 등)
    specId: string;             // 적용할 규격 (TimetableSpec.id)
    startDate: string;          // 적용 시작 "YYYY-MM-DD" (포함)
    endDate: string;            // 적용 종료 "YYYY-MM-DD" (포함)
    priority: number;           // 높을수록 우선. 기간이 겹치면 이 값이 큰 쪽이 그날을 차지
    attr?: Record<string, any>; // 커스텀 속성
}

/**
 * Assignment — 어느 Timetable의, 어느 Track의, 주기 몇째 날, 몇 번째 슬롯을 채우는 배치.
 * `kind`로 분화하는 discriminated union의 베이스이자 확장점.
 * 지금은 1:1:1(에이전트·활동·자원) WorkAssignment 하나뿐 — 팀티칭(에이전트 여럿)이나
 * 차단(빈 칸 잠금) 같은 새 형태가 정말 필요해지면 그때 kind를 가진 인터페이스를
 * 추가해 이 union만 갈아끼우면 된다. (한 칸에 여러 배치를 쌓는 것도 여기서 열림.)
 */
export interface AssignmentBase {
    id: string;                 // UUID 식별자
    timetableId: string;        // 어느 Timetable에 속하는지 (Timetable.id)
    trackId: string;            // 어느 Track의 칸인지 (Track.id)
    dayIndex: number;           // 주기 내 날짜 인덱스 (activeDays 중 하나)
    slotIndex: number;          // 칸 위치 (Slot.index)
    attr?: Record<string, any>; // 커스텀 속성
}

/** WorkAssignment — 일반 배치(수업·근무). 담당 에이전트·활동과 (선택) 특별실 등 자원. */
export interface WorkAssignment extends AssignmentBase {
    kind: 'work';
    agentId?: string;           // 담당 에이전트 (Agent.id)
    activityId?: string;        // 활동/과목 (Activity.id) — 집계용. 분류 개념이 있으면 이걸 사용
    resourceId?: string;        // 특별실 등 자원 (Resource.id)
    label?: string;             // 자유 표시명. 분류가 없는 배치(자율학습 등)나 표시 override용
}

export type Assignment = WorkAssignment;

/**
 * ScheduleView — 충돌 규칙이 들여다보는 현재 시간표 상태의 읽기 전용 스냅샷.
 * 규칙은 여기서 필요한 것만 골라 검사한다 (아무것도 수정하지 않는다).
 */
export interface ScheduleView {
    timetable: Timetable;
    spec: TimetableSpec;
    assignments: readonly Assignment[];
    tracks: readonly Track[];
    agents: readonly Agent[];
    resources: readonly Resource[];
    activities: readonly Activity[];
    absences: readonly Absence[];
}

/**
 * Conflict — 규칙이 잡아낸 충돌 하나. 계산 결과일 뿐 저장하지 않는다(휘발성).
 * 화면에 표시(하이라이트)할 때만 쓰인다.
 */
export interface Conflict {
    ruleId: string;                   // 이 충돌을 잡아낸 규칙 (ConflictRule.id)
    message: string;                  // 표시 메시지 ("과학실이 월 3교시에 2번 예약됨")
    assignmentIds: string[];          // 연루된 배치들 → 화면에서 강조할 대상
    severity: 'error' | 'warning';    // 심각도
}

/** 파라미터 값 — 사용자가 수정하는 값. */
export type ParamValue = string | number | boolean;

/** 규칙 인스턴스가 담는 파라미터 값 묶음 (key → 값). */
export type RuleParams = Record<string, ParamValue>;

/**
 * RuleParam — 템플릿이 노출하는 '수정 가능한 파라미터' 하나의 명세.
 * UI는 이걸 보고 입력칸(텍스트·숫자·체크박스·드롭다운)을 그린다.
 */
export interface RuleParam {
    key: string;                      // 파라미터 식별자 (RuleParams의 키)
    label: string;                    // 표시 이름 ("검사할 필드")
    type: 'string' | 'number' | 'boolean' | 'select';
    options?: string[];               // type === 'select'일 때 선택지
    default: ParamValue;              // 기본값
}

/**
 * RuleTemplate — 코드로 미리 제공하는 '제약 블록 템플릿'. 여러 개를 만들어 레지스트리에 둔다.
 * 사용자는 이걸 골라 이름을 붙이고, 파라미터 몇 개를 수정하고, 토글해 규칙(ConflictRule)을 만든다.
 * 판정 로직(detect)은 코드에 있고, 사용자가 만든 인스턴스는 순수 데이터라 저장할 수 있다.
 */
export interface RuleTemplate {
    id: string;                       // 템플릿 식별자 ("no-overlap" 등)
    label: string;                    // 템플릿 이름 ("같은 시간 중복 금지")
    description: string;              // 무엇을 검사하는지 설명
    params: RuleParam[];              // 사용자가 수정할 파라미터 명세
    defaultMessage: string;           // 기본 충돌 메시지
    defaultSeverity: 'error' | 'warning';
    // 판정: 파라미터 값과 현재 상태를 보고 '충돌 그룹'들을 반환한다.
    // 각 그룹 = 서로 충돌하는 assignmentId 목록. 엔진이 이름·메시지를 붙여 Conflict로 만든다.
    detect(params: RuleParams, view: ScheduleView): string[][];
}

/**
 * ConflictRule — 사용자가 템플릿을 구성한 '규칙 인스턴스'. 순수 데이터(저장 가능).
 * 이름·토글·파라미터 값만 담고, 판정 로직은 templateId가 가리키는 RuleTemplate가 갖는다.
 * 명세 = 이름 · 충돌조건(templateId+params) · 충돌메시지 · 토글 · 설명.
 */
export interface ConflictRule {
    id: string;                       // UUID 식별자
    templateId: string;               // 어떤 RuleTemplate 기반인지 (RuleTemplate.id)
    name: string;                     // 사용자가 붙인 이름
    enabled: boolean;                 // 토글
    params: RuleParams;               // 수정한 파라미터 값
    message?: string;                 // 커스텀 충돌 메시지 (없으면 템플릿 defaultMessage)
    description?: string;             // 사용자 메모
}
