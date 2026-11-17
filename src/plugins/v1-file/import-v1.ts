/**
 * F10a v1 파일 불러오기 — v1 Doc(migrateDoc 을 거친 v3 꼴) → 정본마다 쓰기 목록(쪼개 넣기 · 설계 3-4).
 *   🔴 순수 함수 — 정본에 쓰지 않는다. 돌려준 목록을 화면이 「이 파일로 바꿀까요」 확인 뒤 정본 약속으로 쓴다.
 *   🔴 반대 방향 짝은 timetable-solver 의 buildSolverInput(정본 → 엔진 입력). 쓰기 목록 꼴을 그 입력(SolverCanon)과 같게 둬서
 *      「v1 파일 → 불러오기 → buildSolverInput」 = 「v1 파일 그대로 엔진 입력」 을 시험이 지킨다.
 *   틈 셋은 이 경계에서만 바꾼다(F0 2절):
 *     ① 담임 — 반의 homeroomName 문자열 → staff 담임 행(구분 homeroom · 담임 반 관계). 센티널 수요 줄 → 그 담임의 id.
 *     ② 요일 — 엔진 dayIndex(0=월) → 바깥 weekday(1=월). 약속 solver 의 toWeekday 를 주입받아 쓴다(사본 0).
 *     ③ 시각 — 시간 틀 'HH:mm' 은 bell 'HH:MM' 그대로. 복무(Blackout from/to)는 표시 틀 학년의 교시 글자로 바꾼다.
 *   ⛔ 내보내기(모으기)·왕복은 F10b.
 */
import type { Clock } from '../bell/contracts/clock';
import type {
    CanonBellRow, CanonDemandRow, CanonDutyRow, CanonStaffRow, Solver, SolverBlockRow, SolverCanon, SolverInput,
} from '../timetable-solver/contracts/solver';

/** v1 엔진의 「그 반 담임」 센티널 — timetable-solver types/schema 의 HOMEROOM_AGENT_ID 와 같은 값(시험이 대조). 약속에 값이 없어 글자로 둔다. */
export const V1_HOMEROOM_ID = '__homeroom__';

export interface ImportModules {
    solver: Pick<Solver, 'toWeekday'>;
    clock: Pick<Clock, 'slotsForGrade'>;
}

/** 쓰기 목록 칸 → 받을 정본(플러그인 id). blocks 는 편성 쪽 저장(F0 3절 틈 ④ 결정 (나)). */
export const TARGET_OF = {
    school: 'school', range: 'timetable-grid', staff: 'staff', classes: 'school', subjects: 'subjects', rooms: 'rooms',
    bell: 'bell', duty: 'duty', demands: 'demand-table', blocks: 'timetable-solver',
} as const satisfies Record<keyof SolverCanon, string>;

/** 쪼개다 버리거나 바꾼 것 — 확인창에 그대로 보인다. */
export interface V1ImportIssue { source: keyof SolverInput; id: string; reason: string }
/** 파일에 이름만 있던 담임 — 새 staff 행으로 만들까요 목록(틈 ①). */
export interface NewHomeroom { staffId: string; name: string; classId: string }

export interface V1ImportResult { writes: SolverCanon; newHomerooms: NewHomeroom[]; issues: V1ImportIssue[] }

type Spec = SolverInput['specs'][number];
type Slot = Spec['slots'][number];

const KIND_OF_ROLE: Record<string, string> = { '전담': 'subject', '비교과': 'nonteaching', '담임 겸 전담': 'homeroom', '담임': 'homeroom' };
const BELL_KIND: Record<string, string> = { lesson: 'class', lunch: 'lunch', break: 'break' };

const lessonKey = (r: CanonBellRow) => `${r.kind}|${r.period ?? ''}|${r.start}|${r.end}`;
const minOf = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

/** [2,3,5] → '2-3, 5' (duty 교시 글자). */
function periodText(ps: number[]): string {
    const out: string[] = [];
    for (const p of [...new Set(ps)].sort((a, b) => a - b)) {
        const last = out[out.length - 1];
        const m = last ? /^(\d+)(?:-(\d+))?$/.exec(last) : null;
        const end = m ? Number(m[2] ?? m[1]) : NaN;
        if (m && end === p - 1) out[out.length - 1] = `${m[1]}-${p}`; else out.push(String(p));
    }
    return out.join(', ');
}

