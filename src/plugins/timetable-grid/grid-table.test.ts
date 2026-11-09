import { describe, it, expect } from 'vitest';
import { blankTimetable, getCell } from './model';
import { applyGridTx, gridToTable } from './views/grid-slot';

describe('시간표 ↔ 표 편집기 다리', () => {
    it('칸·행 이름·시각 고치기가 시간표 데이터로 간다', () => {
        const d0 = blankTimetable();
        const r0 = d0.rows[0].id;
        const d = applyGridTx(d0, { cells: [
            { rowId: r0, key: 'c1', value: '국어' },
            { rowId: r0, key: '_name', value: '1' },
            { rowId: r0, key: '_time', value: '08:40~09:30' },
        ], source: 'edit' });
        expect(getCell(d, 1, 0)?.text).toBe('국어');
        expect(d.rows[0].name).toBe('1');
        expect(d.rows[0].range).toEqual({ start: 520, end: 570 });
    });

    it('병합이 오가고, 행 높이 끌기는 끝 시각을 민다', () => {
        const d0 = blankTimetable();
        const r0 = d0.rows[0].id;
        const d1 = applyGridTx(d0, { cells: [], merge: { set: [{ rowId: r0, key: 'c0', rowSpan: 2, colSpan: 1 }] }, source: 'menu' });
        expect(gridToTable(d1, true).merges).toEqual([{ rowId: r0, key: 'c0', rowSpan: 2, colSpan: 1 }]);
        const d2 = applyGridTx(d1, { cells: [], axis: { rowWeight: [{ id: r0, delta: 8 }] }, source: 'drag' });
        expect(d2.rows[0].range.end).toBe(d1.rows[0].range.end + 10);
    });
});
