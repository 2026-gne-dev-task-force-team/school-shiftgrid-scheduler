/**
 * 표 노드 다리 — 순수 applyTx(트랜잭션 → 문서)가 노드 data 에 저장될 꼴을 온전히 만든다.
 *   ⭐ 「다시 열어도 남는다」의 바탕: onCommit(tx) 를 문서에 적용한 결과를 setData 하면 되돌아온다.
 *   v3 새 길: cols.move(열 순서) 도 적용된다.
 */
import { describe, expect, it } from 'vitest';
import { applyTx, blankTable, type TableDoc } from './nodes';
import type { TableTx } from './contracts/table';

const base = (): TableDoc => ({
    cols: [{ key: 'a', title: 'A' }, { key: 'b', title: 'B' }, { key: 'c', title: 'C' }],
    rows: [
        { id: 'r0', cells: { a: '1', b: '2', c: '3' } },
        { id: 'r1', cells: { a: '4', b: '5', c: '6' } },
    ],
    merges: [],
});

describe('표 노드 — applyTx', () => {
    it('빈 표는 3×3 · 머리 행 켬', () => {
        const d = blankTable();
        expect(d.cols).toHaveLength(3);
        expect(d.rows).toHaveLength(3);
        expect(d.headerRow).toBe(true);
    });

    it('칸 글자 변경이 문서에 남는다', () => {
        const d = applyTx(base(), { cells: [{ rowId: 'r0', key: 'b', value: '바뀜' }], source: 'edit' });
        expect(d.rows[0].cells.b).toBe('바뀜');
    });

    it('행 넣기(ids)·지우기·옮기기', () => {
        let d = applyTx(base(), { cells: [], rows: { add: [{ at: 1, count: 1, cells: [{ a: 'x' }], ids: ['rN'] }] }, source: 'menu' });
        expect(d.rows.map((r) => r.id)).toEqual(['r0', 'rN', 'r1']);
        d = applyTx(d, { cells: [], rows: { remove: ['rN'] }, source: 'menu' });
        expect(d.rows.map((r) => r.id)).toEqual(['r0', 'r1']);
        d = applyTx(d, { cells: [], rows: { move: [{ id: 'r0', to: 1 }] }, source: 'drag' });
        expect(d.rows.map((r) => r.id)).toEqual(['r1', 'r0']);
    });

    it('열 넣기·순서 바꾸기(cols.move)·지우기', () => {
        let d = applyTx(base(), { cells: [], cols: { add: [{ at: 3, key: 'd', title: 'D' }] }, source: 'menu' });
        expect(d.cols.map((c) => c.key)).toEqual(['a', 'b', 'c', 'd']);
        d = applyTx(d, { cells: [], cols: { move: [{ key: 'a', to: 2 }] }, source: 'drag' });
        expect(d.cols.map((c) => c.key)).toEqual(['b', 'c', 'a', 'd']);
        d = applyTx(d, { cells: [], cols: { remove: ['d'] }, source: 'menu' });
        expect(d.cols.map((c) => c.key)).toEqual(['b', 'c', 'a']);
    });

    it('병합 넣기·풀기', () => {
        let d = applyTx(base(), { cells: [], merge: { set: [{ rowId: 'r0', key: 'a', rowSpan: 2, colSpan: 2 }] }, source: 'menu' });
        expect(d.merges).toHaveLength(1);
        d = applyTx(d, { cells: [], merge: { clear: [{ rowId: 'r0', key: 'a' }] }, source: 'menu' });
        expect(d.merges).toHaveLength(0);
    });

    it('원본 문서를 바꾸지 않는다(순수)', () => {
        const d0 = base();
        const tx: TableTx = { cells: [{ rowId: 'r0', key: 'a', value: 'z' }], source: 'edit' };
        applyTx(d0, tx);
        expect(d0.rows[0].cells.a).toBe('1');
    });
});
