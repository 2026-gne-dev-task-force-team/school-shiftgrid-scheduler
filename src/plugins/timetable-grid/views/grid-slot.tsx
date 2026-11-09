/**
 * ───────────────────────────────────────────────────────────────────────────
 * 표 자리(grid slot) — 그리드 화면이 2D 표를 **직접 그리지 않고 이 한 파일을 거쳐서만** 그린다.
 *   🔴 쥔님 2026-11-08: 표 편집(칸 이동·복사 붙여넣기·병합·행 높이 끌기)은 **다른 세션이 공통 플러그인**
 *     (contract-table + sheet, 브랜치 v2-table)으로 만든다. 1차는 이 파일 안의 **간이 표**다.
 *     나중에 표 편집기 플러그인이 오면 **이 파일 하나만** 바꾼다(그리드 나머지는 무변경).
 *     ⛔ 표 편집기 약속은 이 레인이 만들지 않는다 — v2-table 세션 몫이다.
 *
 * ── 표 편집기 세션에 건넬 「요구서」(시간표 그리드가 표 자리에 바라는 것) ─────────────────────────
 *   아래 GridSlotProps 가 그리드가 표에 건네는 전부다. 표 편집기 플러그인 모듈은 이 꼴을 받으면 된다:
 *     columns       — 열 정의(key·머리 이름). 요일(월~토) 또는 1·2·3일차.
 *     rows          — 행 정의(key·머리 이름·시각 start~end 분). 높이 = 차지하는 시간(구글 캘린더 주간 보기처럼).
 *     cell(col,row) — 그 칸의 { 글자, 세로 병합 rowSpan, 가로 병합 colSpan } · 병합에 덮인 칸이면 null(안 그린다).
 *     onCellChange  — 한 칸 글자를 고쳤다.
 *     onRenameColumn / onRenameRow — 머리 이름을 고쳤다(⛔ 「1교시」를 박지 않는다).
 *     onRowTime     — 🔴 행 시각을 그 행 **전체**에 넣는다(2단계 일괄 — 경계 끌기나 입력이 행 전체에).
 *     selection + onSelect — 칸 사각형 고르기(🔴 셀 병합은 무조건 — 세로 필수·가로 허용).
 *     emptyHint     — 안내 문구(선택).
 *   ⚠️ 표는 값의 속뜻을 모른다(전부 문자열). 칸 글자가 과목인지 사람인지는 나중 플러그인이 알아본다.
 *   🔴 칸·구간 복사 붙여넣기는 표 편집기 몫 · 표 통째 복사는 그리드가 노드 복제로 한다(이 자리 밖).
 * ───────────────────────────────────────────────────────────────────────────
 */
import { useRef } from 'react';
import { Icon } from '../../../pane-ui-system';
// 🔴 import type 만 — table 약속은 표 편집기 꾸러미 contracts 에서(값은 host.modules.use('table')).
import type { TableApi, TableColumn, TableRow, TableTx, MergeRegion } from '../../sheet/contracts/table';
import type { TimetableData } from '../model';
import {
    columnCount, colName, getCell, isCovered, setCellText, renameRow, renameColumn, setRowTime,
    addRow, removeRow, addColumn, removeColumn, mergeCells, unmergeCells, canMerge,
} from '../model';

export interface GridColumn { key: string; title: string; }
export interface GridRowHead { key: string; title: string; start: number; end: number; }
export interface GridCellView { text: string; rowSpan: number; colSpan: number; merged: boolean; }
export interface GridSelection { col0: number; row0: number; col1: number; row1: number; }

export interface GridSlotProps {
    columns: GridColumn[];
    rows: GridRowHead[];
    /** 그 칸의 보임 꼴 — 병합에 덮인 칸이면 null(안 그린다). */
    cell(col: number, row: number): GridCellView | null;
    onCellChange(col: number, row: number, text: string): void;
    onRenameColumn(col: number, title: string): void;
    onRenameRow(row: number, title: string): void;
    /** 🔴 2단계 — 행 시각을 그 행 전체에(일괄). rowTimeEdit 가 켜져 있을 때만 UI 가 뜬다. */
    onRowTime(row: number, start: number, end: number): void;
    /** 선택(사각형) — 병합/해제 단추는 바깥 툴바가 쥔다. */
    selection: GridSelection | null;
    onSelect(col: number, row: number, extend: boolean): void;
    /** 2단계 켬 — 행 높이 ∝ 시간 + 경계 끌기 + 시각 입력. */
    rowTimeEdit: boolean;
    emptyHint?: string;
}

