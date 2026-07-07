/**
 * ══════════════════════════════════════════════════════════════
 *  도메인 데이터 모델 — 이 앱이 다루는 '세계'의 뼈대
 * ══════════════════════════════════════════════════════════════
 *
 * 이 시스템의 모든 일은 한 문장으로 요약된다:
 *
 *     누가  ·  어디서  ·  무엇을 가지고  ·  무슨 일을  ·  언제  한다
 *     Agent    Track      Resource        Activity     (시간표)
 *
 *   예) "김 선생님(Agent)이 · 3학년 2반(Track)에서 · 과학실(Resource)을 써서
 *        · 과학 수업(Activity)을 · 화요일 3교시(시간표)에 한다."
 *
 * 이 '한 줄'이 곧 배치(Assignment)다. '언제'에 해당하는 시간 격자만 시간표
 * 규격(TimetableSpec)이 따로 공급한다. 그래서 구조가 깔끔하게 둘로 갈린다:
 *
 *     [시간 격자 : 언제]  ×  [배치 한 줄 : 나머지 전부]
 *
 * 학교든 병원 교대근무든 당직이든, 이 칸에 무엇을 넣느냐만 바뀔 뿐 뼈대는
 * 그대로다. 그래서 하나의 모델로 여러 현장을 담을 수 있다.
 *
 * ── 파일의 짜임새 (5개 층) ────────────────────────────────────
 *   1. 엔티티     등장인물과 사물      Agent · Track · Resource · Activity
 *   2. 가용성     언제 못 쓰는지        Blackout
 *   3. 시간 격자  '언제'의 틀           Slot · TimetableSpec · Timetable
 *   4. 배치       격자를 채우는 한 줄    Assignment
 *   5. 규칙       배치를 검사하는 도구   Rule…  (보조 도구층)
 *
 * ── 자주 나오는 약속 ──────────────────────────────────────────
 *   id     항목마다 붙는 고유 식별자
 *   name   화면에 보여줄 이름
 *   attr   학교/상황마다 다른 정보를 자유롭게 덧붙이는 칸
 *   ~Date  날짜를 뜻하며 "YYYY-MM-DD" 형식 (예: 2026-05-11)
 *   시각   "HH:mm" 형식 (예: 09:40)
 * ══════════════════════════════════════════════════════════════
 */

// ══════════════════════════════════════════════════════════════
//  1. 엔티티 — 등장인물과 사물
// ══════════════════════════════════════════════════════════════

/**
 * Entity — 아래 네 가지(Agent·Track·Resource·Activity)가 공유하는 공통 뼈대.
 * 넷 다 "고유 id + 이름 + 자유 속성"이라는 같은 모양을 가진다.
 *
 * kind는 '종류 이름표'다. 이게 있어서 사람(Agent)을 장소(Track) 자리에 잘못
 * 넣는 실수를 편집기가 미리 잡아준다. 모양이 같아도 종류가 다르면 못 섞인다.
 */
export interface Entity<K extends string = string> {
    kind: K;                    // 종류 이름표 ('agent' | 'track' | 'resource' | 'activity')
    id: string;                 // 고유 식별자
    name: string;               // 화면에 보여줄 이름
    attr?: Record<string, any>; // 자유 속성 — 학교/상황별 정보를 덧붙이는 칸
}

/**
 * Agent — 배치되는 '사람'. 담임·전담·강사·보조인력을 모두 포함한다.
 * (병원 간호 인력, 당직 근무자에도 그대로 쓰인다.)
 */
export interface Agent extends Entity<'agent'> {}

/**
 * Track — 자기만의 시간표를 갖는 '한 줄(레인)'. 배치가 채워지는 대상이다.
 * 전체 시간표를 나란한 세로줄들로 볼 때 그 한 줄이 Track이다.
 * 학교의 한 반, 병원의 한 병동, 당직표의 한 자리에 해당한다.
 */
export interface Track extends Entity<'track'> {}

/**
 * Resource — 여러 Track이 함께 나눠 쓰는 '시설·장비'. 과학실·체육관·음악실 등.
 * 자기 시간표는 없다. 대신 여러 배치가 같은 시간에 같은 자원을 부르면 '중복 예약'이
 * 되는데, 그걸 걸러내는 기준이 바로 이 Resource다.
 *
 *   ▷ Track과의 차이: 자기 전용 시간표를 '소유'하면 Track,
 *     여러 줄이 '나눠 쓰다 겹치면 문제'가 되면 Resource.
 *     (장소냐 아니냐가 아니라, 전용이냐 공유냐로 나뉜다.)
 */
