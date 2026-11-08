/**
 * 역트랜잭션 검산(M1 넘긴 「행/열 undo」) — cells·rows(add/remove/move)·cols(resize/rename/add/remove)·axis·merge.
 *   🔴 짝 규칙: add↔remove 는 같은 id 로 맞춘다(안정된 id). 여기서 못 박는다.
 */
import { describe, expect, it } from 'vitest';
import { inverseTx, txHasEffect } from './history';
import type { MergeRegion, TableColumn, TableRow, TableTx } from '../contracts/table';

const cols: TableColumn[] = [{ key: 'a', title: '가', width: 100 }, { key: 'b', title: '나' }];
const rows: TableRow[] = [
    { id: 'r0', cells: { a: '옛', b: 'x' } },
    { id: 'r1', cells: { a: '둘', b: 'y' } },
];

describe('inverseTx — cells', () => {
    it('칸 변경의 역은 지금 값으로 되돌린다', () => {
        const tx: TableTx = { cells: [{ rowId: 'r0', key: 'a', value: '새' }], source: 'edit' };
        expect(inverseTx(tx, rows, cols, undefined).cells).toEqual([{ rowId: 'r0', key: 'a', value: '옛' }]);
    });
});

describe('inverseTx — rows', () => {
    it('add 의 역은 그 id 들을 지운다', () => {
        const tx: TableTx = { cells: [], rows: { add: [{ at: 2, count: 1, ids: ['new1'], cells: [{ a: 'z' }] }] }, source: 'menu' };
        expect(inverseTx(tx, rows, cols, undefined).rows).toEqual({ remove: ['new1'] });
    });
    it('🔴 remove 의 역은 옛 자리·옛 값·옛 id 로 되살린다', () => {
        const tx: TableTx = { cells: [], rows: { remove: ['r0'] }, source: 'menu' };
        const inv = inverseTx(tx, rows, cols, undefined);
        expect(inv.rows?.add).toEqual([{ at: 0, count: 1, ids: ['r0'], cells: [{ a: '옛', b: 'x' }] }]);
    });
    it('move 의 역은 옛 자리로 되돌린다', () => {
        const tx: TableTx = { cells: [], rows: { move: [{ id: 'r1', to: 0 }] }, source: 'menu' };
        expect(inverseTx(tx, rows, cols, undefined).rows?.move).toEqual([{ id: 'r1', to: 1 }]);
    });
});

describe('inverseTx — cols·axis·merge', () => {
    it('resize 의 역은 옛 폭', () => {
        const tx: TableTx = { cells: [], cols: { resize: [{ key: 'a', width: 200 }] }, source: 'drag' };
        expect(inverseTx(tx, rows, cols, undefined).cols?.resize).toEqual([{ key: 'a', width: 100 }]);
    });
    it('rename 의 역은 옛 이름', () => {
        const tx: TableTx = { cells: [], cols: { rename: [{ key: 'a', title: '바꿈' }] }, source: 'menu' };
        expect(inverseTx(tx, rows, cols, undefined).cols?.rename).toEqual([{ key: 'a', title: '가' }]);
    });
    it('col add 의 역은 remove', () => {
        const tx: TableTx = { cells: [], cols: { add: [{ at: 2, key: 'c', title: '다' }] }, source: 'menu' };
        expect(inverseTx(tx, rows, cols, undefined).cols?.remove).toEqual(['c']);
    });
    it('axis rowWeight 의 역은 부호 뒤집기', () => {
        const tx: TableTx = { cells: [], axis: { rowWeight: [{ id: 'r0', delta: 10 }] }, source: 'drag' };
        expect(inverseTx(tx, rows, cols, undefined).axis?.rowWeight).toEqual([{ id: 'r0', delta: -10 }]);
    });
    it('merge set 의 역은 clear', () => {
        const tx: TableTx = { cells: [], merge: { set: [{ rowId: 'r0', key: 'a', rowSpan: 2, colSpan: 1 }] }, source: 'menu' };
        expect(inverseTx(tx, rows, cols, undefined).merge?.clear).toEqual([{ rowId: 'r0', key: 'a' }]);
    });
    it('merge clear 의 역은 옛 영역을 되살린다', () => {
        const prev: MergeRegion[] = [{ rowId: 'r0', key: 'a', rowSpan: 2, colSpan: 1 }];
        const tx: TableTx = { cells: [], merge: { clear: [{ rowId: 'r0', key: 'a' }] }, source: 'menu' };
        expect(inverseTx(tx, rows, cols, prev).merge?.set).toEqual(prev);
    });
});

describe('txHasEffect', () => {
    it('빈 tx 는 효과 없음', () => {
        expect(txHasEffect({ cells: [], source: 'edit' })).toBe(false);
    });
    it('무엇이든 있으면 효과 있음', () => {
        expect(txHasEffect({ cells: [{ rowId: 'r0', key: 'a', value: 'x' }], source: 'edit' })).toBe(true);
        expect(txHasEffect({ cells: [], merge: { set: [{ rowId: 'r0', key: 'a', rowSpan: 2, colSpan: 1 }] }, source: 'menu' })).toBe(true);
    });
});
