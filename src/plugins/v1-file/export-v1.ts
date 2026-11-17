/**
 * F10b v1 파일 내보내기 — 정본에서 읽은 편성 입력(SolverInput) + 고른 편성안 + 따로 둔 것(extras) → v1 Doc 하나(설계 3-4).
 *   🔴 순수 함수 — 파일을 쓰지 않는다. 화면이 JSON 글로 바꿔 내려받게 한다.
 *   · 정본에 있는 칸은 정본(input)이 이긴다 — extras 는 정본에 칸이 없던 것만 되살린다(`{...extras, ...정본}`).
 *   · 편성안 배치 → v1 배치: 요일은 toDayIndex, 몇째 시간은 그 반 시간 틀의 수업 칸 번호로. 담임 센티널·배치 id 는 extras 가 되살린다.
 *   · 규칙·판은 정본 입력에 있으면 그것을, 비었으면 extras 것을 쓴다.
 */
import type { Solver, SolverInput } from '../timetable-solver/contracts/solver';
import type { Plan } from '../timetable-plans/contracts/plans';
import { assignmentKey, emptyExtras, gradesKey, lessonSlotsOf } from './extras';
import type { V1Extras } from './extras';

/** v1 작업 파일 확장자의 가운데 이름 — 파일 이름은 `<학교>-<날짜>` + 이 확장자. (코드에 이름+점 리터럴을 두지 않는다 — 구조 검사) */
const V1_BRAND = 'shiftgrid';
export const V1_FILE_EXT = `.${V1_BRAND}.json`;

export interface ExportOptions {
    solver: Pick<Solver, 'toDayIndex'>;
    /** 고른 편성안 — 없으면 배치 없는 파일. */
    plan?: Plan | null;
    extras?: V1Extras | null;
}
export interface ExportResult { doc: SolverInput; issues: string[] }

type V1Assignment = SolverInput['assignments'][number];
const withExtra = <T extends object>(item: T, extra: Record<string, unknown> | undefined): T => (extra ? ({ ...extra, ...item } as T) : item);

export function exportV1(input: SolverInput, opts: ExportOptions): ExportResult {
    const extras = opts.extras ?? emptyExtras();
    const issues: string[] = [];
    const base = structuredClone(input);

    // 시간 틀·시간표 — 정본은 칸만 갖고 id·이름은 학년 묶음으로 새로 지은 것이라, 처음 id·이름을 학년 묶음으로 짝지어 되살린다.
    const specId = new Map<string, string>();
    const specs = base.specs.map((s) => {
        const ex = extras.specs[gradesKey(s.grades)];
        const id = typeof ex?.id === 'string' ? ex.id : s.id;
        specId.set(s.id, id);
        return { ...(ex ?? {}), ...s, id, ...(typeof ex?.name === 'string' ? { name: ex.name } : {}) };
    });
    const gradesOfSpec = new Map(base.specs.map((s) => [s.id, gradesKey(s.grades)]));
    const timetables = base.timetables.map((t) => {
        const ex = extras.timetables[gradesOfSpec.get(t.specId) ?? ''];
        return { ...(ex ?? {}), ...t, specId: specId.get(t.specId) ?? t.specId,
            ...(typeof ex?.id === 'string' ? { id: ex.id } : {}), ...(typeof ex?.name === 'string' ? { name: ex.name } : {}) };
    });
    const tracks = base.tracks.map((t) => withExtra({ ...t, ...(t.specId ? { specId: specId.get(t.specId) ?? t.specId } : {}) }, extras.tracks[t.id]));
    const withTt = { ...base, specs, timetables, tracks };

    const assignments: V1Assignment[] = [];
    const plan = opts.plan;
    if (plan) {
        plan.placements.forEach((p, i) => {
            const track = withTt.tracks.find((t) => t.id === p.classId);
            const slot = lessonSlotsOf(withTt, p.classId)[p.period - 1];
            if (!track || !slot) { issues.push(`편성안 ${i + 1}번째 칸(${p.classId} ${p.day}요일 ${p.period}교시)이 시간 틀에 없어 뺐음`); return; }
            const dayIndex = opts.solver.toDayIndex(p.day);
            const timetableId = (timetables.find((t) => t.specId === track.specId) ?? timetables[0])?.id ?? '';
            const ex = extras.assignments[assignmentKey(p.classId, dayIndex, slot.index)];
            assignments.push({
                kind: 'work', id: `pl${i}`, timetableId, trackId: p.classId, dayIndex, slotIndex: slot.index,
                agentId: p.teacherId, activityId: p.subjectId,
                ...(p.roomId ? { resourceId: p.roomId } : {}),
                ...(p.fixed ? { fixed: true } : {}),
                ...(p.pinned ? { pinned: true } : {}),
                ...(p.temp ? { temp: true } : {}),
                ...(ex ?? {}),
            } as V1Assignment);
        });
        assignments.push(...structuredClone(extras.extraAssignments));
    }

    const doc: SolverInput = {
        ...base,
        specs, timetables, tracks,
        activities: base.activities.map((a) => withExtra(a, extras.activities[a.id])),
        agents: base.agents.map((a) => withExtra(a, extras.agents[a.id])),
        resources: base.resources.map((r) => withExtra(r, extras.resources[r.id])),
        demands: base.demands.map((d) => withExtra(d, extras.demands[d.id])),
        assignments,
        rules: base.rules.length ? base.rules : structuredClone(extras.rules),
        boards: base.boards.length ? base.boards : structuredClone(extras.boards),
    };
    return { doc, issues };
}

/** 내려받기 파일 이름 — `<학교>-<날짜>` + 확장자. 파일 이름에 못 쓰는 글자는 뺀다. */
export function v1FileName(schoolName: string, now: Date = new Date()): string {
    // eslint-disable-next-line no-control-regex
    const school = schoolName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim() || '시간표';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${school}-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${V1_FILE_EXT}`;
}

/** 파일 글 — v1 앱이 쓰는 것과 같은 들여쓰기 1. */
export const v1FileText = (doc: SolverInput): string => JSON.stringify(doc, null, 1);

/** 브라우저 내려받기 — 글 하나를 파일로. */
export function downloadText(name: string, text: string): void {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