const PX_PER_MIN = 0.8;      // 50분 ≈ 40px
const MIN_ROW_PX = 30;

function fmt(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function parseMin(s: string): number | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
    if (!m) return null;
    const v = Number(m[1]) * 60 + Number(m[2]);
    return v >= 0 && v < 24 * 60 ? v : null;
}

function inSel(sel: GridSelection | null, col: number, row: number): boolean {
    if (!sel) return false;
    const c0 = Math.min(sel.col0, sel.col1), c1 = Math.max(sel.col0, sel.col1);
    const r0 = Math.min(sel.row0, sel.row1), r1 = Math.max(sel.row0, sel.row1);
    return col >= c0 && col <= c1 && row >= r0 && row <= r1;
}

// ── 표 편집기 판(2026-11-09 쥔님 「시간표는 표 편집기로 안 들어갔다」) ──────────────────────────
//   행 머리 = 첫 칸 '_name'(머리 열) · 행 시각 = 둘째 칸 '_time'(「09:00~09:50」) · 나머지 c0…cN 이 시간표 열.
//   행 높이 = 시간(분 × PX_PER_MIN) — 경계 끌기(row-weight)가 끝 시각을 민다. 한 트랜잭션 = applyEdit 한 번.
const NAME = '_name';
const TIME = '_time';
const colIdx = (key: string): number => (/^c\d+$/.test(key) ? Number(key.slice(1)) : -1);

/** 표 트랜잭션 → 시간표 데이터(순수). shortcut: 열 넣기는 늘 끝에 붙고 행 옮기기는 무시한다(모델에 그 연산이 없다). */
export function applyGridTx(data: TimetableData, tx: TableTx): TimetableData {
    let d = data;
    const rowAt = (id: string): number => d.rows.findIndex((r) => r.id === id);
    for (const ch of tx.cells) {
        const ri = rowAt(ch.rowId);
        if (ri < 0) continue;
        if (ch.key === NAME) d = renameRow(d, ri, ch.value);
        else if (ch.key === TIME) {
            const m = /^\s*(\d{1,2}:\d{2})\s*[~-]\s*(\d{1,2}:\d{2})\s*$/.exec(ch.value);
            const s = m ? parseMin(m[1]) : null, e = m ? parseMin(m[2]) : null;
            if (s !== null && e !== null && e > s) d = setRowTime(d, ri, s, e);
        } else if (colIdx(ch.key) >= 0) d = setCellText(d, colIdx(ch.key), ri, ch.value);
    }
    for (const a of tx.rows?.add ?? []) for (let i = 0; i < a.count; i++) d = addRow(d, a.at + i);
    for (const id of tx.rows?.remove ?? []) { const ri = rowAt(id); if (ri >= 0 && d.rows.length > 1) d = removeRow(d, ri); }
    for (const _ of tx.cols?.add ?? []) d = addColumn(d);
    const rm = (tx.cols?.remove ?? []).map(colIdx).filter((c) => c >= 0).sort((a, b) => b - a);
    for (const c of rm) if (columnCount(d.columns) > 1) d = removeColumn(d, c);
    for (const r of tx.cols?.rename ?? []) if (colIdx(r.key) >= 0) d = renameColumn(d, colIdx(r.key), r.title);
    for (const w of tx.axis?.rowWeight ?? []) {
        const ri = rowAt(w.id); if (ri < 0) continue;
        const { start, end } = d.rows[ri].range;
        const dm = Math.round(w.delta / PX_PER_MIN / 5) * 5;
        d = setRowTime(d, ri, start, Math.max(start + 5, end + dm));
    }
    for (const c of tx.merge?.clear ?? []) { const ri = rowAt(c.rowId); if (ri >= 0 && colIdx(c.key) >= 0) d = unmergeCells(d, colIdx(c.key), ri); }
    for (const m of tx.merge?.set ?? []) {
        const ri = rowAt(m.rowId), ci = colIdx(m.key);
        if (ri < 0 || ci < 0) continue;
        const sel = { col0: ci, row0: ri, col1: ci + m.colSpan - 1, row1: ri + m.rowSpan - 1 };
        if (canMerge(d, sel).ok) d = mergeCells(d, sel);
    }
    return d;
}

