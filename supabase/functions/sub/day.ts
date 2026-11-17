// 그날 입력(① 8절) — 덩어리 `doc`(시간표 v3 꼴) → 그날의 반·수업·사람 → loadDay·loadJudge.
// 순수: 조각을 여는 일(읽기·복호·gunzip)은 주입(`open`). 한 요청 안에서 조각마다 한 번만 연다(B9 CPU 실측 — 691 KB 열기 141 ms).
// T-10e1: doc 에 더해 ops.calendar·ops.changes·ops.fixed·ops.classSubjects·ops.aux 조각을 얹는다(없으면 빈 값 · aux 는 partial).
// 조각 꼴은 shared/check/rules.ts 의 칸 꼴이 정본 — 화면 쪽 옛 꼴(ops-days `date`·`classKey`·`subject` · `start` 글자)도 받아 준다.

import type { CandInput, CandLesson, CandTrack } from '../../../shared/sub-engine/candidates.ts';
import { toMin } from '../../../shared/sub-engine/canon-input.ts';
import {
    buildDayInput,
    type AuxStaff,
    type CalendarItem,
    type ChangeItem,
    type ClassSubject,
    type FixedItem,
    type SlotItem,
} from '../../../shared/sub-engine/day-input.ts';
import { HttpError } from '../_shared/errors.ts';
import type { DayPerson, DayResult, JudgeResult } from './handler.ts';

interface Slot { index: number; start: string; end: string; kind?: string; assignable?: boolean; label?: string }
interface Grid {
    agents: { id: string; name: string; role?: string }[];
    activities?: { id: string; name: string }[];
    specs: { id: string; lessonsPerDay?: Record<string, number>; slots: Slot[] }[];
    tracks: { id?: string; name: string; specId?: string; grade?: number | null }[];
    assignments: { trackId?: string; dayIndex: number; slotIndex: number; agentId?: string; coAgentId?: string; activityId?: string; label?: string }[];
    weeklyBlocks?: { dayIndex: number; from?: string; to?: string; targets: { kind: string; id: string }[]; name?: string }[];
}

const HOMEROOM = '__homeroom__';

/** 날짜(YYYY-MM-DD) → 요일 번호 0=월 … 6=일(시간표 `dayIndex` 꼴) */
export const dayIndexOf = (date: string): number => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

const unavailable = (msg = '그날 시간표를 아직 열 수 없습니다') => new HttpError(503, 'day_unavailable', msg);

function asGrid(doc: unknown): Grid {
    const g = doc as Partial<Grid> | null;
    if (!g || !Array.isArray(g.tracks) || !Array.isArray(g.specs) || !Array.isArray(g.agents) || !Array.isArray(g.assignments)) {
        throw unavailable('시간표 꼴이 맞지 않아 그날 입력을 만들 수 없습니다');
    }
    return g as Grid;
}

const kindOf = (role: string | undefined) => (role === '비교과' || role === '교감' || role === '보조' ? role : '전담');

/** `periods`: 반 이름 → 그날 N교시(1부터)의 시작 분 목록(수업 슬롯 · lessonsPerDay 반영) — 교시 과목 변경(⑥)용 */
export interface GridDay { tracks: CandTrack[]; people: DayPerson[]; fixed: FixedItem[]; periods: Map<string, number[]> }

/**
 * 그날의 반·수업(엔진 꼴) — 수업 칸 = 수업 슬롯(lessonsPerDay 앞 n개) + 배치가 있는 슬롯.
 * 배치 없는 수업 칸·`__homeroom__` 칸은 담임 수업(teacherIds 빈 배열). 사람은 에이전트만(담임은 `homeroom:<반>` 으로 따로).
 */
