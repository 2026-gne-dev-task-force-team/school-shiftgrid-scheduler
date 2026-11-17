/**
 * F10b 가져올 때 정본에 칸이 없어 버리던 것(협력 교사·특별실 수용 수·쓰는 과목·점심 틀·규칙·판·배치)을 따로 모아 둔다.
 *   🔴 순수 함수 — 저장은 extras-store.ts. 정본에 있는 칸은 여기 안 담는다(정본이 이긴다 · 내보낼 때 정본 값을 덮지 않는다).
 *   배치(assignments)는 편성안(Plan)으로 바꿔 편성안 쪽에 담고(placements), 편성안 칸에 없는 부분(id·수요 번호·협력 교사…)만 여기 남긴다.
 */
import type { Plan, Placement, PlanDay } from '../timetable-plans/contracts/plans';
import type { SolverInput, Solver } from '../timetable-solver/contracts/solver';

export type Rec = Record<string, unknown>;
type V1Assignment = SolverInput['assignments'][number];

/** v1 엔진의 「그 반 담임」 센티널 — import-v1 의 V1_HOMEROOM_ID 와 같은 값. */
const HOMEROOM = '__homeroom__';

export interface V1Extras {
    version: 1;
    /** 사람 id → 정본에 칸 없는 속성(점심 틀 …) */
    agents: Record<string, Rec>;
    resources: Record<string, Rec>;
    activities: Record<string, Rec>;
    demands: Record<string, Rec>;
    /** 반 id → 정본에 칸 없는 속성(attr 따위) */
    tracks: Record<string, Rec>;
    /** 학년 묶음(`1-2`) → 시간 틀의 id·이름·교시 수 규칙 — 정본(일과표)은 칸만 갖고 틀 id·이름은 학년 묶음으로 새로 짓는다 */
    specs: Record<string, Rec>;
    /** 학년 묶음 → 그 틀에 걸린 시간표(편성 기간 줄)의 id·이름·우선순위 */
    timetables: Record<string, Rec>;
    /** `반|요일(0=월)|칸 번호` → 편성안 칸에 없는 배치 속성 */
    assignments: Record<string, Rec>;
    /** 편성안 한 칸에 못 담는 배치(시간 틀에 없는 칸 · 같은 칸의 둘째 배치 · 담임을 못 찾음) */
    extraAssignments: V1Assignment[];
    rules: SolverInput['rules'];
    boards: SolverInput['boards'];
}

export const emptyExtras = (): V1Extras => ({
    version: 1, agents: {}, resources: {}, activities: {}, demands: {}, tracks: {}, specs: {}, timetables: {}, assignments: {}, extraAssignments: [], rules: [], boards: [],
});

const restOf = (o: object, keep: readonly string[]): Rec => {
    const out: Rec = {};
    for (const [k, v] of Object.entries(o)) if (!keep.includes(k) && v !== undefined) out[k] = v;
    return out;
};
const putRest = (into: Record<string, Rec>, id: string, rest: Rec) => { if (Object.keys(rest).length) into[id] = rest; };

/** 학년 묶음 열쇠 — 정본에서 시간 틀을 다시 지을 때 학년으로 짝짓는다. */
export const gradesKey = (grades: readonly number[] | undefined): string => [...(grades ?? [])].sort((a, b) => a - b).join('-');

export const assignmentKey = (trackId: string, dayIndex: number, slotIndex: number): string => `${trackId}|${dayIndex}|${slotIndex}`;

/** 한 반의 수업 칸(교시 순) — 시간 틀에서 assignable 인 칸. */
export function lessonSlotsOf(input: Pick<SolverInput, 'tracks' | 'specs'>, classId: string) {
    const track = input.tracks.find((t) => t.id === classId);
    const spec = input.specs.find((s) => s.id === track?.specId);
    return (spec?.slots ?? []).filter((s) => s.assignable);
}

export interface ExtractResult { extras: V1Extras; plan: Plan | null; skipped: number }

/**
 * v1 Doc → 정본에 칸 없는 것 + 편성안. 편성안은 배치가 하나도 없으면 null.
 * @param homeroomTeacherOf 담임 센티널 배치의 선생님 id(불러온 직후의 담임 행) — 못 찾으면 그 배치는 extraAssignments 로.
 */
export function extractExtras(
    doc: SolverInput,
    mods: { solver: Pick<Solver, 'toWeekday'> },
    homeroomTeacherOf: (classId: string) => string | undefined,
    planName: string,
    now: Date = new Date(),
): ExtractResult {
    const extras = emptyExtras();
    for (const a of doc.agents) putRest(extras.agents, a.id, restOf(a, ['kind', 'id', 'name', 'role', 'tier', 'homeroomTrackIds']));
    for (const r of doc.resources) putRest(extras.resources, r.id, restOf(r, ['kind', 'id', 'name']));
    for (const a of doc.activities) putRest(extras.activities, a.id, restOf(a, ['kind', 'id', 'name']));
    for (const t of doc.tracks) putRest(extras.tracks, t.id, restOf(t, ['kind', 'id', 'name', 'grade', 'specId', 'homeroomName']));
    for (const sp of doc.specs) {
        const k = gradesKey(sp.grades);
        if (!k || extras.specs[k]) continue;
        extras.specs[k] = restOf(sp, ['slots', 'grades']);
        const tt = doc.timetables.find((t) => t.specId === sp.id);
        if (tt) extras.timetables[k] = restOf(tt, ['specId', 'startDate', 'endDate']);
    }
    for (const d of doc.demands) putRest(extras.demands, d.id, restOf(d, ['id', 'agentId', 'trackId', 'activityId', 'count']));
    extras.rules = structuredClone(doc.rules);
    extras.boards = structuredClone(doc.boards);

    const placements: Placement[] = [];
    const seen = new Set<string>();
    let skipped = 0;
    for (const a of doc.assignments) {
        const lessons = lessonSlotsOf(doc, a.trackId);
        const period = lessons.findIndex((s) => s.index === a.slotIndex) + 1;
        const day = mods.solver.toWeekday(a.dayIndex);
        const sentinel = a.agentId === HOMEROOM;
        const teacherId = sentinel ? homeroomTeacherOf(a.trackId) : a.agentId;
        const cell = `${a.trackId}|${day}|${period}`;
        if (period < 1 || day < 1 || day > 6 || !teacherId || !a.activityId || seen.has(cell)) {
            extras.extraAssignments.push(structuredClone(a));
            skipped++;
            continue;
        }
        seen.add(cell);
        placements.push({
            classId: a.trackId, day: day as PlanDay, period, subjectId: a.activityId, teacherId,
            ...(a.resourceId ? { roomId: a.resourceId } : {}),
            ...(a.fixed ? { fixed: true } : {}),
            ...(a.pinned ? { pinned: true } : {}),
            ...(a.temp ? { temp: true } : {}),
        });
        const rest = restOf(a, ['kind', 'trackId', 'timetableId', 'dayIndex', 'slotIndex', 'activityId', 'resourceId', 'fixed', 'pinned', 'temp', 'agentId']);
        if (sentinel) rest.agentId = HOMEROOM;
        extras.assignments[assignmentKey(a.trackId, a.dayIndex, a.slotIndex)] = rest;
    }
    const plan: Plan | null = placements.length
        ? { name: planName, madeAt: now.toISOString(), placements, summary: { score: null, hardViolations: 0, softViolations: 0 } }
        : null;
    return { extras, plan, skipped };
}
