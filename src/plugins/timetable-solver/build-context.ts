/**
 * F5 편성 입력 조립 — 정본 일곱(staff·school·subjects·rooms·bell·duty·시수표) + 편성 막힘에서 읽은 값 → 엔진 편성 입력(SolverInput).
 *   🔴 정본을 편성 쪽에 다시 저장하지 않는다 — 부를 때마다 읽은 값으로 새로 짓고 버린다.
 *   🔴 엔진 알고리즘 변경 0 — 엔진이 받던 v1 꼴(Doc)을 그대로 만들어 준다(꼴만 경계에서 바꾼다).
 *   틈 셋(F0 2절)은 여기서만 맞춘다:
 *     ① 담임 — staff 의 담임 반(f_homeroom) 관계 → 「그 반 담임의 그 반 수업」은 엔진 센티널 __homeroom__ · 반에는 homeroomName.
 *     ② 요일 — 편성 막힘의 바깥 요일(1=월) → toDayIndex 로 엔진 요일(0=월). 토·일은 거른다.
 *     ③ 시각 — bell 은 같은 'HH:MM' 이라 그대로. duty 교시는 표시 틀(교시가 가장 많은 학년) 시각 구간으로 읽는다.
 *   ⛔ 엔진 기존 buildContext(편성 입력 → 엔진 문맥)와 다른 일이라 이름을 buildSolverInput 으로 둔다.
 */
import type { Clock } from '../bell/contracts/clock';
import type { Duty } from '../duty/contracts/duty';
import type { BuildIssue, CanonBellRow, SolverCanon, SolverInput } from './contracts/solver';
import type { Agent, Blackout, Demand, Slot, TimetableSpec, Timetable, Track, WeeklyBlock } from './types/schema';
import { HOMEROOM_AGENT_ID } from './types/schema';
import { toDayIndex } from './day';

/** 조립에 쓰는 정본 약속 모듈 — 순수 셈만(host.modules 로 받은 것을 넘긴다). */
export interface BuildModules {
    clock: Pick<Clock, 'slotsForGrade' | 'timeOf'>;
    duty: Pick<Duty, 'parsePeriods'>;
}

export interface BuildResult { input: SolverInput; issues: BuildIssue[] }

const SLOT_KIND: Record<string, Slot['kind']> = { class: 'lesson', lunch: 'lunch', break: 'break' };
const SLOT_LABEL: Record<string, string> = { lunch: '점심', break: '쉬는 시간', assembly: '조회' };

const ROLE_OF: Record<string, Agent['role']> = { subject: '전담', nonteaching: '비교과', assistant: '비교과' };

const day10 = (v: string | { start: string } | null | undefined): string | undefined => {
    const s = typeof v === 'string' ? v : v?.start;
    return s ? s.slice(0, 10) : undefined;
};

function slotsOf(rows: readonly CanonBellRow[], grade: number, clock: BuildModules['clock']): Slot[] {
    return clock.slotsForGrade(rows, grade)
        .filter((r) => r.kind !== 'dismissal' && r.start && r.end)
        .map((r, index) => {
            const kind = r.kind ?? 'other';
            const slot: Slot = {
                index,
                label: kind === 'class' && r.period != null ? `${r.period}교시` : (SLOT_LABEL[kind] ?? kind),
                start: r.start as string,
                end: r.end as string,
                assignable: kind === 'class',
                kind: SLOT_KIND[kind] ?? 'other',
            };
            return slot;
        });
}

