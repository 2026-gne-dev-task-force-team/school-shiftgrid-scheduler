/**
 * 일과표 순수 셈 — 화면 0 · 노드 0. 입력은 줄 값 배열(SlotRow). 잘못된 줄은 셈에서 조용히 빠지고, 이유는 checkRows 가 따로 말한다.
 *   🔴 같은 학년·같은 교시가 여러 줄이면(전 학년 줄 + 그 학년 줄) 시각이 이른 줄이 이긴다.
 */
import type { Clock, PeriodRef, RowProblem, SlotRow, TimeRange } from './contracts/clock';

/** 칸 키 — config 의 칸 정의와 rowOf 가 같은 값을 쓴다. */
export const SLOT_KEYS = { kind: 'f_kind', period: 'f_period', start: 'f_start', end: 'f_end', grades: 'f_grades' } as const;

const str = (x: unknown): string | undefined => (typeof x === 'string' ? x : undefined);

/** 줄(노드) 칸 값 → SlotRow. */
export function rowOf(values: Record<string, unknown>): SlotRow {
    const p = values[SLOT_KEYS.period], g = values[SLOT_KEYS.grades];
    return {
        kind: str(values[SLOT_KEYS.kind]),
        period: typeof p === 'number' ? p : null,
        start: str(values[SLOT_KEYS.start]),
        end: str(values[SLOT_KEYS.end]),
        grades: Array.isArray(g) ? (g as string[]) : [],
    };
}

/** 'HH:MM' → 분(0~1439). 형식이 틀리거나 25:00·09:60 이면 null. */
function minutes(t: string | undefined): number | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec((t ?? '').trim());
    if (!m) return null;
    const h = Number(m[1]), mm = Number(m[2]);
    return h < 24 && mm < 60 ? h * 60 + mm : null;
}

function problemOf(r: SlotRow): string | null {
    const s = minutes(r.start);
    if (s === null) return '시작 시각이 없거나 HH:MM 이 아닙니다';
    if (r.kind === 'dismissal' && !r.end?.trim()) return null;   // 하교는 한 시각이면 된다
    const e = minutes(r.end);
    if (e === null) return '끝 시각이 없거나 HH:MM 이 아닙니다';
    if (e <= s) return '끝이 시작보다 늦어야 합니다';
    return null;
}

export function slotsForGrade(rows: readonly SlotRow[], grade: number): SlotRow[] {
    return rows
        .filter((r) => problemOf(r) === null && (!r.grades?.length || r.grades.includes(String(grade))))
        .sort((a, b) => minutes(a.start)! - minutes(b.start)!);
}

const range = (r: SlotRow | undefined): TimeRange | null => (r ? { start: r.start!.trim(), end: (r.end ?? '').trim() } : null);

export function timeOf(rows: readonly SlotRow[], grade: number, period: number): TimeRange | null {
    return range(slotsForGrade(rows, grade).find((r) => r.kind === 'class' && r.period === period));
}

export function overlaps(rows: readonly SlotRow[], a: PeriodRef, b: PeriodRef): boolean {
    const x = timeOf(rows, a.grade, a.period), y = timeOf(rows, b.grade, b.period);
    if (!x || !y) return false;
    return minutes(x.start)! < minutes(y.end)! && minutes(y.start)! < minutes(x.end)!;
}

export function lunchOf(rows: readonly SlotRow[], grade: number): TimeRange | null {
    return range(slotsForGrade(rows, grade).find((r) => r.kind === 'lunch'));
}

export function dismissalOf(rows: readonly SlotRow[], grade: number): string | null {
    return slotsForGrade(rows, grade).find((r) => r.kind === 'dismissal')?.start?.trim() ?? null;
}

export function checkRows(rows: readonly SlotRow[]): RowProblem[] {
    const out: RowProblem[] = [];
    rows.forEach((r, index) => { const reason = problemOf(r); if (reason) out.push({ index, reason }); });
    return out;
}

export const clockApi: Clock = { version: 1, slotsForGrade, timeOf, overlaps, lunchOf, dismissalOf, checkRows };
