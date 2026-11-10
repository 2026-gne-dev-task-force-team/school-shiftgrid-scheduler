import { describe, it, expect } from 'vitest';
import { parsePeriods, absentAt, absentPeople } from './absence';
import type { DutyRow } from './contracts/duty';

describe('parsePeriods', () => {
    it('범위·하나·쉼표', () => {
        expect(parsePeriods('3-4')).toEqual([3, 4]);
        expect(parsePeriods('5')).toEqual([5]);
        expect(parsePeriods('1,3')).toEqual([1, 3]);
        expect(parsePeriods(' 1 , 3-4 ')).toEqual([1, 3, 4]);
    });
    it('잘못된 값은 null', () => {
        for (const t of ['', 'a', '0', '4-3', '1,', '-3', '3-', '1-99', '1.5']) expect(parsePeriods(t), t).toBeNull();
    });
});

const R = (o: Partial<DutyRow>): DutyRow => ({ person: ['p1'], start: '2026-03-10', ...o });

describe('absentAt', () => {
    it('기간 경계 — 시작일·끝일 당일 포함, 전날·다음날 제외', () => {
        const rows = [R({ end: '2026-03-12', allDay: true })];
        expect(absentAt(rows, '2026-03-09')).toHaveLength(0);
        expect(absentAt(rows, '2026-03-10')).toHaveLength(1);
        expect(absentAt(rows, '2026-03-11')).toHaveLength(1);
        expect(absentAt(rows, '2026-03-12')).toHaveLength(1);
        expect(absentAt(rows, '2026-03-13')).toHaveLength(0);
    });
    it('끝일 빈 값은 시작일 하루', () => {
        for (const end of [undefined, null, '']) {
            const rows = [R({ end, allDay: true })];
            expect(absentAt(rows, '2026-03-10')).toHaveLength(1);
            expect(absentAt(rows, '2026-03-11')).toHaveLength(0);
        }
    });
    it('종일은 모든 교시, 교시 기록은 그 교시만', () => {
        expect(absentAt([R({ allDay: true })], '2026-03-10', 7)).toHaveLength(1);
        const rows = [R({ periods: '3-4' })];
        expect(absentAt(rows, '2026-03-10', 3)).toHaveLength(1);
        expect(absentAt(rows, '2026-03-10', 4)).toHaveLength(1);
        expect(absentAt(rows, '2026-03-10', 5)).toHaveLength(0);
        expect(absentAt(rows, '2026-03-10')).toHaveLength(1);   // 교시 안 물으면 그 날 전부
    });
    it('종일이면 교시 글자는 무시(잘못이어도)', () => {
        expect(absentAt([R({ allDay: true, periods: 'zzz' })], '2026-03-10', 2)).toHaveLength(1);
    });
    it('잘못된·빈 교시 글자는 안 빠지는 것으로 본다', () => {
        expect(absentAt([R({ periods: 'zzz' })], '2026-03-10', 2)).toHaveLength(0);
        expect(absentAt([R({ periods: '' })], '2026-03-10', 2)).toHaveLength(0);
    });
    it('date 칸 값({start})·시간 붙은 값·시작일 없는 줄', () => {
        expect(absentAt([R({ start: { start: '2026-03-10T09:00' }, end: { start: '2026-03-11' }, allDay: true })], '2026-03-11')).toHaveLength(1);
        expect(absentAt([R({ start: null, allDay: true })], '2026-03-10')).toHaveLength(0);
    });
});

describe('absentPeople', () => {
    it('사람 id 집합 — 중복 합침 · 문자열/배열 · 빈 값 건너뜀', () => {
        const rows = [R({ allDay: true }), R({ person: 'p2', allDay: true }), R({ person: [], allDay: true }), R({ person: ['p1', 'p3'], periods: '2' })];
        expect([...absentPeople(rows, '2026-03-10', 2)].sort()).toEqual(['p1', 'p2', 'p3']);
        expect([...absentPeople(rows, '2026-03-10', 5)].sort()).toEqual(['p1', 'p2']);
        expect(absentPeople(rows, '2026-04-01').size).toBe(0);
    });
});
