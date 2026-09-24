/**
 * ══════════════════════════════════════════════════════════════
 *  엔진 API — 화면이 엔진에게 물을 수 있는 것 전부
 * ══════════════════════════════════════════════════════════════
 *
 * 이 파일은 '계약'이다. 화면(src/ui)·스토어(src/store)는 여기 적힌 함수 서명만 믿고 짠다.
 * 구현은 src/engine/ 아래 다른 파일에 있고, 여기서는 그것을 다시 내보내기만 한다.
 *
 *   ⛔ 서명을 바꾸면 화면이 깨진다. 바꿔야 하면 새 함수를 더하고 옛 것은 남긴다.
 *   ⛔ 엔진은 React·DOM·파일을 모른다. 순수 함수 + Doc 만 다룬다 (Worker 안에서도 돌아야 한다).
 *
 * 무게중심: 엔진은 '판정'만 한다. 옮길지 말지는 사람이 고른다.
 *   - 하드가 깨지는 이동은 previewMove 가 hardBroken=true 로 알려 주고 화면이 버튼을 잠근다
 *   - 소프트는 숫자(전·후)로 보여 준다. 엔진이 사람 대신 결정하지 않는다
 * ══════════════════════════════════════════════════════════════
 */
import type { Doc } from '../types/doc';
import type {
    Agent, Track, Resource, Activity, Assignment, Demand, TimetableSpec, Slot,
    RuleTemplate, Violation, TargetRef, RuleBucket,
} from '../types/schema';

// ──────────────────────────────────────────────── 문맥 (규칙·솔버가 공통으로 쓰는 색인)

/** 한 칸의 시각 범위. "월요일 11:30~12:10" 처럼. 겹침 판정은 이걸로 한다 */
export interface ClockRange { dayIndex: number; startMin: number; endMin: number; }

/**
 * EngineContext — Doc 에서 계산해 낸 조회표 묶음. 규칙 evaluate 가 받는 ctx 가 이것이다.
 * 매번 배열을 훑지 않으려고 미리 만든다. Doc 이 바뀌면 다시 만든다.
 */
export interface EngineContext {
    doc: Doc;
    agents: Map<string, Agent>;
    tracks: Map<string, Track>;
    resources: Map<string, Resource>;
    activities: Map<string, Activity>;
    specs: Map<string, TimetableSpec>;
    demands: Map<string, Demand>;
    assignments: Map<string, Assignment>;
    /** 반이 쓰는 규격 */
    specOfTrack(trackId: string): TimetableSpec | undefined;
    /** 반의 그 요일 수업 칸들 (점심 제외, lessonsPerDay 반영) */
    lessonSlots(trackId: string, dayIndex: number): Slot[];
    /** 한 배치가 차지하는 시각 범위 (반의 규격에서 계산) */
    clockOf(a: Assignment): ClockRange | undefined;
    /** 반·요일·교시 → 그 칸의 배치들 */
    byCell(trackId: string, dayIndex: number, slotIndex: number): Assignment[];
    /** 교사 → 그 요일의 배치들 (시각순) */
    byAgentDay(agentId: string, dayIndex: number): Assignment[];
    /** 시설 → 그 요일의 배치들 */
    byResourceDay(resourceId: string, dayIndex: number): Assignment[];
    /** 수요 → 그 수요를 채우는 배치들 (seq 순) */
    byDemand(demandId: string): Assignment[];
    /** 두 시각 범위가 겹치나 (같은 요일이고 시간이 포개지면 true) */
    overlaps(a: ClockRange, b: ClockRange): boolean;
    /** 이 대상이 이 칸(시각)에 금지돼 있나 — WeeklyBlock(하드만) + 규격 밖 */
    isBlocked(target: TargetRef, clock: ClockRange, trackId?: string): boolean;
    /** 교사 tier 가중치 (소프트 규칙용). 기본 1=3, 2=2, 3=1 */
    tierWeight(agentId: string): number;
    /** 묶음 가중치. essential=100 important=20 preferred=3 */
    bucketWeight(bucket: RuleBucket | undefined): number;
}

export type EngineRule = RuleTemplate<EngineContext>;

// ──────────────────────────────────────────────── 진단 (컴시간 「배정검색」)

export interface RuleDiagnosis {
    ruleId: string;
    templateId: string;
    label: string;
    kind: 'hard' | 'soft';
    bucket?: RuleBucket;
    count: number;          // 위반 건수
    fixableCount: number;   // 그중 사람이 고칠 수 있는 것
    subjectCount: number;   // 관련 교사(대상) 수 — 컴시간이 띄우는 그 숫자
    weight: number;         // 소프트 벌점 합
    violations: Violation[];
}

export interface Diagnosis {
    hardCount: number;
    softWeight: number;
    rules: RuleDiagnosis[];              // 하드 먼저, 그다음 벌점 큰 순
    /** 규칙별로 문제가 있는 요일 (화면이 요일 머리에 색을 칠할 때) */
    daysByRule: Record<string, number[]>;
}

// ──────────────────────────────────────────────── 이동 (컴시간 「배정교시 이동하기」)

export interface CellRef { trackId: string; dayIndex: number; slotIndex: number; }