export function gridDay(doc: unknown, dayIndex: number): GridDay {
    const g = asGrid(doc);
    const actName = new Map((g.activities ?? []).map((a) => [a.id, a.name]));
    const periods = new Map<string, number[]>();
    const tracks: CandTrack[] = g.tracks.map((t) => {
        const spec = g.specs.find((s) => s.id === t.specId);
        const slots = spec?.slots ?? [];
        const lunch = slots.find((s) => s.kind === 'lunch') ?? slots.find((s) => (s.label ?? '').includes('점심'));
        const lessonSlots = slots.filter((s) => s.assignable !== false && (s.kind ?? 'lesson') === 'lesson');
        const perDay = spec?.lessonsPerDay?.[String(dayIndex)];
        const daySlots = perDay == null ? lessonSlots : lessonSlots.slice(0, perDay);
        periods.set(t.name, daySlots.map((s) => toMin(s.start)).sort((x, y) => x - y));
        const idx = new Set(daySlots.map((s) => s.index));
        const teach = new Map<number, string[]>();
        const co = new Map<number, string[]>();
        const subj = new Map<number, string>();
        const tid = t.id ?? 't-' + t.name;
        for (const a of g.assignments) {
            if (a.trackId !== tid || a.dayIndex !== dayIndex || !slots.some((x) => x.index === a.slotIndex)) continue;
            idx.add(a.slotIndex);
            const ids = teach.get(a.slotIndex) ?? [];
            if (a.agentId && a.agentId !== HOMEROOM) ids.push(a.agentId);
            teach.set(a.slotIndex, ids);
            if (a.coAgentId && a.coAgentId !== HOMEROOM) co.set(a.slotIndex, [...(co.get(a.slotIndex) ?? []), a.coAgentId]);
            const name = (a.activityId && actName.get(a.activityId)) || a.label;
            if (name) subj.set(a.slotIndex, name);
        }
        const lessons: CandLesson[] = [...idx]
            .map((i) => slots.find((x) => x.index === i)!)
            .sort((x, y) => toMin(x.start) - toMin(y.start))
            .map((s) => ({ startMin: toMin(s.start), endMin: toMin(s.end), subject: subj.get(s.index) ?? null, teacherIds: teach.get(s.index) ?? [], coIds: co.get(s.index) ?? [] }));
        return { name: t.name, grade: t.grade ?? null, lessons, lunch: lunch ? { startMin: toMin(lunch.start), endMin: toMin(lunch.end) } : null };
    });
    const people: DayPerson[] = g.agents.map((a) => ({ id: a.id, name: a.name, kind: kindOf(a.role) }));
    const fixed: FixedItem[] = [];
    for (const b of g.weeklyBlocks ?? []) {
        if (b.dayIndex !== dayIndex || !b.from || !b.to) continue;
        for (const t of b.targets) if (t.kind === 'agent') fixed.push({ dayIndex, personId: t.id, startMin: toMin(b.from), endMin: toMin(b.to), reason: b.name });
    }
    return { tracks, people, fixed, periods };
}

// ── 곁 조각 → 그날 입력 꼴(순수 · 꼴이 틀린 줄은 건너뛴다) ─────────────────

type Row = Record<string, unknown>;
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.filter((e): e is Row => typeof e === 'object' && e !== null && !Array.isArray(e)) : []);
const str = (v: unknown): v is string => typeof v === 'string' && v !== '';
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const minOf = (v: unknown): number | null => (num(v) ? v : str(v) && /^\d{1,2}:\d{2}$/.test(v) ? toMin(v) : null);
const TARGETS = ['all', 'grade', 'track'] as const;

/** ops.calendar → 그날을 덮는 줄. 옛 꼴(`date`·kind `all`=휴업일·`title`)은 kind `all` 만 학교 전체로 읽는다. */
export function calendarOn(body: unknown, date: string): CalendarItem[] {
    const out: CalendarItem[] = [];
    for (const e of rows(body)) {
        const from = str(e.startDate) ? e.startDate : str(e.date) ? e.date : null;
        if (!from) continue;
        const to = str(e.endDate) ? e.endDate : from;
        if (date < from || date > to) continue;
        const targetKind = TARGETS.find((k) => k === e.targetKind) ?? (e.targetKind == null && e.kind === 'all' ? 'all' : null);
        if (!targetKind) continue;
        const kind = str(e.title) ? e.title : str(e.kind) ? e.kind : '학사 일정';
        out.push({ kind, targetKind, targetValue: str(e.targetValue) ? e.targetValue : num(e.targetValue) ? String(e.targetValue) : '' });
    }
    return out;
}