/** 시간표 데이터 → 표 편집기 모양(순수). */
export function gridToTable(data: TimetableData, rowTimeEdit: boolean): { columns: TableColumn[]; rows: TableRow[]; merges: MergeRegion[] } {
    const n = columnCount(data.columns);
    const columns: TableColumn[] = [
        { key: NAME, title: '행', width: 72 },
        ...(rowTimeEdit ? [{ key: TIME, title: '시각', width: 104, align: 'center' as const }] : []),
        ...Array.from({ length: n }, (_, c) => ({ key: `c${c}`, title: colName(data, c), width: 112 })),
    ];
    const merges: MergeRegion[] = [];
    const rows: TableRow[] = data.rows.map((r, ri) => {
        const cells: Record<string, string> = { [NAME]: r.name, [TIME]: `${fmt(r.range.start)}~${fmt(r.range.end)}` };
        for (let c = 0; c < n; c++) {
            if (isCovered(data, c, ri)) { cells[`c${c}`] = ''; continue; }
            const cell = getCell(data, c, ri);
            cells[`c${c}`] = cell?.text ?? '';
            if ((cell?.rowSpan ?? 1) > 1 || (cell?.colSpan ?? 1) > 1) merges.push({ rowId: r.id, key: `c${c}`, rowSpan: cell?.rowSpan ?? 1, colSpan: cell?.colSpan ?? 1 });
        }
        return { id: r.id, cells, weight: rowTimeEdit ? Math.max(MIN_ROW_PX, Math.round((r.range.end - r.range.start) * PX_PER_MIN)) : undefined };
    });
    return { columns, rows, merges };
}

/** 표 편집기 판 그리드 — 칸 이동·복사 붙여넣기·병합·행/열 넣고 빼기·열 폭·행 높이 끌기를 표 편집기가 쥔다. */
export function TableGrid({ api, data, rowTimeEdit, edit, onUndo, onRedo }: {
    api: TableApi;
    onUndo?: () => void;
    onRedo?: () => void;
    data: TimetableData;
    rowTimeEdit: boolean;
    edit: (fn: (d: TimetableData) => TimetableData) => void;
}) {
    const { columns, rows, merges } = gridToTable(data, rowTimeEdit);
    const features = ['rows', 'axis-edit', 'col-resize', 'merge', 'sticky-headers', 'paste-policy:clip', 'fill', ...(rowTimeEdit ? ['row-weight'] : [])];
    return (
        <div className="p-2">
            <api.Table
                columns={columns}
                rows={rows}
                merges={merges}
                headerCol
                features={features}
                onCommit={(tx) => edit((d) => applyGridTx(d, tx))}
                onUndo={onUndo}
                onRedo={onRedo}
                emptyHint="빈 표 — 행·열을 더해 쓴다"
            />
        </div>
    );
}

