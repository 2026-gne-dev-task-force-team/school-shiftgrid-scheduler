// 그날 입력(① 8절) — 덩어리 `doc`(시간표 v3 꼴) → 그날의 반·수업·사람 → loadDay·loadJudge.
// 순수: doc 을 여는 일(읽기·복호·gunzip)은 주입(`open`). 한 요청 안에서 doc 은 한 번만 연다(B9 CPU 실측 — 691 KB 열기 141 ms).
// ⚠️ 지금은 doc 하나만 본다 — calendar·changes·fixed·classSubjects·aux 조각은 아직 안 얹는다(빈 값 · aux 는 partial).

import type { CandInput, CandLesson, CandTrack } from '../../../shared/sub-engine/candidates.ts';
import { buildDayInput, type FixedItem, type SlotItem } from '../../../shared/sub-engine/day-input.ts';
import { HttpError } from '../_shared/errors.ts';
import type { DayPerson, DayResult, JudgeResult, SubDeps } from './handler.ts';

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
const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
};

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

export interface GridDay { tracks: CandTrack[]; people: DayPerson[]; fixed: FixedItem[] }

/**
 * 그날의 반·수업(엔진 꼴) — 수업 칸 = 수업 슬롯(lessonsPerDay 앞 n개) + 배치가 있는 슬롯.
 * 배치 없는 수업 칸·`__homeroom__` 칸은 담임 수업(teacherIds 빈 배열). 사람은 에이전트만(담임은 `homeroom:<반>` 으로 따로).
 */
export function gridDay(doc: unknown, dayIndex: number): GridDay {
    const g = asGrid(doc);
    const actName = new Map((g.activities ?? []).map((a) => [a.id, a.name]));
    const tracks: CandTrack[] = g.tracks.map((t) => {
        const spec = g.specs.find((s) => s.id === t.specId);
        const slots = spec?.slots ?? [];
        const lunch = slots.find((s) => s.kind === 'lunch') ?? slots.find((s) => (s.label ?? '').includes('점심'));
        const lessonSlots = slots.filter((s) => s.assignable !== false && (s.kind ?? 'lesson') === 'lesson');
        const perDay = spec?.lessonsPerDay?.[String(dayIndex)];
        const idx = new Set((perDay == null ? lessonSlots : lessonSlots.slice(0, perDay)).map((s) => s.index));
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
    return { tracks, people, fixed };
}

const WEEKEND = '주말';

/**
 * 요청 하나 몫의 loadDay·loadJudge — `open(pid)` 은 그 요청 안에서 한 번만 부른다(assign·force 가 둘 다 불러도).
 * `open` 이 null(조각 없음)이면 503 `day_unavailable` · 복호 실패(500 `decrypt_failed`)는 `open` 이 던진 그대로.
 */
export function dayLoader(open: (projectId: string) => Promise<unknown | null>): Pick<SubDeps, 'loadDay' | 'loadJudge'> {
    const memo = new Map<string, Promise<unknown>>();
    const doc = (pid: string) => {
        let p = memo.get(pid);
        if (!p) {
            p = open(pid).then((d) => {
                if (d == null) throw unavailable();
                return d;
            });
            memo.set(pid, p);
        }
        return p;
    };
    const day = async (pid: string, date: string): Promise<{ off: string } | { dayIndex: number; g: GridDay }> => {
        const dayIndex = dayIndexOf(date);
        const body = await doc(pid);
        if (dayIndex > 4) return { off: WEEKEND };
        return { dayIndex, g: gridDay(body, dayIndex) };
    };
    return {
        async loadDay(pid, date): Promise<DayResult> {
            const d = await day(pid, date);
            if ('off' in d) return { ok: false, offReason: d.off };
            return { ok: true, tracks: d.g.tracks.map(({ name, grade, lessons }) => ({ name, grade, lessons })), people: d.g.people };
        },
        async loadJudge(pid, date, slots: SlotItem[]): Promise<JudgeResult> {
            const d = await day(pid, date);
            if ('off' in d) return { ok: false, offReason: d.off };
            const r = buildDayInput({
                dayIndex: d.dayIndex,
                base: { tracks: d.g.tracks, people: [...d.g.tracks.map((t) => ({ id: 'homeroom:' + t.name, name: `${t.name} 담임`, kind: '담임' })), ...d.g.people] },
                vps: [], fixed: d.g.fixed, slots, calendar: [], changes: [], classSubjects: [], periodStart: () => null, aux: null,
            });
            // buildDayInput 은 수업을 펼쳐 복사하므로 teacherIds 가 그대로 남는다(엔진 CandInput 꼴)
            return r.ok ? { ok: true, input: r.input as CandInput } : { ok: false, offReason: r.offReason };
        },
    };
}