export interface Resource extends Entity<'resource'> {}

/**
 * Activity — 그 칸에서 '하는 일'의 종류. 통계를 낼 때 묶는 기준이 된다.
 * 학교의 과목(수학·체육), 병원의 근무 유형(주간·야간), 당직의 종류(평일·주말) 등.
 *
 * 왜 그냥 글자가 아니라 별도 항목이냐면 — "수학"을 글자로만 적으면 "수학"/"수 학"처럼
 * 조금씩 다르게 적혀 통계가 흩어진다. 항목(id)으로 두면 "수학 주당 몇 시간",
 * "야간 근무 몇 번"이 정확히 집계된다.
 */
export interface Activity extends Entity<'activity'> {}

// ══════════════════════════════════════════════════════════════
//  2. 가용성 — 언제 누가/무엇을 못 쓰는지
// ══════════════════════════════════════════════════════════════

/** TargetRef — Blackout이 가리키는 대상 하나. "어떤 종류의 어느 항목"인지 짚는다. */
export interface TargetRef {
    kind: 'agent' | 'track' | 'resource'; // 대상 종류 (활동은 막을 수 없으므로 제외)
    id: string;                            // 그 대상의 id
}

/**
 * Blackout — "이 대상은 이 기간 동안 쓸 수 없다"는 차단 한 건.
 * 교사의 연가·출장, 특별실 수리, 공휴일·방학, 행사 표시(운동회)까지 이 하나로 모두 담는다.
 *
 * 무엇을 막는지는 targets(대상 목록)와 mode(해석 방법)의 조합으로 정한다:
 *
 *     targets       mode          뜻
 *     (비어 있음)   only          아무것도 안 막음 = 달력에 표시만 (예: 운동회)
 *     (비어 있음)   all-except    전부 막음 (예: 공휴일·방학)
 *     [김 선생님]   only          그 사람만 막음 (예: 연가·출장)
 *     [과학실]      only          그 자원만 막음 (예: 수리)
 *     [6학년]       all-except    그 대상만 빼고 전부 막음
 *
 * 기간은 날짜로(startDate~endDate), 하루 중 일부만 막을 땐 시각으로(from~to) 정한다.
 * '수업일인지', '오늘이 시간표상 며칠째인지' 같은 건 저장하지 않고 이 정보로 그때그때 계산한다.
 */
export interface Blackout {
    id: string;                  // 고유 식별자
    name: string;                // 이름 ("설날", "운동회", "김 선생님 연가", "과학실 수리")
    startDate: string;           // 시작 날짜 (포함)
    endDate: string;             // 끝 날짜 (포함, 하루면 startDate와 같게)
    from?: string;               // 하루 중 시작 시각 "HH:mm" (생략하면 '종일')
    to?: string;                 // 하루 중 끝 시각 "HH:mm" (생략하면 '종일')
    targets: TargetRef[];        // 대상 목록 (여러 개 지정 가능)
    mode: 'only' | 'all-except'; // targets를 '막을 목록'으로 볼지 / '예외로 풀 목록'으로 볼지
    attr?: Record<string, any>;  // 자유 속성 (사유 등)
}

// ══════════════════════════════════════════════════════════════
//  3. 시간 격자 — '언제'의 틀
// ══════════════════════════════════════════════════════════════

/**
 * Slot — 하루를 잘게 나눈 '한 칸'. 여기에 배치(Assignment)가 들어간다.
 * 학교의 "1교시", 근무의 "오전", 그 사이 "점심·쉬는 시간"까지 모두 슬롯이다.
 */
export interface Slot {
    index: number;       // 하루 안에서 몇 번째 칸인지 (0부터 시작)
    label: string;       // 이름 ("1교시", "점심", "오전 근무")
    start: string;       // 시작 시각 "HH:mm"
    end: string;         // 끝 시각 "HH:mm"
    assignable: boolean; // 배치를 넣을 수 있는 칸인지 (점심·쉬는 시간이면 false)
}

/**
 * TimetableSpec — 시간표의 '빈 격자 틀(규격)'. 아직 배치가 없는, 모양만 정의한 설계도다.
 * 네 가지를 정한다:
 *   1) 며칠마다 반복되나            → cycleDays  (한 주 단위면 7)
 *   2) 그 주기 중 어떤 날 일하나     → activeDays (월~금이면 [0,1,2,3,4])
 *   3) 하루가 언제 시작하고 끝나나   → dayStart, dayEnd
 *   4) 그 하루를 어떤 칸들로 쪼개나  → slots
 */