/** ops.changes → 그날 줄. period null = 반 전체 없음. 옛 꼴 `classKey`·`subject` 도 받는다. */
export function changesOn(body: unknown, date: string): ChangeItem[] {
    const out: ChangeItem[] = [];
    for (const e of rows(body)) {
        if (e.date !== date) continue;
        const trackName = str(e.trackName) ? e.trackName : str(e.classKey) ? e.classKey : null;
        const period = e.period === null ? null : num(e.period) ? e.period : undefined;
        if (!trackName || period === undefined) continue;
        out.push({ trackName, period, activityName: str(e.activityName) ? e.activityName : str(e.subject) ? e.subject : '' });
    }
    return out;
}

/** ops.fixed → 고정 일정(사람 = personRef). 요일 거르기는 buildDayInput ② 가 한다. */
export function fixedOf(body: unknown): FixedItem[] {
    const out: FixedItem[] = [];
    for (const e of rows(body)) {
        const startMin = minOf(e.startMin), endMin = minOf(e.endMin);
        if (!str(e.personRef) || !num(e.dayIndex) || startMin == null || endMin == null) continue;
        out.push({ dayIndex: e.dayIndex, personId: e.personRef, startMin, endMin, reason: str(e.reason) ? e.reason : str(e.title) ? e.title : undefined });
    }
    return out;
}

/** ops.classSubjects → 그 요일 담임 칸 과목. 옛 꼴 `start`(HH:MM)도 받는다. */
export function classSubjectsOn(body: unknown, dayIndex: number): ClassSubject[] {
    const out: ClassSubject[] = [];
    for (const e of rows(body)) {
        const startMin = minOf(e.startMin ?? e.start);
        if (e.dayIndex !== dayIndex || !str(e.trackName) || !str(e.subject) || startMin == null) continue;
        out.push({ trackName: e.trackName, startMin, subject: e.subject });
    }
    return out;
}

/**
 * ops.aux → 그날 보조 배정. 조각이 없거나 객체가 아니면 null(partial aux).
 * 사람마다 그날 날짜별 배정(`day`)이 있으면 그것, 없으면 그 요일 기본 배정(`base`). `classKey` 빈 줄 = 지원 불가.
 * 그날 「결근」 예외가 있으면 배정 없음. `active:false` 는 뺀다.
 */
export function auxOn(body: unknown, date: string, dayIndex: number): AuxStaff[] | null {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
    const b = body as Row;
    const days = rows(b.day), base = rows(b.base), ex = rows(b.exceptions);
    const out: AuxStaff[] = [];
    for (const s of rows(b.staff)) {
        if (!str(s.id) || s.active === false) continue;
        const mine = days.filter((d) => d.staffId === s.id && d.date === date);
        const src = mine.length > 0 ? mine : base.filter((d) => d.staffId === s.id && d.dow === dayIndex);
        const off = ex.some((x) => x.staffId === s.id && x.date === date && x.kind === '결근');
        const slots: AuxStaff['slots'] = [];
        if (!off) for (const d of src) {
            const startMin = minOf(d.startMin), endMin = minOf(d.endMin);
            if (startMin == null || endMin == null) continue;
            const trackName = str(d.classKey) ? d.classKey : null;
            slots.push({ trackName, startMin, endMin, status: trackName && d.source !== 'none' ? 'ok' : 'none' });
        }
        out.push({ auxId: s.id, name: str(s.name) ? s.name : s.id, slots });
    }
    return out;
}

// ── 요청 하나 몫의 그날 입력 ─────────────────────────────────

const WEEKEND = '주말';

/** doc 곁에 얹는 조각 — 없으면 빈 값(aux 는 partial) */
export const SIDE_PARTS = ['ops.calendar', 'ops.changes', 'ops.fixed', 'ops.classSubjects', 'ops.aux'] as const;
export type SidePart = (typeof SIDE_PARTS)[number];

/** 곁 조각이 빠진 채 계산했다는 표시(설계 ① 10절 ⑦ — 조용한 실패 금지). handler 의 DayResult·JudgeResult 에 얹어 돌려준다. */
export type DayPartial = { partial: 'aux'[] };
type DayLoaded = Extract<DayResult, { ok: true }> & DayPartial;
type JudgeLoaded = Extract<JudgeResult, { ok: true }> & DayPartial;

type Day = { off: string } | { g: GridDay; build: (slots: SlotItem[]) => ReturnType<typeof buildDayInput> };

