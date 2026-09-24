/**
 * ══════════════════════════════════════════════════════════════
 *  저장 스키마(Schema) — 이 앱이 '저장하는' 세계의 뼈대
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
 * ── v2 (2026-09-24) 에서 더해진 세 가지 ───────────────────────
 *   · 얼마나 (Demand)      "김 선생님이 3-2반 과학을 주 3시간" — 시수 목표
 *   · 시각 (Slot.start/end) 학년마다 점심이 달라 '4교시'의 시각이 다르다.
 *                          교사·특별실 겹침은 교시 번호가 아니라 시각으로 본다
 *   · 묶음 (block · cycle)  연강(2시간 붙여서) · 순배(모든 반 1차시 끝나야 2차시)
 *   그리고 칸에 붙는 잠금(pinned · temp) 과 주간 금지칸(WeeklyBlock).
 *
 * ── 파일의 짜임새 ─────────────────────────────────────────────
 *   1. 엔티티     등장인물과 사물      Agent · Track · Resource · Activity
 *   2. 가용성     언제 못 쓰는지        Blackout(날짜) · WeeklyBlock(매주 같은 칸)
 *   3. 시간 격자  '언제'의 틀           Slot · TimetableSpec · Timetable
 *   4. 배치       격자를 채우는 한 줄    Assignment
 *   5. 수요       얼마나 채워야 하나     Demand
 *   6. 규칙       배치를 검사하는 도구   RuleTemplate · ConflictRule · Violation
 *   7. 판         시간표 한 벌의 박제    Board
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
 * kind는 '종류 이름표'다. 사람(Agent)을 장소(Track) 자리에 잘못 넣는 실수를 미리 잡는다.
 */
export interface Entity<K extends string = string> {
    kind: K;                    // 종류 이름표 ('agent' | 'track' | 'resource' | 'activity')
    id: string;                 // 고유 식별자
    name: string;               // 화면에 보여줄 이름
    attr?: Record<string, any>; // 자유 속성 — 학교/상황별 정보를 덧붙이는 칸 (color 등)
}

/**
 * Agent — 배치되는 '사람'. 담임·전담·강사·보조인력을 모두 포함한다.
 *   tier     우선순위 등급. 1=보직(부장) 2=일반 전담 3=지원인력(스포츠강사·원어민).
 *            소프트 규칙(회피 등)의 가중치에만 쓰고, 하드 규칙과는 무관하다.
 *   coteach  '혼자서는 수업을 못 하는' 보조 인력(스포츠강사·원어민). 담임이 함께 들어간다.
 *   role     '담임' | '전담' | '비교과' — 화면 분류·보결 후보 등급에 쓴다
 */
export interface Agent extends Entity<'agent'> {
    tier?: 1 | 2 | 3;
    coteach?: boolean;
    role?: '담임' | '전담' | '비교과';
    homeroomTrackId?: string;   // 담임이면 맡은 반
}

/**
 * Track — 자기만의 시간표를 갖는 '한 줄(레인)'. 학교의 한 반.
 *   specId  이 반이 쓰는 시간 규격 (학년마다 교시 수·점심 시각이 다르므로 규격이 갈린다)
 *   grade   학년 (1~6). 순배·점심·하교 같은 학년 단위 규칙이 이 값으로 묶는다
 */
export interface Track extends Entity<'track'> {
    specId?: string;
    grade?: number;
}

/**
 * Resource — 여러 Track이 함께 나눠 쓰는 '시설·장비'. 과학실·체육관·음악실 등.
 *   capacity     같은 시각에 몇 반까지 들어가나 (과학실 2개면 2). 생략하면 1
 *   activityIds  이 시설을 쓰는 과목들 (비어 있으면 아무 과목이나)
 */
export interface Resource extends Entity<'resource'> {
    capacity?: number;
    activityIds?: string[];
}

/** Activity — 그 칸에서 '하는 일'의 종류(과목). 통계를 낼 때 묶는 기준이 된다. */
export interface Activity extends Entity<'activity'> {}

// ══════════════════════════════════════════════════════════════
//  2. 가용성 — 언제 누가/무엇을 못 쓰는지
// ══════════════════════════════════════════════════════════════

