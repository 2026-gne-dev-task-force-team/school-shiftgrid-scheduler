/**
 * 인쇄 증명 — 반 시간표 칸 글자 · 교사별 묶음 · 교실별 · 빈 칸. ⛔ 지어낸 이름만.
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SheetView } from './views/PrintTab';
import { printSheets } from './print';
import type { PrintTimes } from './print';
import { makePlan } from './model';
import type { LabelOf, Placement } from './types';

const NAMES: Record<string, string> = { c1: '가반', c2: '나반', s1: '국어', s2: '수학', t1: '갑돌', t2: '을순', r1: '1층 복도 끝 방' };
const label: LabelOf = (_k, id) => NAMES[id] ?? '찾을 수 없음';
const pl = (classId: string, day: Placement['day'], period: number, subjectId: string, teacherId: string, roomId?: string): Placement =>
    ({ classId, day, period, subjectId, teacherId, roomId });
const plan = makePlan('시험안', [
    pl('c1', 1, 1, 's1', 't1'),
    pl('c1', 2, 2, 's2', 't2', 'r1'),
    pl('c2', 1, 2, 's1', 't1'),
]);

describe('printSheets', () => {
    it('반별 — 반마다 한 장 · 칸 글자 · 빈 칸', () => {
        const sheets = printSheets(plan, 'class', label);
        expect(sheets.map((s) => s.title)).toEqual(['가반', '나반']);
        const a = sheets[0];
        expect(a.periods).toEqual([1, 2]);
        expect(a.days.map((d) => d.name)).toEqual(['월', '화']);
        expect(a.cells[0][0]).toBe('국어 갑돌');
        expect(a.cells[1][1]).toBe('수학 을순 · 1층 복도 끝 방');
        expect(a.cells[0][1]).toBe('');
        expect(sheets[1].cells[1][0]).toBe('국어 갑돌');
    });
    it('교사별 — 한 교사의 반 묶음이 한 장에', () => {
        const sheets = printSheets(plan, 'teacher', label);
        expect(sheets.map((s) => s.title)).toEqual(['갑돌', '을순']);
        expect(sheets[0].cells[0][0]).toBe('가반 국어');
        expect(sheets[0].cells[1][0]).toBe('나반 국어');
    });
    it('교실별 — 방이 있는 칸만', () => {
        const sheets = printSheets(plan, 'room', label);
        expect(sheets).toHaveLength(1);
        expect(sheets[0].title).toBe('1층 복도 끝 방');
        expect(sheets[0].cells[1][1]).toBe('가반 수학 을순');
    });
    it('같은 칸 겹침은 줄바꿈으로 잇고 빈 안은 한 줄 틀', () => {
        const both = makePlan('겹침', [pl('c1', 1, 1, 's1', 't1'), pl('c2', 1, 1, 's2', 't1')]);
        expect(printSheets(both, 'teacher', label)[0].cells[0][0]).toBe('가반 국어\n나반 수학');
        expect(printSheets(makePlan('빈', []), 'class', label)).toEqual([]);
    });
});

describe('printSheets — 교시 시각(일과표 약속)', () => {
    const T: Record<string, { start: string; end: string }> = {
        '3:1': { start: '09:00', end: '09:40' }, '3:2': { start: '09:50', end: '10:30' },
        '5:1': { start: '09:00', end: '09:40' }, '5:2': { start: '10:00', end: '10:40' },
    };
    const times: PrintTimes = { gradeOf: (id) => (id === 'c1' ? 3 : id === 'c2' ? 5 : undefined), timeOf: (g, n) => T[`${g}:${n}`] ?? null };
    it('반별 — 그 반 학년의 시각이 교시 옆에', () => {
        const sheets = printSheets(plan, 'class', label, times);
        expect(sheets[0].times).toEqual(['09:00–09:40', '09:50–10:30']);
        expect(sheets[1].times).toEqual(['09:00–09:40', '10:00–10:40']);
    });
    it('교사별 — 학년마다 시각이 다른 교시는 비운다(같으면 적는다)', () => {
        const sheets = printSheets(plan, 'teacher', label, times);   // 갑돌: 가반(3)·나반(5)
        expect(sheets[0].times).toEqual(['09:00–09:40', null]);
    });
    it('약속이 없거나 시각을 모르면 times 필드 자체가 없다(N교시만)', () => {
        expect(printSheets(plan, 'class', label)[0].times).toBeUndefined();
        expect(printSheets(plan, 'class', label, { gradeOf: () => undefined, timeOf: () => null })[0].times).toBeUndefined();
        expect(printSheets(plan, 'class', label, { gradeOf: () => 3, timeOf: () => null })[0].times).toBeUndefined();
    });
    it('인쇄 칸 — 교시 옆에 시각이 보이고, 없으면 N교시만', () => {
        const withT = renderToStaticMarkup(createElement(SheetView, { sheet: printSheets(plan, 'class', label, times)[0] }));
        expect(withT).toContain('1교시');
        expect(withT).toContain('09:00–09:40');
        const without = renderToStaticMarkup(createElement(SheetView, { sheet: printSheets(plan, 'class', label)[0] }));
        expect(without).toContain('1교시');
        expect(without).not.toContain('–');
    });
});
