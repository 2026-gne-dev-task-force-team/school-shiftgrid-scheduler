/**
 * 손으로 옮기기 순수 셈 — 편성안 배치 ↔ 엔진 입력 · 갈 수 있는 칸 · 옮기기 전 미리보기 · 옮기기 · 잠금.
 *   🔴 이동 판정은 엔진(약속 solver)이 한다 — 여기선 부르기만 한다(⛔ 엔진 알고리즘 다시 짜기 · ⛔ 남의 조각 값 import).
 *   🔴 바뀌는 건 편성안 배치(Placement)뿐이다 — 기초 정보(반·과목·교사·방)는 id 로만 가리키고 다시 저장하지 않는다.
 *   저장·화면을 모른다(저장은 nodes.replacePlan · 화면은 views/HandMove).
 */
import type { Solver, SolverInput, SolverAssignment, Move } from '../timetable-solver/contracts/solver';
import type { Placement, Plan, PlanDay } from './types';

/** 칸 열쇠 — 반|요일|몇째 시간. */
export const placementKey = (p: Pick<Placement, 'classId' | 'day' | 'period'>): string => `${p.classId}|${p.day}|${p.period}`;

/** 갈 수 있나 — 엔진의 판정 여섯 가지. */
export type Verdict = 'ok' | 'soft' | 'hard' | 'occupied' | 'blocked' | 'self';

/** 판정을 선생님 말로. */
export const VERDICT_TEXT: Record<Verdict, string> = {
    ok: '옮길 수 있음',
    soft: '옮길 수 있지만 아쉬운 점이 있음',
    hard: '옮기면 규칙을 어김',
    occupied: '서로 바꾸면 규칙을 어김',
    blocked: '옮길 수 없는 칸',
    self: '지금 칸',
};

export interface HandDoc {
    solver: Solver;
    plan: Plan;
    doc: SolverInput;
    /** 배치 번호 → 엔진 배치 id. 엔진이 모르는 칸(시간 틀에 없는 교시 등)은 빠진다. */
    idOf: Map<number, string>;
}

const idFor = (i: number): string => `pl${i}`;

function lessonSlots(input: SolverInput, classId: string) {
    const track = input.tracks.find((t) => t.id === classId);
    const spec = input.specs.find((s) => s.id === track?.specId);
    return (spec?.slots ?? []).filter((s) => s.assignable);
}

/** 편성안 배치를 엔진 입력(Doc)에 얹는다. 임시 잠금은 옮기기 쪽에선 잠금과 같이 다룬다. */
export function buildHandDoc(solver: Solver, input: SolverInput, plan: Plan): HandDoc {
    const idOf = new Map<number, string>();
    const assignments: SolverAssignment[] = [];
    plan.placements.forEach((p, i) => {
        const track = input.tracks.find((t) => t.id === p.classId);
        const slot = lessonSlots(input, p.classId)[p.period - 1];
        if (!track || !slot) return;
        const timetableId = (input.timetables.find((t) => t.specId === track.specId) ?? input.timetables[0])?.id ?? '';
        const id = idFor(i);
        idOf.set(i, id);
        assignments.push({
            kind: 'work', id, timetableId, trackId: p.classId, dayIndex: solver.toDayIndex(p.day), slotIndex: slot.index,
            agentId: p.teacherId, activityId: p.subjectId,
            ...(p.roomId ? { resourceId: p.roomId } : {}),
            ...(p.fixed ? { fixed: true } : {}),
            ...(p.pinned || p.temp ? { pinned: true } : {}),
            ...(p.temp ? { temp: true } : {}),
        });
    });
    return { solver, plan, doc: { ...input, assignments }, idOf };
}

const indexOfKey = (h: HandDoc, key: string): number => h.plan.placements.findIndex((p) => placementKey(p) === key);

const slotIndexOf = (h: HandDoc, classId: string, period: number): number | undefined =>
    lessonSlots(h.doc, classId)[period - 1]?.index;

const periodOf = (h: HandDoc, classId: string, slotIndex: number): number =>
    lessonSlots(h.doc, classId).findIndex((s) => s.index === slotIndex) + 1;

export interface Cell { day: PlanDay; period: number }

function moveOf(h: HandDoc, key: string, to: Cell): Move | null {
    const i = indexOfKey(h, key);
    const id = h.idOf.get(i);
    if (!id) return null;
    const classId = h.plan.placements[i].classId;
    const slotIndex = slotIndexOf(h, classId, to.period);
    if (slotIndex === undefined) return null;
    const occupied = h.plan.placements.some((p) => p.classId === classId && p.day === to.day && p.period === to.period);
    return { assignmentId: id, to: { trackId: classId, dayIndex: h.solver.toDayIndex(to.day), slotIndex }, swap: occupied };
}

export interface CandidateInfo { verdict: Verdict; reasons: string[] }

