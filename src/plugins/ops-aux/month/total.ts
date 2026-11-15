/** 월 합계 — 보조별 근무 양(분) + 예외 합 + 정정 합. 「정정 후」는 근무+예외+정정, 「정정 전」은 근무+예외. */
import { effectiveOn } from '../ops';
import type { AuxPart } from '../types';

export interface MonthTotal { staffId: string; ym: string; work: number; exceptions: number; correction: number; before: number; after: number; closed: boolean }

const datesOf = (ym: string): string[] => {
    const [y, m] = ym.split('-').map(Number);
    const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return Array.from({ length: n }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`);
};

export function monthTotals(p: AuxPart, ym: string): MonthTotal[] {
    const eff = datesOf(ym).flatMap((d) => effectiveOn(p, d));
    return p.staff.map((s) => {
        const work = eff.filter((e) => e.staffId === s.id).reduce((a, e) => a + (e.endMin - e.startMin), 0);
        const mine = p.exceptions.filter((e) => e.staffId === s.id && e.date.startsWith(`${ym}-`));
        const exceptions = mine.filter((e) => e.kind !== '정정').reduce((a, e) => a + e.amount, 0);
        const correction = mine.filter((e) => e.kind === '정정').reduce((a, e) => a + e.amount, 0);
        return { staffId: s.id, ym, work, exceptions, correction, before: work + exceptions, after: work + exceptions + correction, closed: p.monthClose.some((m) => m.staffId === s.id && m.ym === ym) };
    });
}