/** 학년마다 bell 칸을 읽어, 칸이 똑같은 학년끼리 시간 틀 하나로 묶는다. */
function buildSpecs(canon: SolverCanon, clock: BuildModules['clock']): { specs: TimetableSpec[]; specOfGrade: Map<number, string> } {
    const grades = [...new Set(canon.classes.map((c) => c.grade).filter((g): g is number => typeof g === 'number'))].sort((a, b) => a - b);
    const groups: { key: string; grades: number[]; slots: Slot[] }[] = [];
    for (const g of grades) {
        const slots = slotsOf(canon.bell, g, clock);
        if (slots.length === 0) continue;
        const key = JSON.stringify(slots);
        const hit = groups.find((x) => x.key === key);
        if (hit) hit.grades.push(g); else groups.push({ key, grades: [g], slots });
    }
    const specOfGrade = new Map<number, string>();
    const specs = groups.map((x): TimetableSpec => {
        const id = `spec-g${x.grades.join('-')}`;
        for (const g of x.grades) specOfGrade.set(g, id);
        return {
            id,
            name: `${x.grades.join('·')}학년 시간 틀`,
            cycleDays: 7,
            activeDays: [0, 1, 2, 3, 4],
            dayStart: x.slots[0].start,
            dayEnd: x.slots[x.slots.length - 1].end,
            slots: x.slots,
            grades: x.grades,
        };
    });
    return { specs, specOfGrade };
}

/** 연속 교시끼리 묶는다 — [2,3,5] → [[2,3],[5]]. */
function runs(periods: number[]): number[][] {
    const sorted = [...new Set(periods)].sort((a, b) => a - b);
    const out: number[][] = [];
    for (const p of sorted) {
        const last = out[out.length - 1];
        if (last && last[last.length - 1] === p - 1) last.push(p); else out.push([p]);
    }
    return out;
}