export function SimpleGrid(props: GridSlotProps) {
    const { columns, rows, cell, onCellChange, onRenameColumn, onRenameRow, onRowTime, selection, onSelect, rowTimeEdit } = props;
    const dragRef = useRef<{ row: number; startY: number; startEnd: number } | null>(null);

    function rowHeight(r: GridRowHead): number | undefined {
        if (!rowTimeEdit) return undefined;
        return Math.max(MIN_ROW_PX, Math.round((r.end - r.start) * PX_PER_MIN));
    }

    function onDragMove(e: PointerEvent) {
        const d = dragRef.current;
        if (!d) return;
        const deltaMin = Math.round((e.clientY - d.startY) / PX_PER_MIN / 5) * 5;   // 5분 단위
        const r = rows[d.row];
        const next = Math.max(r.start + 5, d.startEnd + deltaMin);
        onRowTime(d.row, r.start, next);
    }
    function onDragUp() {
        dragRef.current = null;
        window.removeEventListener('pointermove', onDragMove);
        window.removeEventListener('pointerup', onDragUp);
    }
    function startDrag(e: React.PointerEvent, row: number) {
        e.preventDefault();
        dragRef.current = { row, startY: e.clientY, startEnd: rows[row].end };
        window.addEventListener('pointermove', onDragMove);
        window.addEventListener('pointerup', onDragUp);
    }

    return (
        <div className="p-2 select-none overflow-auto">
            <table className="border-collapse text-[13px]">
                <thead>
                    <tr>
                        <th className="sticky left-0 z-10 bg-panel border border-line w-20 min-w-20 p-1 text-[11px] text-muted font-medium">행 \ 열</th>
                        {columns.map((c, ci) => (
                            <th key={c.key} className="border border-line min-w-24 p-0 bg-panel">
                                <input
                                    value={c.title}
                                    onChange={(e) => onRenameColumn(ci, e.target.value)}
                                    placeholder={`열 ${ci + 1}`}
                                    aria-label={`열 ${ci + 1} 이름`}
                                    className="w-full bg-transparent text-center font-medium text-text px-1 py-1 outline-none focus:bg-text/[0.04]"
                                />
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r, ri) => (
                        <tr key={r.key} style={{ height: rowHeight(r) }}>
                            <th className="sticky left-0 z-10 bg-panel border border-line w-20 min-w-20 p-0 align-top">
                                <input
                                    value={r.title}
                                    onChange={(e) => onRenameRow(ri, e.target.value)}
                                    placeholder={`행 ${ri + 1}`}
                                    aria-label={`행 ${ri + 1} 이름`}
                                    className="w-full bg-transparent text-text px-1 py-0.5 text-[12px] outline-none focus:bg-text/[0.04]"
                                />
                                {rowTimeEdit && (
                                    <div className="flex items-center gap-0.5 px-1 pb-0.5 text-[10px] text-muted">
                                        <input
                                            defaultValue={fmt(r.start)}
                                            key={`s${r.start}`}
                                            onBlur={(e) => { const v = parseMin(e.target.value); if (v !== null) onRowTime(ri, v, r.end); else e.target.value = fmt(r.start); }}
                                            aria-label={`행 ${ri + 1} 시작`}
                                            className="w-9 bg-bg border border-line rounded text-center tabular-nums outline-none focus:border-accent"
                                        />
                                        <span>~</span>
                                        <input
                                            defaultValue={fmt(r.end)}
                                            key={`e${r.end}`}
                                            onBlur={(e) => { const v = parseMin(e.target.value); if (v !== null) onRowTime(ri, r.start, v); else e.target.value = fmt(r.end); }}
                                            aria-label={`행 ${ri + 1} 끝`}
                                            className="w-9 bg-bg border border-line rounded text-center tabular-nums outline-none focus:border-accent"
                                        />
                                    </div>
                                )}
                            </th>
                            {columns.map((c, ci) => {
                                const cv = cell(ci, ri);
                                if (!cv) return null;   // 병합에 덮인 칸 — 안 그린다
                                const selected = inSel(selection, ci, ri);
                                return (
                                    <td
                                        key={c.key}
                                        rowSpan={cv.rowSpan > 1 ? cv.rowSpan : undefined}
                                        colSpan={cv.colSpan > 1 ? cv.colSpan : undefined}
                                        onMouseDown={(e) => onSelect(ci, ri, e.shiftKey)}
                                        className={`relative border border-line align-top p-0 ${selected ? 'bg-accent/15 outline outline-1 outline-accent' : ''} ${cv.merged ? 'bg-text/[0.03]' : ''}`}
                                    >
                                        <input
                                            value={cv.text}
                                            onChange={(e) => onCellChange(ci, ri, e.target.value)}
                                            onFocus={() => onSelect(ci, ri, false)}
                                            aria-label={`${c.title || `열 ${ci + 1}`} ${r.title || `행 ${ri + 1}`} 칸`}
                                            className="w-full h-full min-h-6 bg-transparent text-text px-1.5 py-1 outline-none"
                                        />
                                        {rowTimeEdit && cv.rowSpan <= 1 && (
                                            <div
                                                onPointerDown={(e) => startDrag(e, ri)}
                                                title="끌어서 이 행 시각 조절"
                                                className="absolute left-0 right-0 bottom-0 h-1.5 cursor-ns-resize hover:bg-accent/40"
                                            />
                                        )}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                    {(columns.length === 0 || rows.length === 0) && (
                        <tr><td className="p-6 text-center text-muted">{props.emptyHint ?? '빈 표'}</td></tr>
                    )}
                </tbody>
            </table>
            <div className="flex items-center gap-1 mt-2 text-[11px] text-muted">
                <Icon name="info" size={12} />
                칸을 눌러 고르고, Shift+클릭으로 여러 칸을 고른 뒤 위 「병합」을 누른다.
            </div>
        </div>
    );
}
