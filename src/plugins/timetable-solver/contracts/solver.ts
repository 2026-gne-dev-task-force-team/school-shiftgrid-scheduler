/**
 * 🔴 약속 「solver」 0.1.0 — 자동 편성 엔진의 서명 자리(값 0 · 1.2v 편성기 분해 F1 · 설계 2절 3번 「엔진은 화면이 없다」).
 *   ⛔ 값(const·function) 0 — 실체는 제공자 플러그인 timetable-solver 안(./engine)에 산다. 소비자는 host.modules.use<Solver>('solver') 로 받는다.
 *   ⛔ 엔진 알고리즘은 v1 그대로다(꼴만 옮김) — 정답 1,820 대조(F1b)가 같은 답을 지킨다.
 *
 * ⭐ 편성 입력(SolverInput)
 *   - 지금은 v1 `Doc` 꼴 그대로다(이름만 붙임). 정본 일곱(교직원·학교·과목·방·시간 틀·복무·고정 일정)에서 모아 짓는 일은 F5 몫이다.
 *     F5 가 꼴을 바꿔도 소비자는 이 이름만 쓰므로 import 가 안 바뀐다.
 *
 * ⭐ 요일 — 맞출 틈 하나(설계 3-1 ⚠️)
 *   - 엔진은 `dayIndex` 0=월 … 4=금 을 쓴다. 바깥(timetable-grid 등)은 1=월 … 7=일 을 쓴다.
 *   - 경계에서 toWeekday·toDayIndex 한 쌍으로만 바꾼다(엔진 안은 안 고친다).
 */
import type { Placement } from '../../timetable-plans/contracts/plans';
import type { Doc } from '../types/doc';
import { migrateDoc } from '../types/doc';
import type {
    Assignment, RuleTemplate, TimetableSpec, Violation,
} from '../types/schema';
import type {
    CapacityIssue, CellVerdicts, DemandStatus, Diagnosis, EngineContext, MakeSpecInput,
    Move, MovePreview, SolveOptions, SolveProgress, SolveResult,
} from '../engine/api';

/** 편성 입력 — 엔진이 받는 한 덩어리. 지금은 v1 Doc 꼴(F5 가 정본에서 모아 짓는다). */
export type SolverInput = Doc;

/** 엔진 요일 번호 — 0=월 … 4=금(v1 dayIndex). */
export type SolverDayIndex = number;
/** 바깥 요일 번호 — 1=월 … 7=일(timetable-grid 의 weekday 와 같다). */
export type Weekday = number;

export type {
    CapacityIssue, CellVerdicts, DemandStatus, Diagnosis, EngineContext, MakeSpecInput,
    Move, MovePreview, SolveOptions, SolveProgress, SolveResult,
};

/** 편성안 점검 결과 — evaluate 가 돌려준다. 점수는 높을수록 좋다(100 에서 필수 위반 하나당 10 · 권장 위반 하나당 1 을 깎음, 0 밑 없음). */
export interface PlanEvaluation {
    violations: Violation[];
    /** 어긴 필수 규칙 수 · 어긴 권장 규칙 수. */
    hard: number;
    soft: number;
    score: number;
    diagnosis: Diagnosis;
    /** 수업 요구(시수)별 채움 — remaining>0 모자람 · <0 넘침. */
    demands: DemandStatus[];
}

/** 편성안 점검 결과 — evaluate 가 돌려준다. 점수는 높을수록 좋다(100 에서 필수 위반 하나당 10 · 권장 벌점 합을 깎음, 0 밑 없음). */
export interface PlanEvaluation {
    violations: Violation[];
    /** 어긴 필수 규칙 수 · 어긴 권장 규칙 수. */
    hard: number;
    soft: number;
    score: number;
    diagnosis: Diagnosis;
    /** 수업 요구(시수)별 채움 — remaining>0 모자람 · <0 넘침. */
    demands: DemandStatus[];
}