/** 시간 틀(학년군마다) → bell 줄. 모든 학년에 같은 줄은 grades 를 비운다(전 학년). */
function bellOf(doc: SolverInput, issues: V1ImportIssue[]): { bell: CanonBellRow[]; grades: number[] } {
    const rows = new Map<string, { row: CanonBellRow; grades: Set<number> }>();
    const all = new Set<number>();
    for (const s of doc.specs) {
        const gs = s.grades?.length ? s.grades : doc.tracks.filter((t) => t.specId === s.id && typeof t.grade === 'number').map((t) => t.grade as number);
        if (gs.length === 0) { issues.push({ source: 'specs', id: s.id, reason: '학년이 없는 시간 틀 — 일과표에 넣을 학년을 모름' }); continue; }
        gs.forEach((g) => all.add(g));
        let period = 0;
        for (const sl of s.slots as Slot[]) {
            const kind = sl.assignable ? 'class' : (BELL_KIND[sl.kind ?? ''] ?? (sl.label === '조회' ? 'assembly' : 'other'));
            const row: CanonBellRow = { kind, start: sl.start, end: sl.end };
            if (kind === 'class') row.period = ++period;
            const k = lessonKey(row);
            const hit = rows.get(k);
            if (hit) gs.forEach((g) => hit.grades.add(g)); else rows.set(k, { row, grades: new Set(gs) });
        }
    }
    const bell = [...rows.values()].map(({ row, grades }) =>
        grades.size === all.size ? row : { ...row, grades: [...grades].sort((a, b) => a - b).map(String) });
    bell.sort((a, b) => minOf(a.start as string) - minOf(b.start as string));
    return { bell, grades: [...all].sort((a, b) => a - b) };
}