export interface TimetableSpec {
    id: string;                 // 고유 식별자
    name: string;               // 이름 ("2학기 기본 시간표" 등)

    cycleDays: number;          // 1) 반복 주기 (일 단위). 한 주면 7
    activeDays: number[];       // 2) 주기 중 일하는 날 번호 (0부터). 월~금이면 [0,1,2,3,4]
    dayStart: string;           // 3) 하루 시작 시각 "HH:mm"
    dayEnd: string;             // 3) 하루 끝 시각 "HH:mm"
    slots: Slot[];              // 4) 하루를 나눈 칸들

    attr?: Record<string, any>; // 자유 속성
}

/**
 * Timetable — 위 규격(TimetableSpec)을 '특정 기간에 실제로 적용'한 시간표 한 장.
 * 기본표와 특별표를 따로 만들지 않는다 — 특별표는 그저 '더 짧은 기간 + 더 높은 우선순위'다.
 * 어떤 날짜를 보면, 그 날을 포함하는 시간표들 중 우선순위가 가장 높은 것이 적용된다.
 *
 *   예) 학기 전체를 덮는 '기본표'(우선순위 0) 위에 '운동회 주간'(우선순위 10)을 얹으면,
 *       그 주에는 운동회 주간표가 이긴다.
 */
export interface Timetable {
    id: string;                 // 고유 식별자
    name: string;               // 이름 ("2학기 기본", "운동회 주간")
    specId: string;             // 어떤 규격을 쓰는지 (TimetableSpec.id)
    startDate: string;          // 적용 시작 날짜 (포함)
    endDate: string;            // 적용 끝 날짜 (포함)
    priority: number;           // 우선순위 — 기간이 겹치면 이 값이 큰 쪽이 그 날을 차지
    attr?: Record<string, any>; // 자유 속성
}

// ══════════════════════════════════════════════════════════════
//  4. 배치 — 격자의 칸을 채우는 '한 줄'
// ══════════════════════════════════════════════════════════════

/**
 * Assignment — 배치 한 줄. "어느 시간표의 · 어느 Track의 · 며칠째 · 몇 번째 칸"을 채운다.
 * (맨 위에서 말한 '누가·무엇으로·무슨 일을' 사건 한 줄이 바로 이것이다.)
 *
 * AssignmentBase는 그 공통 뼈대이자 '확장 지점'이다. 지금은 일반 배치(WorkAssignment)
 * 하나뿐이지만, 팀티칭(교사 여럿)이나 칸 잠금 같은 새 형태가 정말 필요해지면 종류(kind)를
 * 가진 새 배치를 만들어 아래 Assignment 묶음에 끼우기만 하면 된다.
 * (한 칸에 여러 배치를 겹쳐 넣는 것도 이 구조로 가능하다.)
 */
export interface AssignmentBase {
    id: string;                 // 고유 식별자
    timetableId: string;        // 어느 시간표에 속하는지 (Timetable.id)
    trackId: string;            // 어느 Track(줄)의 칸인지 (Track.id)
    dayIndex: number;           // 주기 중 며칠째인지 (activeDays 중 하나)
    slotIndex: number;          // 그 날 몇 번째 칸인지 (Slot.index)
    attr?: Record<string, any>; // 자유 속성
}

/** WorkAssignment — 일반 배치(수업·근무). 누가·무슨 일·무엇으로를 담는다. */
export interface WorkAssignment extends AssignmentBase {
    kind: 'work';
    agentId?: string;    // 누가 — 담당하는 사람 (Agent.id)
    activityId?: string; // 무슨 일 — 과목/근무 종류 (Activity.id). 통계의 기준
    resourceId?: string; // 무엇으로 — 특별실 등 (Resource.id)
    label?: string;      // 자유 이름표. 분류가 없는 배치(자율학습 등)나 표시용
}

/** Assignment — 배치의 모든 종류를 아우르는 묶음. (지금은 WorkAssignment 하나) */
export type Assignment = WorkAssignment;

// ══════════════════════════════════════════════════════════════
//  5. 규칙 (보조 도구층) — 배치를 검사해 충돌을 짚어준다
// ──────────────────────────────────────────────────────────────
//  규칙은 위 세계(엔티티·배치)를 '구성'하지 않는다. 이미 짜인 배치를
//  '검사'해 문제를 표시해줄 뿐인 도우미다. 저장되는 건 규칙 설정뿐이고,
//  찾아낸 충돌은 그때그때 계산해 화면에 보여주고 버린다.
// ══════════════════════════════════════════════════════════════

