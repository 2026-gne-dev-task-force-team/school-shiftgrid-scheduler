/** 일과표 순수 셈 — 학년마다 점심이 달라 같은 N교시가 다른 시각인 문제. 학교 흉내 값만(지어낸 시각). */
import { describe, it, expect } from 'vitest';
import { slotsForGrade, timeOf, overlaps, lunchOf, dismissalOf, checkRows, rowOf } from './clock';
import type { SlotRow } from './contracts/clock';

const cls = (period: number, start: string, end: string, grades: string[]): SlotRow => ({ kind: 'class', period, start, end, grades });

// 3·4학년: 4교시 뒤 점심(12:10) / 5·6학년: 5교시 뒤 점심(13:00) — 40분 수업, 쉬는 시간은 줄이 없어도 시각이 이어진다.
const rows: SlotRow[] = [
    cls(1, '09:00', '09:40', []), cls(2, '09:50', '10:30', []), cls(3, '10:40', '11:20', []),
    cls(4, '11:30', '12:10', ['3', '4']), { kind: 'lunch', start: '12:10', end: '12:50', grades: ['3', '4'] },
    cls(5, '12:50', '13:30', ['3', '4']), { kind: 'dismissal', start: '13:40', grades: ['3', '4'] },
    cls(4, '11:30', '12:10', ['5', '6']),   // 5·6학년도 4교시는 같은 시각
    { kind: 'lunch', start: '13:00', end: '13:40', grades: ['5', '6'] },
    cls(5, '12:20', '13:00', ['5', '6']),
    cls(6, '13:40', '14:20', ['5', '6']), { kind: 'dismissal', start: '14:30', grades: ['5', '6'] },
];

describe('slotsForGrade · timeOf', () => {
    it('그 학년 칸만(전 학년 줄 포함) 시각순', () => {
        const s = slotsForGrade(rows, 3).map((r) => r.start);
        expect(s).toEqual([...s].sort());
        expect(slotsForGrade(rows, 3).some((r) => r.grades?.includes('5'))).toBe(false);
        expect(slotsForGrade(rows, 3)[0].period).toBe(1);
    });
    it('N교시 시각 · 없으면 null', () => {
        expect(timeOf(rows, 3, 5)).toEqual({ start: '12:50', end: '13:30' });
        expect(timeOf(rows, 5, 5)).toEqual({ start: '12:20', end: '13:00' });
        expect(timeOf(rows, 3, 6)).toBeNull();
    });
});

describe('overlaps — 교시 번호가 아니라 실제 시각', () => {
    it('3학년 5교시(12:50~13:30) 와 5학년 5교시(12:20~13:00) 는 겹친다(다른 시각인데 일부 겹침)', () => {
        expect(overlaps(rows, { grade: 3, period: 5 }, { grade: 5, period: 5 })).toBe(true);
    });
    it('같은 교시 번호인데 다른 시각이면 겹침 0 — 3학년 5교시 vs 5학년 6교시(13:40~)', () => {
        expect(overlaps(rows, { grade: 3, period: 5 }, { grade: 5, period: 6 })).toBe(false);
        expect(overlaps(rows, { grade: 3, period: 1 }, { grade: 5, period: 5 })).toBe(false);
    });
    it('「3학년 4교시 = 5학년 5교시」 꼴 — 점심이 다른 학교에서 시각이 같으면 겹침 1', () => {
        const r: SlotRow[] = [
            cls(4, '11:00', '11:40', ['3']), cls(5, '11:00', '11:40', ['5']),   // 3학년은 점심이 늦어 4교시가 11:00, 5학년은 점심 앞 5교시가 11:00
        ];
        expect(overlaps(r, { grade: 3, period: 4 }, { grade: 5, period: 5 })).toBe(true);
        expect(overlaps(r, { grade: 3, period: 4 }, { grade: 5, period: 4 })).toBe(false);   // 같은 번호 4 — 5학년 4교시는 줄이 없다
    });
    it('맞닿기만 하면 안 겹치고, 시각을 모르면 false', () => {
        const r: SlotRow[] = [cls(1, '09:00', '09:40', ['1']), cls(2, '09:40', '10:20', ['2'])];
        expect(overlaps(r, { grade: 1, period: 1 }, { grade: 2, period: 2 })).toBe(false);
        expect(overlaps(r, { grade: 1, period: 9 }, { grade: 2, period: 2 })).toBe(false);
    });
});

describe('lunchOf · dismissalOf', () => {
    it('학년마다 다른 점심·하교', () => {
        expect(lunchOf(rows, 3)).toEqual({ start: '12:10', end: '12:50' });
        expect(lunchOf(rows, 6)).toEqual({ start: '13:00', end: '13:40' });
        expect(dismissalOf(rows, 4)).toBe('13:40');
        expect(dismissalOf(rows, 6)).toBe('14:30');
        expect(dismissalOf(rows, 1)).toBeNull();
    });
});

describe('checkRows — 잘못된 시각', () => {
    const bad: SlotRow[] = [
        cls(1, '25:00', '26:00', []), cls(2, '10:00', '09:00', []), cls(3, '09:00', '09:60', []),
        { kind: 'class', period: 4, start: '', end: '10:00' }, cls(5, '09:00', '09:40', []),
        { kind: 'dismissal', start: '13:40' },
    ];
    it('이유와 함께 돌려주고(올바른 줄 · 끝 없는 하교는 통과)', () => {
        const p = checkRows(bad);
        expect(p.map((x) => x.index)).toEqual([0, 1, 2, 3]);
        expect(p[1].reason).toContain('늦어야');
    });
    it('셈에서는 잘못된 줄이 빠진다', () => {
        expect(timeOf(bad, 1, 1)).toBeNull();
        expect(timeOf(bad, 1, 2)).toBeNull();
        expect(timeOf(bad, 1, 5)).toEqual({ start: '09:00', end: '09:40' });
    });
});

describe('rowOf', () => {
    it('칸 값 → 줄', () => {
        expect(rowOf({ f_kind: 'class', f_period: 2, f_start: '09:50', f_end: '10:30', f_grades: ['1'] }))
            .toEqual({ kind: 'class', period: 2, start: '09:50', end: '10:30', grades: ['1'] });
        expect(rowOf({}).grades).toEqual([]);
    });
});