/** TargetRef — 차단이 가리키는 대상 하나. "어떤 종류의 어느 항목"인지 짚는다. */
export interface TargetRef {
    kind: 'agent' | 'track' | 'resource';
    id: string;
}

/**
 * Blackout — "이 대상은 이 날짜(기간) 동안 쓸 수 없다". 연가·출장·수리·공휴일·행사.
 * 날짜가 붙는 차단이다. 매주 반복되는 것은 아래 WeeklyBlock을 쓴다.
 *
 *     targets       mode          뜻
 *     (비어 있음)   only          아무것도 안 막음 = 달력에 표시만 (운동회)
 *     (비어 있음)   all-except    전부 막음 (공휴일·방학)
 *     [김 선생님]   only          그 사람만 막음 (연가·출장)
 *     [6학년]       all-except    그 대상만 빼고 전부 막음
 */
export interface Blackout {
    id: string;
    name: string;
    startDate: string;           // 시작 날짜 (포함)
    endDate: string;             // 끝 날짜 (포함)
    from?: string;               // 하루 중 시작 시각 "HH:mm" (생략하면 종일)
    to?: string;
    targets: TargetRef[];
    mode: 'only' | 'all-except';
    attr?: Record<string, any>;
}

/**
 * WeeklyBlock — "매주 이 요일 이 칸은 이 대상에게 안 된다". 시간표를 짤 때 쓰는 금지칸.
 * 컴시간의 배정금지·회피·임시금지가 이것 하나다:
 *   soft 없음   → 배정금지 (하드). 부장회의·원어민 타교 출강일·특별실 방과후
 *   soft: true  → 회피 선호 (소프트). 가급적 피하되 어쩔 수 없으면 넣는다
 *   temp: true  → 임시금지. 짜는 동안만 막아 두고 나중에 한꺼번에 푼다
 * slotIndex를 생략하면 그 요일 종일.
 * targets가 비어 있으면 '모두'(예: 수요일 4교시 동아리 — 전 학년 고정 블록).
 * ⚠️ slotIndex는 대상의 규격 기준 교시다. 교사처럼 규격이 없는 대상은 from/to(시각)로 적는다.
 */
export interface WeeklyBlock {
    id: string;
    name: string;
    dayIndex: number;            // 0=월 … 4=금
    slotIndex?: number;          // 생략하면 종일 (반·특별실처럼 규격이 있는 대상)
    from?: string;               // 교사처럼 규격이 없는 대상은 시각으로 "HH:mm"
    to?: string;
    targets: TargetRef[];
    soft?: boolean;
    temp?: boolean;
    attr?: Record<string, any>;
}

// ══════════════════════════════════════════════════════════════
//  3. 시간 격자 — '언제'의 틀
// ══════════════════════════════════════════════════════════════

/**
 * Slot — 하루를 잘게 나눈 '한 칸'. 여기에 배치(Assignment)가 들어간다.
 * ⭐ start/end 가 '시각 모델'이다. 3학년 4교시(11:30)와 5학년 5교시(11:30)는
 *    교시 번호는 달라도 시각이 같으니 같은 교사가 둘 다 들어갈 수 없다.
 *    점심 칸도 슬롯이다(assignable: false) — 학년마다 점심 위치가 다르면 규격이 다르다.
 */
export interface Slot {
    index: number;       // 하루 안에서 몇 번째 칸인지 (0부터)
    label: string;       // "1교시", "점심"
    start: string;       // "HH:mm"
    end: string;         // "HH:mm"
    assignable: boolean; // 수업을 넣을 수 있는 칸인지 (점심·쉬는 시간이면 false)
    kind?: 'lesson' | 'lunch' | 'break' | 'other'; // 점심 칸을 규칙이 찾을 때 쓴다
}

/**
 * TimetableSpec — 시간표의 '빈 격자 틀(규격)'. 학년군마다 하나씩 둔다(1·2학년 / 3·4 / 5·6).
 */
