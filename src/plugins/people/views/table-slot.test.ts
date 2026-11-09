import { describe, it, expect } from 'vitest';
import { applyTableTx, type TableSlotProps } from './table-slot';

function spy() {
    const log: string[] = [];
    const props: TableSlotProps = {
        columns: [{ key: 'name', title: '이름' }, { key: 'memo', title: '메모' }],
        rows: [{ id: 'a', cells: {} }, { id: 'b', cells: {} }, { id: 'c', cells: {} }],
        onCellChange: (id, k, v) => log.push(`cell ${id}.${k}=${v}`),
        onAddRow: () => log.push('add'),
        onDeleteRow: (id) => log.push(`del ${id}`),
        onMoveRow: (id, d) => log.push(`move ${id} ${d}`),
        onPaste: (t) => log.push(`paste ${JSON.stringify(t)}`),
    };
    return { log, props };
}
const tsv = (cells: string[][]) => cells.map((r) => r.join('\t')).join('\n');

describe('표 편집기 묶음 변경 → 표 자리 콜백', () => {
    it('칸 고치기·지우기', () => {
        const { log, props } = spy();
        applyTableTx({ cells: [{ rowId: 'a', key: 'name', value: '가' }], rows: { remove: ['b'] }, source: 'edit' }, props, tsv);
        expect(log).toEqual(['cell a.name=가', 'del b']);
    });
    it('빈 줄 더하기는 줄 추가, 값 있는 줄(넘친 붙여넣기)은 열 순서대로 붙여넣기', () => {
        const { log, props } = spy();
        applyTableTx({ cells: [], rows: { add: [{ at: 3, count: 1, cells: [{}] }] }, source: 'menu' }, props, tsv);
        applyTableTx({ cells: [], rows: { add: [{ at: 3, count: 2, cells: [{ memo: 'm1', name: 'n1' }, { name: 'n2' }] }] }, source: 'paste' }, props, tsv);
        expect(log).toEqual(['add', 'paste "n1\\tm1\\nn2\\t"']);
    });
    it('옮기기는 한 칸씩 여러 번', () => {
        const { log, props } = spy();
        applyTableTx({ cells: [], rows: { move: [{ id: 'a', to: 2 }, { id: 'c', to: 0 }] }, source: 'menu' }, props, tsv);
        expect(log).toEqual(['move a 1', 'move a 1', 'move c -1', 'move c -1']);
    });
});