export function buildSolverInput(canon: SolverCanon, mods: BuildModules): BuildResult {
    const issues: BuildIssue[] = [];
    const { specs, specOfGrade } = buildSpecs(canon, mods.clock);

    const classIds = new Set(canon.classes.map((c) => c.id));
    const subjectIds = new Set(canon.subjects.map((s) => s.id));
    const staffById = new Map(canon.staff.map((s) => [s.id, s]));
    const isPureHomeroom = (id: string) => staffById.get(id)?.kind === 'homeroom';
    const homeroomOf = (staffId: string, classId: string) =>
        isPureHomeroom(staffId) && (staffById.get(staffId)?.homeroomClassIds ?? []).includes(classId);

    // ── 수요(시수표) — 담임의 자기 반 수업은 센티널(틈 ①) ──
    const demands: Demand[] = [];
    const teaching = new Set<string>(); // 센티널이 아닌 수업을 맡은 사람
    for (const r of canon.demands) {
        if (!r.teacherId || !r.classId || !r.subjectId || !(typeof r.hours === 'number' && r.hours > 0)) {
            issues.push({ source: 'demand', id: r.id, reason: '교사·반·과목·시수 중 빈 칸' });
            continue;
        }
        if (!staffById.has(r.teacherId) || !classIds.has(r.classId) || !subjectIds.has(r.subjectId)) {
            issues.push({ source: 'demand', id: r.id, reason: '정본에서 찾을 수 없음' });
            continue;
        }
        const sentinel = homeroomOf(r.teacherId, r.classId);
        if (!sentinel) teaching.add(r.teacherId);
        demands.push({ id: r.id, agentId: sentinel ? HOMEROOM_AGENT_ID : r.teacherId, trackId: r.classId, activityId: r.subjectId, count: r.hours });
    }

    // ── 사람 — 순수 담임(남의 반 수업 없음)은 사람이 아니라 반의 이름표 ──
    const agents: Agent[] = [];
    const homeroomName = new Map<string, string>();
    for (const s of canon.staff) {
        const pure = s.kind === 'homeroom';
        if (pure && !teaching.has(s.id)) {
            for (const c of s.homeroomClassIds ?? []) if (!homeroomName.has(c)) homeroomName.set(c, s.name);
            continue;
        }
        const a: Agent = { kind: 'agent', id: s.id, name: s.name };
        if (s.tier) a.tier = s.tier;
        const role = pure ? '담임 겸 전담' : (s.kind ? ROLE_OF[s.kind] : undefined);
        if (role) a.role = role;
        if (s.homeroomClassIds?.length) a.homeroomTrackIds = [...s.homeroomClassIds];
        agents.push(a);
    }
    const agentIds = new Set(agents.map((a) => a.id));

    // ── 반 · 과목 · 방 ──
    const tracks: Track[] = canon.classes.map((c) => {
        const t: Track = { kind: 'track', id: c.id, name: c.name };
        if (c.grade !== undefined) {
            t.grade = c.grade;
            const sid = specOfGrade.get(c.grade);
            if (sid) t.specId = sid;
        }
        const hn = homeroomName.get(c.id);
        if (hn) t.homeroomName = hn;
        return t;
    });
    const activities = canon.subjects.map((s) => ({ kind: 'activity' as const, id: s.id, name: s.name }));
    const resources = canon.rooms.map((r) => ({
        kind: 'resource' as const, id: r.id, name: r.name,
        ...(typeof r.capacity === 'number' && r.capacity > 0 ? { capacity: r.capacity } : {}),
    }));

    const timetables: Timetable[] = specs.map((s) => ({
        id: `tt-${s.id}`, name: s.name, specId: s.id,
        startDate: canon.range.startDate, endDate: canon.range.endDate, priority: 0,
    }));

    // ── 복무 → 날짜 차단(사람만). 교시는 표시 틀 학년의 시각으로(틈 ③) ──
    let display: TimetableSpec | undefined;
    for (const s of specs) if (!display || s.slots.length > display.slots.length) display = s;
    const displayGrade = display?.grades?.[0];
    const blackouts: Blackout[] = [];
    for (const r of canon.duty) {
        const people = (Array.isArray(r.person) ? r.person : r.person ? [r.person] : []) as string[];
        const targets = people.filter((p) => agentIds.has(p)).map((id) => ({ kind: 'agent' as const, id }));
        if (targets.length < people.length) issues.push({ source: 'duty', id: r.id, reason: '편성 대상이 아닌 사람(순수 담임·없는 사람)은 뺐음' });
        const startDate = day10(r.start);
        if (!startDate || targets.length === 0) continue;
        const endDate = day10(r.end) ?? startDate;
        const base = { name: r.name ?? '복무', startDate, endDate, targets, mode: 'only' as const };
        const periods = !r.allDay && r.periods ? mods.duty.parsePeriods(r.periods) : null;
        if (!periods || periods.length === 0 || displayGrade === undefined) {
            blackouts.push({ id: r.id, ...base });
            continue;
        }
        const rs = runs(periods);
        rs.forEach((run, k) => {
            const a = mods.clock.timeOf(canon.bell, displayGrade, run[0]);
            const b = mods.clock.timeOf(canon.bell, displayGrade, run[run.length - 1]);
            if (!a || !b) { issues.push({ source: 'duty', id: r.id, reason: `교시 ${run.join(',')} 의 시각을 모름` }); return; }
            blackouts.push({ id: rs.length > 1 ? `${r.id}#${k + 1}` : r.id, ...base, from: a.start, to: b.end });
        });
    }

    // ── 편성 막힘 → 주간 금지칸(요일 틈 ②) ──
    const weeklyBlocks: WeeklyBlock[] = [];
    for (const b of canon.blocks) {
        if (!(b.weekday >= 1 && b.weekday <= 5)) {
            issues.push({ source: 'block', id: b.id, reason: '토·일 칸은 편성에 안 쓰입니다' });
            continue;
        }
        const wb: WeeklyBlock = { id: b.id, name: b.name, dayIndex: toDayIndex(b.weekday), targets: b.targets.map((t) => ({ kind: t.kind, id: t.id })) };
        if (b.slotIndex !== undefined) wb.slotIndex = b.slotIndex;
        if (b.from !== undefined) wb.from = b.from;
        if (b.to !== undefined) wb.to = b.to;
        if (b.soft) wb.soft = true;
        if (b.temp) wb.temp = true;
        weeklyBlocks.push(wb);
    }

    const input: SolverInput = {
        meta: { name: canon.school.name, term: canon.school.term ?? '', schemaVersion: 3 },
        agents, activities, resources, specs, tracks, timetables, demands,
        assignments: [], blackouts, weeklyBlocks, rules: [], boards: [],
    };
    return { input, issues };
}