export interface TimetableSpec {
    id: string;
    name: string;               // "1·2학년 규격"
    cycleDays: number;          // 반복 주기 (한 주면 7)
    activeDays: number[];       // 주기 중 수업하는 날 (월~금이면 [0,1,2,3,4])
    dayStart: string;
    dayEnd: string;
    slots: Slot[];
    /** 요일마다 수업 교시 수가 다르면 여기에 (예: 1학년 월·금은 4교시까지 → {0:4, 4:4}). 값은 '수업 칸 수' */
    lessonsPerDay?: Record<number, number>;
    attr?: Record<string, any>;
}

/**
 * Timetable — 규격을 '특정 기간에 실제로 적용'한 시간표 한 장.
 * 특별표는 '더 짧은 기간 + 더 높은 우선순위'다. 겹치면 priority가 큰 쪽이 이긴다.
 */
export interface Timetable {
    id: string;
    name: string;
    specId: string;
    startDate: string;
    endDate: string;
    priority: number;
    attr?: Record<string, any>;
}

// ══════════════════════════════════════════════════════════════
//  4. 배치 — 격자의 칸을 채우는 '한 줄'
// ══════════════════════════════════════════════════════════════

export interface AssignmentBase {
    id: string;
    timetableId: string;
    trackId: string;
    dayIndex: number;
    slotIndex: number;
    attr?: Record<string, any>;
}

/**
 * WorkAssignment — 일반 배치(수업). 누가·무슨 일·무엇으로를 담는다.
 *   demandId  어느 수요(시수 목표)를 채우는 배치인지. 솔버가 만든 배치엔 항상 있다
 *   seq       그 수요 안에서 몇 번째(차시)인지 1부터. 순배 검사가 이 순서를 본다
 *   blockId   연강 묶음 id. 같은 값을 가진 배치들은 같은 날 연속 칸에 있어야 한다
 *   pinned    이동금지 — 사람이 손으로 박아 둔 칸. 솔버가 옮기지 않는다
 *   temp      임시 표시 — 짜는 동안만 잠가 두는 것
 *   fixed     고정 수업(담임 국·수, 창체, 동아리). 전담 배치 대상이 아니고 칸만 먹는다
 */
export interface WorkAssignment extends AssignmentBase {
    kind: 'work';
    agentId?: string;
    activityId?: string;
    resourceId?: string;
    label?: string;
    demandId?: string;
    seq?: number;
    blockId?: string;
    pinned?: boolean;
    temp?: boolean;
    fixed?: boolean;
}

export type Assignment = WorkAssignment;

// ══════════════════════════════════════════════════════════════
//  5. 수요 — '얼마나' 채워야 하나 (시수 목표)
// ══════════════════════════════════════════════════════════════

/**
 * Demand — "이 교사가 · 이 반에 · 이 과목을 · 주 N시간". 시간표를 짜는 입력의 본체다.
 * 엑셀 교사별 시수표 한 줄이 곧 Demand 여러 개가 된다(반마다 하나).
 *
 *   count       주당 시수
 *   resourceId  특별실을 쓰면 어느 실인지
 *   roomHours   count 중 특별실을 쓰는 시수. 생략하면 전부, 0이면 안 씀
 *   block       연강 묶음. [2]=4시간 중 2시간만 붙여서, [2,2]=2+2, 없으면 연강 없음
 *   cycle       순배(라운드로빈) 대상. 같은 교사·학년·과목의 모든 반이 1차시를 끝내야 2차시로
 *   fixed       담임 고정수업 등 '전담이 아닌' 칸 먹기용 수요 (솔버가 배치하되 검사만 다르게)
 */
export interface Demand {
    id: string;
    agentId: string;
    trackId: string;
    activityId: string;
    count: number;
    resourceId?: string;
    roomHours?: number;
    block?: number[];
    cycle?: boolean;
    fixed?: boolean;
    attr?: Record<string, any>;
}

// ══════════════════════════════════════════════════════════════
//  6. 규칙 — 배치를 검사해 문제를 짚어준다
// ──────────────────────────────────────────────────────────────
//  규칙은 세계를 '구성'하지 않는다. 짜인 배치를 '검사'해 문제를 표시할 뿐이다.
//  저장되는 건 규칙 설정(ConflictRule)뿐이고, 찾아낸 위반(Violation)은
//  그때그때 계산해 화면에 보여주고 버린다.
//
//  하드(hard)  깨지면 시간표가 '틀린' 게 아니라 '성립을 안 하는' 것. 이동 실행을 막는다
//  소프트(soft) 숫자로 보여주고 사람이 고른다. 묶음(bucket)과 교사 tier로 가중한다
// ══════════════════════════════════════════════════════════════