/** 이동 한 수. from 의 배치를 to 로 옮긴다. to 에 다른 배치가 있으면 맞바꾼다(swap) */
export interface Move { assignmentId: string; to: CellRef; swap?: boolean; }

/** 이동 미리보기 — 옮기기 전에 규칙별로 무엇이 어떻게 변하나 */
export interface MovePreview {
    move: Move;
    hardBroken: boolean;                 // true 면 화면이 [이동 실행]을 잠근다
    hardReasons: string[];               // 왜 안 되나 (문장)
    rows: {                              // 컴시간의 결과표 10칸에 해당
        ruleId: string; label: string; kind: 'hard' | 'soft';
        before: number; after: number; delta: number;
    }[];
    softBefore: number;
    softAfter: number;
    /** 맞바꾸기가 필요하면 그 상대 배치 (연쇄 이동의 첫 고리) */
    displaced?: Assignment;
    /** 이동 후 Doc (실행하면 이걸 그대로 쓰면 된다) */
    after: Doc;
}

/** 어떤 배치를 잡았을 때, 갈 수 있는 칸마다 색을 매긴 것 */
export type CellVerdict = 'ok' | 'soft' | 'hard' | 'occupied' | 'blocked' | 'self';
export interface CellVerdicts { assignmentId: string; cells: Record<string, CellVerdict>; } // key = `${dayIndex}:${slotIndex}` (같은 반 안에서)

// ──────────────────────────────────────────────── 솔버 (자동 배정)

export interface SolveOptions {
    /** 후보 몇 개 만들고 최선을 고를까 (컴시간·선생님 둘 다 best-of-K). 기본 4 */
    candidates?: number;
    /** 후보당 시간 예산 ms. 기본 2000 */
    budgetMs?: number;
    /** 전략 이름 (규칙 코드 → 가중 배수). 생략하면 기본 포트폴리오를 순환 */
    strategy?: string;
    /** 랜덤 씨앗 (같은 값이면 같은 결과 — 시험용) */
    seed?: number;
    /** pinned 된 배치는 건드리지 않는다 (기본 true) */
    keepPinned?: boolean;
    /** 자동 조정 모드: 지금 배치를 최대한 유지하면서 위반만 줄인다 (컴시간 [자동 조정하여라]) */
    adjustOnly?: boolean;
}

export interface SolveProgress { candidate: number; of: number; hard: number; soft: number; elapsedMs: number; }

export interface SolveCandidate {
    label: string;                       // "균형형" · "부장 보호형" · "연강 집중형" · "종합 1위"
    strategy: string;
    hard: number;
    soft: number;
    assignments: Assignment[];
    unplaced: { demandId: string; missing: number }[]; // 못 채운 시수
}

export interface SolveResult {
    best: SolveCandidate;
    candidates: SolveCandidate[];        // 점수순
    elapsedMs: number;
}

// ──────────────────────────────────────────────── 수요 현황 (「시수 배정 현황」 패널)

export interface DemandStatus {
    demandId: string;
    agentId: string; trackId: string; activityId: string;
    need: number; placed: number; remaining: number; // remaining<0 이면 초과
}

// ──────────────────────────────────────────────── 함수 — 여기 적힌 서명이 계약이다
//
//  실물은 ./core 에 있다. 화면은 항상 이 파일(api)에서 가져온다.
//
//  buildContext(doc)                     Doc → 문맥. 수천 배치에 ms 단위. 화면은 useMemo 로 잡아 둔다
//  evaluateAll(doc)                      켜진 규칙 전부를 돌려 위반 목록
//  diagnose(doc)                         배정검색 화면용 집계
//  candidateCells(doc, assignmentId)     어떤 배치를 집었을 때 각 칸의 색
//  previewMove(doc, move)                옮기면 어떻게 되나 (Doc은 안 바뀐다)
//  applyMove(doc, move)                  옮긴다. previewMove(...).after 와 같은 결과
//  demandStatus(doc)                     시수 목표 대비 배치 현황
//  solve(doc, opts?, onProgress?)        자동 배정. 수 초 걸리니 Worker 에서 돌리고 진행을 알린다.
//                                        돌려주는 assignments 는 Doc 에 그대로 넣으면 되는 완성본(fixed·pinned 포함)
//  autoAdjust(doc, opts?, onProgress?)   solve 를 adjustOnly 로 (컴시간 [자동 조정하여라])
//  RULES                                 엔진이 아는 규칙 틀 전부 (규칙 목록·설정 폼이 이걸 그린다)
//  defaultRules()                        새 학교에 기본으로 켜 줄 규칙 묶음 (하드 전부 + 소프트 기본값)
//  makeSpec({...})                       학년별 교시 수·점심 위치로 규격 만들기 (lunchAfter = 몇 교시 뒤 점심)

export type { Doc } from '../types/doc';
export {
    buildContext, evaluateAll, diagnose, candidateCells, previewMove, applyMove,
    demandStatus, solve, autoAdjust, RULES, defaultRules, makeSpec,
} from './core';

export interface MakeSpecInput {
    id: string; name: string; periods: number; lunchAfter: number;
    dayStart?: string; lessonMin?: number; breakMin?: number; lunchMin?: number;
    lessonsPerDay?: Record<number, number>;
}
