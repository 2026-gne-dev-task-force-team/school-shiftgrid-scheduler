/**
 * 리치 셀 2단계 — 시간표 ↔ 시트 모양 바꾸기(sheetView.ts) 순수 검산.
 */
import { describe, expect, it } from 'vitest';
import { resolveFeatures } from '../sheet/features/assemble';
import { lookupFeature } from '../sheet/features/registry';
import { blankTimetable, mergeCells, setCellText } from './model';
import { applyTableTx, gapOf, toTable, timetableFeature, TIMETABLE_FEATURES } from './sheetView';

const PPM = 0.8;

describe('시간표 → 시트 모양(toTable)', () => {
    it('열 = 요일 · 행 = 교시(머리 이름 + 시각, 높이 = 분 × ppm) · 병합 = MergeRegion', () => {
        let d = blankTimetable();
        d = setCellText(d, 0, 0, '국어');
        d = mergeCells(d, { col0: 1, row0: 0, col1: 1, row1: 1 });
        const t = toTable(d, PPM);
        expect(t.columns.map((c) => c.title)).toEqual(['월', '화', '수', '목', '금']);
        expect(t.rows[0]).toMatchObject({ label: '1교시', sub: '09:00~09:50', weight: 40, cells: { c0: '국어' } });
        expect(t.merges).toEqual([{ rowId: d.rows[0].id, key: 'c1', rowSpan: 2, colSpan: 1 }]);
    });

    it('쉬는 시간 = 행 앞 틈(첫 행은 없다)', () => {
        const d = blankTimetable();
        expect(gapOf(d, PPM, d.rows[0].id)).toBeUndefined();
        expect(gapOf(d, PPM, d.rows[1].id)).toEqual({ size: 8, label: '쉬는 시간 10분' });
    });
});

describe('시트 확정 → 시간표(applyTableTx)', () => {
    it('칸 글자 · 행 이름 · 열 이름 · 열 폭', () => {
        const d0 = blankTimetable();
        const r1 = d0.rows[1].id;
        const d = applyTableTx(d0, {
            cells: [{ rowId: r1, key: 'c2', value: '수학' }],
            rows: { rename: [{ id: r1, label: '조회' }] },
            cols: { rename: [{ key: 'c0', title: 'MON' }], resize: [{ key: 'c0', width: 200 }] },
            source: 'edit',
        }, PPM);
        expect(d.cells['c2r1']?.text).toBe('수학');
        expect(d.rows[1].name).toBe('조회');
        expect(d.colNames?.['0'] ?? d.colNames).toBeTruthy();
        expect(d.colWidths).toEqual({ '0': 200 });
    });

    it('행 높이 끌기(px) → 길이(분, 5분 단위) · 뒤 행이 밀린다', () => {
        const d0 = blankTimetable();
        const d = applyTableTx(d0, { cells: [], axis: { rowWeight: [{ id: d0.rows[0].id, delta: 40 }] }, source: 'drag' }, PPM);
        expect(d.rows[0].range).toEqual({ start: 540, end: 640 });
        expect(d.rows[1].range.start).toBe(650);
    });

    it('틈 끌기(px) → 쉬는 시간(분) · 뒤 행이 밀린다', () => {
        const d0 = blankTimetable();
        const d = applyTableTx(d0, { cells: [], axis: { rowGap: [{ id: d0.rows[1].id, delta: 16 }] }, source: 'drag' }, PPM);
        expect(d.rows.map((r) => r.range.start)).toEqual([540, 620, 680, 740, 800, 860]);
    });

    it('행 넣기는 시트가 매긴 id 를 그대로 쓰고 칸도 채운다(붙여넣기 넘침) · 행 빼기', () => {
        const d0 = blankTimetable();
        const d = applyTableTx(d0, { cells: [], rows: { add: [{ at: 6, count: 1, ids: ['tbl_9'], cells: [{ c0: '동아리' }] }] }, source: 'paste' }, PPM);
        expect(d.rows).toHaveLength(7);
        expect(d.rows[6].id).toBe('tbl_9');
        expect(d.cells['c0r6']?.text).toBe('동아리');
        const e = applyTableTx(d, { cells: [], rows: { remove: ['tbl_9'] }, source: 'menu' }, PPM);
        expect(e.rows).toHaveLength(6);
    });

    it('병합 · 해제', () => {
        const d0 = blankTimetable();
        const id = d0.rows[0].id;
        const d = applyTableTx(d0, { cells: [], merge: { set: [{ rowId: id, key: 'c0', rowSpan: 2, colSpan: 2 }] }, source: 'menu' }, PPM);
        expect(d.cells['c0r0']).toMatchObject({ rowSpan: 2, colSpan: 2 });
        const e = applyTableTx(d, { cells: [], merge: { clear: [{ rowId: id, key: 'c0' }] }, source: 'menu' }, PPM);
        expect(e.cells['c0r0']?.rowSpan ?? 1).toBe(1);
    });

    it('열 빼기 · 열 넣기(요일이 꽉 차면 무시)', () => {
        const d0 = blankTimetable();
        const d = applyTableTx(d0, { cells: [], cols: { remove: ['c4'] }, source: 'menu' }, PPM);
        expect(toTable(d, PPM).columns).toHaveLength(4);
        const e = applyTableTx(d, { cells: [{ rowId: d.rows[0].id, key: 'col_1', value: '토' }], cols: { add: [{ at: 4, key: 'col_1', title: '' }] }, source: 'paste' }, PPM);
        expect(toTable(e, PPM).columns).toHaveLength(5);
        expect(e.cells['c4r0']?.text).toBe('토');
    });
});

describe('기능 모듈 timetable — 시트 조각을 needs 로 엮는다', () => {
    it('조립이 된다(needs 빠짐·conflicts 없음)', () => {
        const ids = resolveFeatures(TIMETABLE_FEATURES, lookupFeature).map((f) => f.id);
        expect(ids).toContain('timetable');
        expect(ids.indexOf('row-head')).toBeLessThan(ids.indexOf('timetable'));
    });
    it('row-head 를 빼면 던진다(버그 심기)', () => {
        expect(() => resolveFeatures(['row-gaps', 'row-weight', 'merge', timetableFeature], lookupFeature)).toThrow(/row-head/);
    });
});