/** 「solver」 약속 모듈 — 함수 서명만. 뜻은 engine/api.ts 의 함수 목록 주석과 같다. */
export interface Solver {
    readonly version: 1;
    buildContext(input: SolverInput): EngineContext;
    evaluateAll(input: SolverInput): Violation[];
    diagnose(input: SolverInput): Diagnosis;
    /** 편성안 배치(Placement)를 입력에 얹어 위반 목록·점수·진단·시수 채움을 낸다. 입력은 readInput 이 주고 배치만 바뀐다(읽기만). */
    evaluate(input: SolverInput, placements: readonly Placement[]): PlanEvaluation;
    /** 편성안 배치(Placement)를 입력에 얹어 위반 목록·점수·진단·시수 채움을 낸다. 입력은 readInput 이 주고, 배치만 바뀐다(읽기만). */
    evaluate(input: SolverInput, placements: readonly Placement[]): PlanEvaluation;
    demandStatus(input: SolverInput): DemandStatus[];
    candidateCells(input: SolverInput, assignmentId: string): CellVerdicts;
    previewMove(input: SolverInput, move: Move): MovePreview;
    applyMove(input: SolverInput, move: Move): SolverInput;
    solve(input: SolverInput, opts?: SolveOptions, onProgress?: (p: SolveProgress) => void): Promise<SolveResult>;
    autoAdjust(input: SolverInput, opts?: SolveOptions, onProgress?: (p: SolveProgress) => void): Promise<SolveResult>;
    checkCapacity(input: SolverInput): CapacityIssue[];
    readonly RULES: readonly RuleTemplate[];
    defaultRules(): SolverInput['rules'];
    makeSpec(input: MakeSpecInput): TimetableSpec;
    /** 지금 정본(교직원·학교·과목·방·일과표·복무·시수표·막힘)에서 편성 입력을 읽어 짓는다 — 읽기만 한다. 일과표·복무 셈 약속이 꺼져 있으면 null. 손으로 옮기기·편성안 점검·v1 내보내기가 쓴다.
     *   🔴 0.2 — 인자 없음. 정본은 **엔진 자기 host**(자기가 선언한 supports)로 읽는다 — 부른 쪽 host 로 읽으면 부른 쪽이
     *      clock·duty·staff… 를 선언 안 해 「선언 안 한 인터페이스 use」로 던진다(T-10fe). */
    readInput(): SolverInput | null;
    /** v1 파일 글(JSON 으로 읽은 값) → 편성 입력(옛 버전은 올려 준다). v1-file 이 쓴다. */
    migrateDoc(raw: unknown): SolverInput;
    /** 엔진 요일(0=월) → 바깥 요일(1=월). */
    toWeekday(dayIndex: SolverDayIndex): Weekday;
    /** 바깥 요일(1=월) → 엔진 요일(0=월). */
    toDayIndex(weekday: Weekday): SolverDayIndex;
}

// ══════════════════════════════════════════════════════════════
//  F5 — 정본에서 읽은 값 묶음(SolverCanon) → 편성 입력(buildSolverInput)
//  🔴 편성 쪽에 다시 저장하지 않는다 — 아래는 정본 약속에서 「읽은 값」의 꼴일 뿐이다.
// ══════════════════════════════════════════════════════════════

/** 교직원 한 줄 — staff 정본(이름 + 칸 f_kind·f_tier·f_homeroom)에서 읽은 값. */
export interface CanonStaffRow {
    id: string;
    name: string;
    /** f_kind — homeroom(담임)·subject(전담)·nonteaching(비교과)·assistant(보조인력). */
    kind?: string;
    /** f_tier — 1·2·3. */
    tier?: 1 | 2 | 3;
    /** f_homeroom — 담임 반 id(들). */
    homeroomClassIds?: readonly string[];
}