export function importV1(doc: SolverInput, mods: ImportModules): V1ImportResult {
    const issues: V1ImportIssue[] = [];
    const newHomerooms: NewHomeroom[] = [];

    // ── 사람 ──
    const staff: CanonStaffRow[] = doc.agents.map((a) => {
        const row: { -readonly [K in keyof CanonStaffRow]: CanonStaffRow[K] } = { id: a.id, name: a.name };
        const kind = a.role ? KIND_OF_ROLE[a.role] : undefined;
        if (kind) row.kind = kind;
        if (a.tier) row.tier = a.tier;
        if (a.homeroomTrackIds?.length) row.homeroomClassIds = [...a.homeroomTrackIds];
        if (a.lunchSpecId) issues.push({ source: 'agents', id: a.id, reason: '점심 맞출 시간 틀(lunchSpecId)은 교직원에 칸이 없어 뺐음' });
        return row;
    });

    // ── 반 · 담임 이름(틈 ①) ──
    const homeroomOfClass = new Map<string, string>();
    for (const s of staff) if (s.kind === 'homeroom') for (const c of s.homeroomClassIds ?? []) if (!homeroomOfClass.has(c)) homeroomOfClass.set(c, s.id);
    for (const t of doc.tracks) {
        const name = t.homeroomName?.trim();
        if (!name || homeroomOfClass.has(t.id)) continue;
        // 파일에 있던 사람하고만 이름을 맞춘다 — 방금 만든 담임 행과 맞추면 동명이인 두 반이 한 사람이 된다.
        const same = staff.slice(0, doc.agents.length).filter((s) => s.name === name && s.kind === 'homeroom');
        if (same.length === 1) {
            const s = same[0] as { homeroomClassIds?: readonly string[] };
            s.homeroomClassIds = [...(s.homeroomClassIds ?? []), t.id];
            homeroomOfClass.set(t.id, same[0].id);
            continue;
        }
        const id = `v1-hr-${t.id}`;
        staff.push({ id, name, kind: 'homeroom', homeroomClassIds: [t.id] });
        homeroomOfClass.set(t.id, id);
        newHomerooms.push({ staffId: id, name, classId: t.id });
    }
    const classes = doc.tracks.map((t) => (t.grade !== undefined ? { id: t.id, name: t.name, grade: t.grade } : { id: t.id, name: t.name }));

    const subjects = doc.activities.map((a) => ({ id: a.id, name: a.name }));
    const rooms = doc.resources.map((r) => {
        if ((r.capacity ?? 1) !== 1 || r.activityIds?.length) issues.push({ source: 'resources', id: r.id, reason: '수용 수·쓰는 과목은 특별실에 칸이 없어 뺐음' });
        return { id: r.id, name: r.name };
    });

    // ── 일과표(틈 ③ — 문자열 그대로) ──
    const { bell, grades } = bellOf(doc, issues);

    // ── 수요 → 시수표. 센티널은 그 반 담임으로(틈 ①) ──
    const LOST = ['coAgentId', 'resourceId', 'roomHours', 'block', 'cycle', 'fixed'] as const;
    const demands: CanonDemandRow[] = [];
    for (const d of doc.demands) {
        let teacherId = d.agentId;
        if (teacherId === V1_HOMEROOM_ID) {
            const hr = homeroomOfClass.get(d.trackId);
            if (!hr) { issues.push({ source: 'demands', id: d.id, reason: '담임 수업인데 그 반 담임 이름이 없음' }); continue; }
            teacherId = hr;
        }
        const lost = LOST.filter((k) => d[k] !== undefined && !(Array.isArray(d[k]) && (d[k] as unknown[]).length === 0));
        if (lost.length) issues.push({ source: 'demands', id: d.id, reason: `시수표에 칸이 없어 뺐음: ${lost.join(', ')}` });
        demands.push({ id: d.id, teacherId, classId: d.trackId, subjectId: d.activityId, hours: d.count });
    }

    // ── 날짜 차단 → 복무(사람만). 시각 → 표시 틀 학년의 교시(틈 ③) ──
    let displayGrade: number | undefined, most = -1;
    for (const g of grades) { const n = mods.clock.slotsForGrade(bell, g).length; if (n > most) { most = n; displayGrade = g; } }
    const lessons = displayGrade === undefined ? [] : mods.clock.slotsForGrade(bell, displayGrade).filter((r) => r.kind === 'class');
    const duty: CanonDutyRow[] = [];
    const dutyAt = new Map<string, { row: CanonDutyRow; key: string; periods: number[] }>();
    for (const b of doc.blackouts) {
        const people = b.targets.filter((t) => t.kind === 'agent').map((t) => t.id);
        if (b.mode !== 'only' || people.length === 0 || people.length < b.targets.length) {
            issues.push({ source: 'blackouts', id: b.id, reason: '사람 아닌 대상·전부 막기 차단은 복무에 자리가 없어 뺐음' });
            continue;
        }
        const base = b.id.replace(/#\d+$/, '');
        const key = JSON.stringify([b.name, b.startDate, b.endDate, people]);
        let periods: number[] = [];
        if (b.from && b.to) {
            const f = minOf(b.from), t = minOf(b.to);
            const hit = lessons.filter((r) => minOf(r.start as string) < t && minOf(r.end as string) > f);
            periods = hit.map((r) => r.period as number);
            if (!hit.length || hit[0].start !== b.from || hit[hit.length - 1].end !== b.to) {
                issues.push({ source: 'blackouts', id: b.id, reason: `시각 ${b.from}~${b.to} 을 ${displayGrade ?? '?'}학년 교시로 어림했음` });
            }
            if (!hit.length) continue;
        }
        const prev = dutyAt.get(base);
        if (prev && prev.key === key && periods.length && prev.periods.length) {
            prev.periods.push(...periods);
            prev.row.periods = periodText(prev.periods);
            continue;
        }
        const id = prev ? b.id : base;
        const row: CanonDutyRow = periods.length
            ? { id, name: b.name, person: people, start: b.startDate, end: b.endDate, periods: periodText(periods) }
            : { id, name: b.name, person: people, start: b.startDate, end: b.endDate, allDay: true };
        duty.push(row);
        if (!prev) dutyAt.set(base, { row, key, periods });
    }

    // ── 주간 금지칸 → 편성 막힘(틈 ② — 요일 0=월 → 1=월) ──
    const blocks: SolverBlockRow[] = doc.weeklyBlocks.map((w) => {
        const b: { -readonly [K in keyof SolverBlockRow]: SolverBlockRow[K] } = {
            id: w.id, name: w.name, weekday: mods.solver.toWeekday(w.dayIndex), targets: w.targets.map((t) => ({ kind: t.kind, id: t.id })),
        };
        if (w.slotIndex !== undefined) b.slotIndex = w.slotIndex;
        if (w.from !== undefined) b.from = w.from;
        if (w.to !== undefined) b.to = w.to;
        if (w.soft) b.soft = true;
        if (w.temp) b.temp = true;
        return b;
    });

    // ── 편성 기간 ──
    const starts = doc.timetables.map((t) => t.startDate).sort(), ends = doc.timetables.map((t) => t.endDate).sort();
    const range = { startDate: starts[0] ?? '', endDate: ends[ends.length - 1] ?? '' };

    for (const k of ['assignments', 'rules', 'boards'] as const) {
        if (doc[k].length) issues.push({ source: k, id: '*', reason: `${doc[k].length}건 — 받을 조각(편성안·편성 규칙)이 아직 없어 이번엔 안 넣음` });
    }

    const school = doc.meta.term ? { name: doc.meta.name, term: doc.meta.term } : { name: doc.meta.name };
    return {
        writes: { school, range, staff, classes, subjects, rooms, bell, duty, demands, blocks },
        newHomerooms,
        issues,
    };
}