/**
 * 요청 하나 몫의 loadDay·loadJudge — 그 요청 안에서 곁 조각은 조각마다, 시간표 판은 날짜마다 한 번만 연다(assign·force 가 둘 다 불러도).
 * - `open(pid, part)`: 곁 조각 하나 → 본문(없으면 null)
 * - `openDoc(pid, date)`: 그날을 덮는 시간표 판(D3 · parts/doc.ts openDocFor 의 `.doc`) → 시간표 v3 꼴(판이 없으면 null)
 * doc 이 null 이면 503 `day_unavailable` · 곁 조각이 null 이면 빈 값(aux 는 partial) · 복호 실패(500 `decrypt_failed`)는 여는 쪽이 던진 그대로.
 */
export function dayLoader(
    open: (projectId: string, part: SidePart) => Promise<unknown | null>,
    openDoc: (projectId: string, date: string) => Promise<unknown | null>,
): {
    loadDay(projectId: string, date: string): Promise<DayResult | DayLoaded>;
    loadJudge(projectId: string, date: string, slots: SlotItem[]): Promise<JudgeResult | JudgeLoaded>;
} {
    const memo = new Map<string, Promise<unknown | null>>();
    const once = (k: string, f: () => Promise<unknown | null>) => {
        let p = memo.get(k);
        if (!p) {
            p = f();
            memo.set(k, p);
        }
        return p;
    };
    const part = (pid: string, name: SidePart) => once(`${pid} ${name}`, () => open(pid, name));
    // 판 열기는 날짜 단위(그날을 덮는 판이 날마다 다를 수 있다) — 키에 조각 이름과 겹치지 않는 `doc:` 머리
    const doc = async (pid: string, date: string) => {
        const d = await once(`${pid} doc:${date}`, () => openDoc(pid, date));
        if (d == null) throw unavailable();
        return d;
    };
    const day = async (pid: string, date: string): Promise<Day> => {
        const dayIndex = dayIndexOf(date);
        const [body, cal, chg, fix, cls, aux] = await Promise.all([doc(pid, date), ...SIDE_PARTS.map((n) => part(pid, n))]);
        if (dayIndex > 4) return { off: WEEKEND };
        const g = gridDay(body, dayIndex);
        const people = [...g.tracks.map((t) => ({ id: 'homeroom:' + t.name, name: `${t.name} 담임`, kind: '담임' })), ...g.people];
        const calendar = calendarOn(cal, date);
        const changes = changesOn(chg, date);
        const fixed = [...g.fixed, ...fixedOf(fix)];
        const classSubjects = classSubjectsOn(cls, dayIndex);
        const auxDay = auxOn(aux, date, dayIndex);
        const build = (slots: SlotItem[]) =>
            buildDayInput({
                dayIndex, base: { tracks: g.tracks, people }, vps: [], fixed, slots, calendar, changes, classSubjects,
                periodStart: (track, n) => g.periods.get(track)?.[n - 1] ?? null, aux: auxDay,
            });
        return { g, build };
    };
    return {
        async loadDay(pid, date): Promise<DayResult | DayLoaded> {
            const d = await day(pid, date);
            if ('off' in d) return { ok: false, offReason: d.off };
            const r = d.build([]);
            if (!r.ok) return { ok: false, offReason: r.offReason };
            // buildDayInput 은 수업을 펼쳐 복사하므로 teacherIds 가 그대로 남는다(엔진 CandTrack 꼴)
            const tracks = r.input.tracks as CandTrack[];
            return { ok: true, tracks: tracks.map(({ name, grade, lessons }) => ({ name, grade, lessons })), people: d.g.people, partial: r.partial };
        },
        async loadJudge(pid, date, slots: SlotItem[]): Promise<JudgeResult | JudgeLoaded> {
            const d = await day(pid, date);
            if ('off' in d) return { ok: false, offReason: d.off };
            const r = d.build(slots);
            // buildDayInput 은 수업을 펼쳐 복사하므로 teacherIds 가 그대로 남는다(엔진 CandInput 꼴)
            return r.ok ? { ok: true, input: r.input as CandInput, partial: r.partial } : { ok: false, offReason: r.offReason };
        },
    };
}
