/** 복무 순수 셈 — 화면 0 · 노드 0. 입력은 줄 값 배열. */
import type { DutyRow } from './contracts/duty';

const MAX_PERIOD = 20;   // shortcut: 교시 상한 고정, 학교 교시 수가 넘으면 올린다

/** 「3-4」→[3,4] · 「5」→[5] · 「1,3」→[1,3]. 잘못된 값(빈 글자·0·역순 범위·상한 초과)은 null. */
export function parsePeriods(text: string): number[] | null {
    const out: number[] = [];
    for (const part of text.split(',')) {
        const m = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
        if (!m) return null;
        const a = Number(m[1]);
        const b = m[2] === undefined ? a : Number(m[2]);
        if (a < 1 || b < a || b > MAX_PERIOD) return null;
        for (let p = a; p <= b; p++) if (!out.includes(p)) out.push(p);
    }
    return out;
}

const day = (v: DutyRow['start']): string => {
    const s = typeof v === 'string' ? v : v?.start;
    return s ? s.slice(0, 10) : '';
}

export function absentAt(rows: readonly DutyRow[], date: string, period?: number): DutyRow[] {
    const d = date.slice(0, 10);
    return rows.filter((r) => {
        const s = day(r.start);
        if (!s) return false;
        const e = day(r.end) || s;
        if (d < s || d > e) return false;
        if (r.allDay || period === undefined) return true;   // 교시를 안 물으면 그 날 하루 기록 전부
        const ps = r.periods ? parsePeriods(r.periods) : null;
        return ps !== null && ps.includes(period);   // 교시가 비었거나 잘못이면 모르는 칸 — 안 빠지는 것으로 본다
    });
}

export function absentPeople(rows: readonly DutyRow[], date: string, period?: number): Set<string> {
    const ids = new Set<string>();
    for (const r of absentAt(rows, date, period)) {
        const p = r.person;
        for (const id of typeof p === 'string' ? [p] : p ?? []) if (id) ids.add(id);
    }
    return ids;
}