/**
 * ScheduleView — 규칙이 검사할 때 들여다보는 '현재 상태의 사진(읽기 전용)'.
 * 규칙은 여기서 필요한 것만 꺼내 보고, 아무것도 바꾸지 않는다.
 */
export interface ScheduleView {
    timetable: Timetable;               // 검사 대상 시간표
    spec: TimetableSpec;                // 그 시간표의 규격
    assignments: readonly Assignment[]; // 채워진 배치들
    tracks: readonly Track[];
    agents: readonly Agent[];
    resources: readonly Resource[];
    activities: readonly Activity[];
    blackouts: readonly Blackout[];     // 차단 정보 (부재·휴일 등)
}

/** Conflict — 규칙이 찾아낸 '충돌 한 건'. 저장하지 않고 화면에 표시할 때만 쓴다. */
export interface Conflict {
    ruleId: string;                // 어떤 규칙이 찾았는지 (ConflictRule.id)
    message: string;               // 보여줄 메시지 ("과학실이 월 3교시에 두 번 잡혔습니다")
    assignmentIds: string[];       // 관련된 배치들 — 화면에서 함께 강조할 대상
    severity: 'error' | 'warning'; // 심각도 (오류 / 경고)
}

/** ParamValue — 규칙 설정값 하나가 가질 수 있는 값의 종류. */
export type ParamValue = string | number | boolean;

/** RuleParams — 규칙 하나의 설정값 묶음 (설정 이름 → 값). */
export type RuleParams = Record<string, ParamValue>;

/**
 * RuleParam — 템플릿이 열어 두는 '고칠 수 있는 설정' 하나의 설명서.
 * 화면은 이걸 보고 알맞은 입력칸(글자·숫자·체크박스·드롭다운)을 그린다.
 */
export interface RuleParam {
    key: string;                                       // 설정 식별자 (RuleParams의 열쇠)
    label: string;                                     // 화면에 보일 이름 ("검사할 대상")
    type: 'string' | 'number' | 'boolean' | 'select'; // 입력 방식
    options?: string[];                                // select일 때 고를 수 있는 값들
    default: ParamValue;                               // 기본값
}

/**
 * RuleTemplate — 코드로 미리 만들어 두는 '규칙 틀'. 여러 개를 준비해 목록으로 제공한다.
 * 사용자는 이 틀을 골라 이름을 붙이고, 설정 몇 개를 고치고, 켜고 끄면 규칙(ConflictRule)이 된다.
 * 실제 검사 방법(detect)은 코드에 있고, 사용자가 만든 규칙은 순수 정보라 저장할 수 있다.
 */
export interface RuleTemplate {
    id: string;                           // 틀 식별자 ("no-overlap" 등)
    label: string;                        // 틀 이름 ("같은 시간 중복 금지")
    description: string;                  // 무엇을 검사하는지 설명
    params: RuleParam[];                  // 사용자가 고칠 수 있는 설정들
    defaultMessage: string;               // 기본 충돌 메시지
    defaultSeverity: 'error' | 'warning'; // 기본 심각도

    // 검사 방법: 설정값과 현재 상태를 보고 '충돌 묶음들'을 돌려준다.
    // 각 묶음 = 서로 부딪힌 배치 id들. 여기에 이름·메시지를 붙여 Conflict로 만드는 건 실행부가 한다.
    detect(params: RuleParams, view: ScheduleView): string[][];
}

/**
 * ConflictRule — 사용자가 틀(RuleTemplate)을 골라 완성한 '규칙 하나'. 순수 정보라 저장된다.
 * 담는 것: 이름 · 어떤 틀인지(+설정값) · 켜짐 여부 · (선택) 메시지 · (선택) 메모.
 */
export interface ConflictRule {
    id: string;           // 고유 식별자
    templateId: string;   // 어떤 틀을 쓰는지 (RuleTemplate.id)
    name: string;         // 사용자가 붙인 이름
    enabled: boolean;     // 켜짐 / 꺼짐
    params: RuleParams;   // 고친 설정값
    message?: string;     // (선택) 직접 쓴 충돌 메시지 — 없으면 틀의 기본 메시지
    description?: string; // (선택) 메모
}