export type ParamValue = string | number | boolean;
export type RuleParams = Record<string, ParamValue>;

export interface RuleParam {
    key: string;
    label: string;
    type: 'string' | 'number' | 'boolean' | 'select';
    options?: string[];
    default: ParamValue;
    help?: string; // ⓘ 로 보여줄 한 줄 설명
}

/** 소프트 규칙의 무게 묶음. 컴시간·선생님 코드가 둘 다 3단이다. */
export type RuleBucket = 'essential' | 'important' | 'preferred';

/**
 * Violation — 규칙이 찾아낸 '문제 한 건'. 저장하지 않는다.
 *   fixable  사람이 손으로 고칠 여지가 있는가. false면 '어쩔 수 없는 것'이라
 *            [문제점만 보기]에서 숨긴다 (컴시간의 그 규칙)
 *   subject  누구/무엇의 문제인가 — 진단 화면이 "교사 3명"처럼 셀 때 쓴다
 *   cells    배치가 없는 빈 칸이 문제일 때(식사 슬롯 없음 등) 가리킬 칸들
 */
export interface Violation {
    ruleId: string;
    templateId: string;
    kind: 'hard' | 'soft';
    message: string;
    assignmentIds: string[];
    cells?: { trackId?: string; agentId?: string; dayIndex: number; slotIndex: number }[];
    subject?: TargetRef;
    weight: number;     // 소프트 벌점 (하드는 0)
    fixable: boolean;
}

/**
 * RuleTemplate — 코드로 미리 만들어 두는 '규칙 틀'. 사용자는 이 틀을 골라 설정을 고치고 켠다.
 * 실제 검사 방법(evaluate)은 코드에 있고, 사용자가 만든 규칙(ConflictRule)은 순수 정보라 저장된다.
 * ctx의 실제 모양은 engine/api.ts 의 EngineContext 다 (여기서는 규칙이 '무엇을 받나'만 약속한다).
 */
export interface RuleTemplate<Ctx = unknown> {
    id: string;                 // "no-overlap-agent"
    label: string;              // "교사 겹침 금지"
    description: string;        // 무엇을 검사하나 (선생님도 읽히게)
    kind: 'hard' | 'soft';
    bucket?: RuleBucket;        // 소프트만
    params: RuleParam[];
    defaultMessage: string;
    evaluate(params: RuleParams, ctx: Ctx): Violation[];
}

/** ConflictRule — 사용자가 틀을 골라 완성한 '규칙 하나'. 저장된다. */
export interface ConflictRule {
    id: string;
    templateId: string;
    name: string;
    enabled: boolean;
    params: RuleParams;
    message?: string;
    description?: string;
}

// ══════════════════════════════════════════════════════════════
//  7. 판 — 시간표 한 벌을 통째로 박제한 것
// ══════════════════════════════════════════════════════════════

/**
 * Board — "이 시점의 배치 전부"를 이름 붙여 저장한 것. 컴시간의 [작업저장]·[작업열람].
 * 여러 판을 놓고 비교한 뒤 하나를 공개본(published)으로 고른다.
 * 자동 스냅샷(auto: true)은 조정할 때마다 쌓이는 작업기록이다.
 */
export interface Board {
    id: string;
    name: string;
    createdAt: string;          // ISO 시각
    assignments: Assignment[];
    note?: string;
    auto?: boolean;
    published?: boolean;
    score?: { hard: number; soft: number }; // 저장 당시 점수 (표시용)
}

// ══════════════════════════════════════════════════════════════
//  8. 학교 메타 — 파일 하나가 학교 하나다
// ══════════════════════════════════════════════════════════════

export interface SchoolMeta {
    name: string;               // "고성초등학교"
    term: string;               // "2026학년도 2학기"
    schemaVersion: 2;
    updatedAt?: string;
}
