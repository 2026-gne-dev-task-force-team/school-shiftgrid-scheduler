/**
 * 표 연습장 — 표를 눈으로 만져 보는 자리. 손님(명단·시간표) 배선과 상관없이, 이 표 하나로 무엇이 되는지 보인다.
 *   🔴 이 뷰가 자료를 쥔다(연습용) — 바꾼 내용은 저장하지 않는다(새로 열면 처음으로 돌아온다).
 *   기본 묶음 + 모든 기능을 켜 둔다: 줄·칸 넣고 빼기 · 칸 합치기 · 칸 폭·줄 높이 끌기 · 체크·고르기 칸 · 되돌리기.
 *   ⛔ 색은 토큰 클래스만(구조 검사 ①) · 사람 이름 같은 건 안 쓴다(샘플은 집안일).
 */
import { useState } from 'react';
import { Table } from '../Table';
import type { CellDecoration, CellValidation, MergeRegion, TableColumn, TableRow, TableTx } from '../contracts/table';
import { isChecked } from '../core/coltypes';

/** 연습장이 켜는 기능 전부 — 기본 묶음 + M2. 「끌어서 가져다 쓴다」를 한 눈에. */
const FEATURES = [
    'rows', 'fill', 'paste-policy:append', 'history',
    'col-resize', 'sticky-headers', 'row-weight', 'axis-edit', 'col-types', 'validate', 'merge',
];

const START_COLS: TableColumn[] = [
    { key: 'day', title: '요일', width: 70 },
    { key: 'what', title: '할 일', width: 180 },
    { key: 'where', title: '자리', type: 'select', options: ['교실', '운동장', '도서실', '집'], width: 110 },
    { key: 'done', title: '다 함', type: 'bool', width: 60 },
];

const START_ROWS: TableRow[] = [
    { id: 'row1', cells: { day: '월', what: '화분에 물 주기', where: '교실', done: '' } },
    { id: 'row2', cells: { day: '화', what: '책 정리', where: '도서실', done: '1' } },
    { id: 'row3', cells: { day: '수', what: '달리기', where: '운동장', done: '' } },
    { id: 'row4', cells: { day: '목', what: '', where: '집', done: '' } },
    { id: 'row5', cells: { day: '금', what: '교실 청소', where: '교실', done: '' } },
];

let seq = 0;
interface Board { rows: TableRow[]; cols: TableColumn[]; merges: MergeRegion[] }

/** 트랜잭션을 연습장 자료에 적용 — 소유자가 할 일(명단은 노드 시스템, 시간표는 저장소가 한다). */
function apply(b: Board, tx: TableTx): Board {
    let rows = b.rows.map((r) => ({ ...r, cells: { ...r.cells } }));
    let cols = b.cols.map((c) => ({ ...c }));
    let merges = b.merges.map((m) => ({ ...m }));

    for (const c of tx.cells) { const row = rows.find((r) => r.id === c.rowId); if (row) row.cells[c.key] = c.value; }
    if (tx.rows?.remove) rows = rows.filter((r) => !tx.rows!.remove!.includes(r.id));
    for (const a of tx.rows?.add ?? []) {
        const list = a.cells ?? Array.from({ length: a.count }, () => ({}));
        const ins = list.map((cells, i) => ({ id: a.ids?.[i] ?? `new${seq++}`, cells: { ...cells } }));
        rows.splice(a.at, 0, ...ins);
    }
    for (const m of tx.rows?.move ?? []) {
        const i = rows.findIndex((r) => r.id === m.id);
        if (i >= 0) { const [row] = rows.splice(i, 1); rows.splice(Math.min(m.to, rows.length), 0, row); }
    }
    for (const a of tx.cols?.add ?? []) cols.splice(a.at, 0, { key: a.key, title: a.title });
    if (tx.cols?.remove) cols = cols.filter((c) => !tx.cols!.remove!.includes(c.key));
    for (const rn of tx.cols?.rename ?? []) { const col = cols.find((c) => c.key === rn.key); if (col) col.title = rn.title; }
    for (const rz of tx.cols?.resize ?? []) { const col = cols.find((c) => c.key === rz.key); if (col) col.width = rz.width; }
    for (const w of tx.axis?.rowWeight ?? []) { const row = rows.find((r) => r.id === w.id); if (row) row.weight = (row.weight ?? 28) + w.delta; }
    for (const s of tx.merge?.set ?? []) { merges = merges.filter((m) => !(m.rowId === s.rowId && m.key === s.key)); merges.push({ ...s }); }
    for (const cl of tx.merge?.clear ?? []) merges = merges.filter((m) => !(m.rowId === cl.rowId && m.key === cl.key));

    return { rows, cols, merges };
}

export function PlaygroundView() {
    const [board, setBoard] = useState<Board>({ rows: START_ROWS, cols: START_COLS, merges: [] });

    // 다 한 일은 흐리게(한 칸 글자를 읽어 꾸미는 자리 — 손님이 하는 일의 보기).
    const decorate = (rowId: string, key: string): CellDecoration | undefined => {
        if (key !== 'what') return undefined;
        const row = board.rows.find((r) => r.id === rowId);
        return row && isChecked(row.cells.done ?? '') ? { tone: 'muted', title: '다 한 일' } : undefined;
    };
    // 할 일이 비면 노란 테두리로 「적어 주세요」.
    const validate = (_rowId: string, key: string, value: string): CellValidation | undefined =>
        (key === 'what' && value.trim() === '' ? { level: 'warn', message: '할 일을 적어 주세요' } : undefined);

    return (
        <div className="h-full flex flex-col overflow-auto p-3 gap-2 select-none">
            <div className="flex flex-col gap-0.5">
                <span className="font-medium text-text">표 연습장</span>
                <span className="text-[12px] text-muted">
                    자유롭게 만져 보세요. 칸을 두 번 누르면 고치고, 여러 칸을 끌어 고른 뒤 「칸 합치기」를 누르면 하나로 합쳐집니다.
                    칸 머리 경계를 끌면 너비가, 줄 머리 경계를 끌면 높이가 바뀝니다. 바꾼 내용은 저장되지 않습니다.
                </span>
            </div>
            <Table
                columns={board.cols}
                rows={board.rows}
                merges={board.merges}
                features={FEATURES}
                decorate={decorate}
                validate={validate}
                onCommit={(tx) => setBoard((b) => apply(b, tx))}
                emptyHint="비어 있어요. 「줄 추가」를 누르거나 엑셀·한글 표를 붙여 넣어 보세요."
            />
        </div>
    );
}
