/** 보결 목록(날짜·교시별)과 「내 것」 — 순수 함수. 가림은 visibility.ts, 자료는 source.ts. */
import type { VisibleRow } from './visibility';

export interface TimeGroup { startMin: number; endMin: number; rows: VisibleRow[] }
export interface DayGroup { date: string; times: TimeGroup[] }

const byTrack = (a: VisibleRow, b: VisibleRow) => a.trackName.localeCompare(b.trackName, 'ko', { numeric: true });

/** 날짜 → 시작 시각 순으로 묶는다. 같은 시각 안은 반 이름 순. 교시 번호가 아니라 시각이 열쇠다(5절). */
export function groupByDateAndTime(rows: VisibleRow[]): DayGroup[] {
    const days = new Map<string, Map<number, TimeGroup>>();
    for (const r of rows) {
        const d = days.get(r.date) ?? new Map<number, TimeGroup>();
        const t = d.get(r.startMin) ?? { startMin: r.startMin, endMin: r.endMin, rows: [] };
        t.rows.push(r);
        d.set(r.startMin, t);
        days.set(r.date, d);
    }
    return [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, d]) => ({
        date,
        times: [...d.values()].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin).map((t) => ({ ...t, rows: [...t.rows].sort(byTrack) })),
    }));
}

export interface Mine { taking: VisibleRow[]; absent: VisibleRow[] }

/** 「내 것」 = 내 personRef 가 맡은 줄 + 내가 빠진(결근자인) 줄. 이름이 아니라 personRef 비교(5절 「이름 일치를 버린 곳」). */
export function mineOf(rows: VisibleRow[], personRef: string | null): Mine {
    if (personRef === null) return { taking: [], absent: [] };
    const cmp = (a: VisibleRow, b: VisibleRow) => a.date.localeCompare(b.date) || a.startMin - b.startMin || byTrack(a, b);
    return {
        taking: rows.filter((r) => r.take?.takerRef === personRef).sort(cmp),
        absent: rows.filter((r) => r.body.absentRef === personRef).sort(cmp),
    };
}