/** 고른 칸이 같은 반 안에서 갈 수 있는 칸들 — 열쇠는 `반|요일|시간`. */
export function candidates(h: HandDoc, key: string): Map<string, CandidateInfo> {
    const out = new Map<string, CandidateInfo>();
    const i = indexOfKey(h, key);
    const id = h.idOf.get(i);
    if (!id) return out;
    const classId = h.plan.placements[i].classId;
    const res = h.solver.candidateCells(h.doc, id);
    for (const [k, verdict] of Object.entries(res.cells)) {
        const [d, s] = k.split(':').map(Number);
        const period = periodOf(h, classId, s);
        if (period < 1) continue;
        out.set(placementKey({ classId, day: h.solver.toWeekday(d) as PlanDay, period }), { verdict, reasons: res.reasons[k] ?? [] });
    }
    return out;
}

export interface HandPreview {
    /** 옮길 수 있나 — false 면 화면이 [옮기기]를 잠근다. */
    canMove: boolean;
    /** 못 옮기는(또는 규칙을 어기는) 까닭 — 선생님 말. */
    reasons: string[];
    /** 옮기면 새로 늘어나는 아쉬운 점(되도록 지킬 규칙 이름). */
    worse: string[];
    /** 옮기면 줄어드는 아쉬운 점. */
    better: string[];
    /** 그 자리에 있던 배치 — 있으면 서로 바꾸는 것이다. */
    swapWith?: Placement;
}

const none = (reasons: string[]): HandPreview => ({ canMove: false, reasons, worse: [], better: [] });

/** 옮기기 전 미리보기 — 생기는 충돌을 선생님 말로. */
export function preview(h: HandDoc, key: string, to: Cell): HandPreview {
    const i = indexOfKey(h, key);
    if (i < 0) return none(['옮길 칸을 찾을 수 없습니다']);
    const p = h.plan.placements[i];
    if (p.day === to.day && p.period === to.period) return none(['지금 그 칸에 있습니다']);
    if (p.fixed) return none(['고정한 칸이라 옮길 수 없습니다']);
    if (p.pinned || p.temp) return none(['잠가 둔 칸이라 옮길 수 없습니다']);
    const move = moveOf(h, key, to);
    if (!move) return none(['그 시간은 이 반의 수업 시간이 아닙니다']);
    const pv = h.solver.previewMove(h.doc, move);
    const labels = (f: (r: typeof pv.rows[number]) => boolean) => [...new Set(pv.rows.filter(f).map((r) => r.label))];
    const swapIdx = pv.displaced ? [...h.idOf].find(([, id]) => id === pv.displaced!.id)?.[0] : undefined;
    const reasons = pv.hardBroken
        ? (pv.hardReasons.length ? pv.hardReasons : labels((r) => r.kind === 'hard' && r.delta > 0))
        : [];
    return {
        canMove: !pv.hardBroken, reasons,
        worse: labels((r) => r.kind === 'soft' && r.delta > 0),
        better: labels((r) => r.kind === 'soft' && r.delta < 0),
        ...(swapIdx !== undefined ? { swapWith: h.plan.placements[swapIdx] } : {}),
    };
}

/** 옮기기·바꾸기 — 새 편성안(배치만 바뀜). 못 옮기면 null. 점수는 낡았으니 비우고 위반 수는 엔진이 다시 센 값. */
export function moveInPlan(h: HandDoc, key: string, to: Cell): Plan | null {
    const pv = preview(h, key, to);
    if (!pv.canMove) return null;
    const move = moveOf(h, key, to)!;
    const after = h.solver.applyMove(h.doc, move);
    const byId = new Map(after.assignments.map((a) => [a.id, a]));
    const placements = h.plan.placements.map((p, i) => {
        const a = byId.get(h.idOf.get(i) ?? '');
        if (!a) return p;
        const period = periodOf(h, a.trackId, a.slotIndex);
        const day = h.solver.toWeekday(a.dayIndex) as PlanDay;
        return period < 1 ? p : { ...p, classId: a.trackId, day, period };
    });
    if (placements.every((p, i) => placementKey(p) === placementKey(h.plan.placements[i]))) return null;   // 제자리
    const viols = h.solver.evaluateAll(after);
    return {
        ...h.plan, placements,
        summary: {
            score: null,
            hardViolations: viols.filter((v) => v.kind === 'hard').length,
            softViolations: viols.filter((v) => v.kind === 'soft').length,
        },
    };
}

export type LockKind = 'fixed' | 'pinned' | 'temp';

/** 칸 고정·잠금·임시 잠금 켜고 끄기 — 그 칸 배치의 필드 하나만 바뀐다. 풀면 필드가 사라진다. */
export function toggleLock(plan: Plan, key: string, kind: LockKind): Plan {
    return {
        ...plan,
        placements: plan.placements.map((p) => {
            if (placementKey(p) !== key) return p;
            const { [kind]: was, ...rest } = p;
            return was ? rest : { ...rest, [kind]: true };
        }),
    };
}