/** 반 한 줄 — school 정본 SchoolClass 에서 읽은 값(필요한 칸만). */
export interface CanonClassRow { id: string; name: string; grade?: number }
/** 과목 한 줄 — subjects 정본. */
export interface CanonSubjectRow { id: string; name: string }
/** 방 한 줄 — rooms 정본. 수용 수는 방 속성(roomProps)에 있으면 싣고, 없으면 엔진 기본(1)을 따른다. */
export interface CanonRoomRow { id: string; name: string; capacity?: number }
/** 일과표 한 줄 — bell 정본 SlotRow 와 같은 꼴(시각 'HH:MM' 그대로 · 변환 없음). */
export interface CanonBellRow {
    kind?: string; period?: number | null; start?: string; end?: string; grades?: string[];
}
/** 복무 한 줄 — duty 정본 DutyRow(사람 id · 날짜 · 종일 · 교시 글자) + 줄 id. */
export interface CanonDutyRow {
    id: string;
    name?: string;
    person?: string | readonly string[] | null;
    start?: string | null;
    end?: string | null;
    allDay?: boolean | null;
    periods?: string | null;
}
/** 수요 한 줄 — 시수표(demand-table) DemandRow 와 같은 꼴(id 참조 셋 + 시수). */
export interface CanonDemandRow { id: string; teacherId?: string; classId?: string; subjectId?: string; hours?: number }

/** 막힘 대상 — 정본 id 로 가리킨다(staff 사람·school 반·rooms 방). */
export interface SolverBlockTarget { kind: 'agent' | 'track' | 'resource'; id: string }

/**
 * 🔴 편성 막힘 한 줄 — 「매주 이 요일 이 칸은 이 대상에게 안 된다」(F0 결정: ops-days 를 넓히지 않고 편성 쪽 새 자료).
 *   요일은 바깥 번호(1=월 … 7=일). 엔진에 넣을 때만 toDayIndex 로 바꾼다 · 토(6)·일(7)은 편성에 안 쓰여 거른다.
 *   slotIndex 는 반 대상에만 · 교사·방 대상은 from/to(시각 'HH:MM').
 */
export interface SolverBlockRow {
    id: string;
    name: string;
    weekday: Weekday;
    slotIndex?: number;
    from?: string;
    to?: string;
    targets: readonly SolverBlockTarget[];
    soft?: boolean;
    temp?: boolean;
}

/** 정본 일곱 + 편성 막힘에서 읽은 값 한 묶음 — buildSolverInput 의 입력. */
export interface SolverCanon {
    school: { name: string; term?: string };
    /** 편성 기간(학기) — timetable-grid 범위에서 읽는다. */
    range: { startDate: string; endDate: string };
    staff: readonly CanonStaffRow[];
    classes: readonly CanonClassRow[];
    subjects: readonly CanonSubjectRow[];
    rooms: readonly CanonRoomRow[];
    bell: readonly CanonBellRow[];
    duty: readonly CanonDutyRow[];
    demands: readonly CanonDemandRow[];
    blocks: readonly SolverBlockRow[];
}

/** 조립하다 걸러 낸 것 — 화면이 「무엇이 비었나」를 그 자리에서 보인다. */
export interface BuildIssue { source: 'demand' | 'duty' | 'block'; id: string; reason: string }

/**
 * 편성 막힘 한 줄 — 정본이 비어 편성이 안 되는 까닭을 선생님 말로. (⛔ 위 「편성 막힘 자료(SolverBlockRow)」와 다른 것 — 그건 「이 칸은 안 된다」는 제약이고 이건 「왜 못 짜나」다.)
 *   stop = 이대로는 편성이 안 됨 · note = 편성은 되지만 알아 둘 것.
 */
export interface PlanBlocker {
    code: string; level: 'stop' | 'note'; message: string;
    /** 고칠 화면 — 화면이 이 뜻을 그 꾸러미 약속의 명령으로 바꿔 「열기」 단추를 단다(없으면 단추 없음). */
    fix?: BlockerFix;
}

/** 막힘을 고치러 가는 화면 — 학교 정보(반)·일과표·교직원·과목·시수표. */
export type BlockerFix = 'school' | 'bell' | 'staff' | 'subjects' | 'demand';

/** 다시-내보내기 — v1 파일 읽기(legacy 구현 그대로). 약속 값 0 원칙의 예외 하나: 구현을 옮기지 않고 가리키기만 한다. */
export { migrateDoc };

/** 배치 한 줄(엔진이 돌려주는 꼴) — 소비자가 이름으로 쓰라고 다시 내보낸다. */
export type SolverAssignment = Assignment;
