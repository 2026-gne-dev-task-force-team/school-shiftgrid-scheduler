/**
 * 🔴 리치 셀 2단계 — 시간표 = 시트 확장(쥔님 11-10 14:22 *"시트에서 그 클래스를 확장해서 … 시간표가 확장 구현"*).
 *   시트 `Table`(table 약속)이 칸·선택·편집·복사/붙이기·병합·되돌리기 단위를 쥐고, 시간표는 여기서 셋만 덧붙인다:
 *     ① 모양 바꾸기 — TimetableData → TableColumn/TableRow/MergeRegion (행 = 시각 띠: 높이 = 분 × ppm, 머리 = 이름 + 시각)
 *     ② 확정 되받기 — TableTx → model.ts 순수 함수(시각 밀기·하루 끝 막기는 모델이 지킨다)
 *     ③ 기능 모듈 `timetable` — 시트 내장 조각(row-head·row-gaps·row-weight·merge …)을 needs 로 엮는 꾸러미
 *   ⛔ 시트는 교시·분·요일을 모른다 — 낱말과 단위는 전부 이 파일이 바꿔 준다.
 */
import type { MergeRegion, TableColumn, TableFeature, TableRow, TableTx } from '../sheet/contracts/table';
import {
    addColumn, addRow, colName, colWidth, columnCount, gapBefore, getCell, isCovered, mergeCells, removeColumn, removeRow,
    renameColumn, renameRow, rowLength, setCellText, setColWidth, setGapBefore, setRowLength, unmergeCells, type TimetableData,
} from './model';

const SNAP = 5;   // 분
const fmt = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
/** 열 key — 시간표 열은 자리(index)가 정체라 key 도 자리에서 만든다. */
export const colKeyOf = (c: number) => `c${c}`;

export interface TimetableTable { columns: TableColumn[]; rows: TableRow[]; merges: MergeRegion[] }

/** ① 시간표 → 시트 모양. ppm = 1분당 px(툴바 확대/축소). */
export function toTable(data: TimetableData, ppm: number): TimetableTable {
    const nCols = columnCount(data.columns);
    const columns: TableColumn[] = Array.from({ length: nCols }, (_, c) => ({
        key: colKeyOf(c), title: colName(data, c) || `열 ${c + 1}`, width: colWidth(data, c),
    }));
    const merges: MergeRegion[] = [];
    const rows: TableRow[] = data.rows.map((row, r) => {
        const cells: Record<string, string> = {};
        for (let c = 0; c < nCols; c++) {
            if (isCovered(data, c, r)) continue;
            const cell = getCell(data, c, r);
            if (!cell) continue;
            if (cell.text) cells[colKeyOf(c)] = cell.text;
            const rs = cell.rowSpan ?? 1, cs = cell.colSpan ?? 1;
            if (rs > 1 || cs > 1) merges.push({ rowId: row.id, key: colKeyOf(c), rowSpan: rs, colSpan: cs });
        }
        return {
            id: row.id, cells, label: row.name || `${r + 1}교시`,
            sub: `${fmt(row.range.start)}~${fmt(row.range.end)}`,
            weight: Math.max(24, Math.round(rowLength(data, r) * ppm)),
        };
    });
    return { columns, rows, merges };
}

/** 행 앞 틈(쉬는 시간) — 첫 행은 틈이 없다. 0분이어도 줄은 둔다(끌어서 늘릴 수 있게). */
export function gapOf(data: TimetableData, ppm: number, rowId: string): { size: number; label?: string } | undefined {
    const r = data.rows.findIndex((x) => x.id === rowId);
    if (r <= 0) return undefined;
    const g = gapBefore(data, r);
    return { size: Math.round(g * ppm), label: g > 0 ? `쉬는 시간 ${g}분` : undefined };
}

const snapMin = (px: number, ppm: number) => Math.round(px / ppm / SNAP) * SNAP;

/**
 * ② 시트 확정(tx 하나) → 시간표 한 번(= 되돌리기 한 칸). 순서: 열·행 구조 → 이름·폭·시각 → 병합 → 칸 글자.
 *   ⚠️ 시간표 열은 자리라 「사이에 열 넣기」도 끝에 붙는다 · 행 옮기기·열 옮기기는 시각 띠를 깨서 받지 않는다.
 */
export function applyTableTx(data: TimetableData, tx: TableTx, ppm: number): TimetableData {
    let d = data;
    const keys = Array.from({ length: columnCount(d.columns) }, (_, c) => colKeyOf(c));
    const ids = d.rows.map((r) => r.id);

    for (const key of tx.cols?.remove ?? []) {
        const c = keys.indexOf(key);
        if (c < 0) continue;
        const next = removeColumn(d, c);
        if (next !== d) { d = next; keys.splice(c, 1); }
    }
    for (const a of tx.cols?.add ?? []) {
        const next = addColumn(d);
        if (next === d) continue;   // 요일 열이 꽉 찼다
        d = next; keys.push(a.key);
    }
    for (const id of tx.rows?.remove ?? []) {
        const r = ids.indexOf(id);
        if (r < 0) continue;
        const next = removeRow(d, r);
        if (next !== d) { d = next; ids.splice(r, 1); }
    }
    for (const a of tx.rows?.add ?? []) {
        for (let i = 0; i < a.count; i++) {
            const at = Math.min(a.at + i, ids.length);
            const next = addRow(d, at);
            if (next === d) break;   // 하루 끝(24:00)을 넘긴다
            const want = a.ids?.[i];
            d = want ? { ...next, rows: next.rows.map((row, k) => (k === at ? { ...row, id: want } : row)) } : next;
            ids.splice(at, 0, d.rows[at].id);
            const init = a.cells?.[i];
            if (init) for (const [k, v] of Object.entries(init)) { const c = keys.indexOf(k); if (c >= 0 && v) d = setCellText(d, c, at, v); }
        }
    }

    for (const x of tx.cols?.rename ?? []) { const c = keys.indexOf(x.key); if (c >= 0) d = renameColumn(d, c, x.title); }
    for (const x of tx.cols?.resize ?? []) { const c = keys.indexOf(x.key); if (c >= 0) d = setColWidth(d, c, x.width); }
    for (const x of tx.rows?.rename ?? []) { const r = ids.indexOf(x.id); if (r >= 0) d = renameRow(d, r, x.label); }
    for (const x of tx.axis?.rowWeight ?? []) {
        const r = ids.indexOf(x.id);
        if (r < 0) continue;
        const len = Math.max(SNAP, snapMin(rowLength(d, r) * ppm + x.delta, ppm));
        if (len !== rowLength(d, r)) d = setRowLength(d, r, len);
    }
    for (const x of tx.axis?.rowGap ?? []) {
        const r = ids.indexOf(x.id);
        if (r <= 0) continue;
        const gap = Math.max(0, snapMin(gapBefore(d, r) * ppm + x.delta, ppm));
        if (gap !== gapBefore(d, r)) d = setGapBefore(d, r, gap);
    }

    for (const m of tx.merge?.clear ?? []) {
        const c = keys.indexOf(m.key), r = ids.indexOf(m.rowId);
        if (c >= 0 && r >= 0) d = unmergeCells(d, c, r);
    }
    for (const m of tx.merge?.set ?? []) {
        const c = keys.indexOf(m.key), r = ids.indexOf(m.rowId);
        if (c >= 0 && r >= 0) d = mergeCells(d, { col0: c, row0: r, col1: c + m.colSpan - 1, row1: r + m.rowSpan - 1 });
    }

    for (const ch of tx.cells) {
        const c = keys.indexOf(ch.key), r = ids.indexOf(ch.rowId);
        if (c < 0 || r < 0 || isCovered(d, c, r)) continue;
        if ((getCell(d, c, r)?.text ?? '') !== ch.value) d = setCellText(d, c, r, ch.value);
    }
    return d;
}

/**
 * ③ 기능 모듈 `timetable` — 시간표가 시트에 끼우는 꾸러미. 혼자서는 아무것도 안 켜고, needs 로 시트 조각을 엮는다:
 *   행 머리(교시 이름·시각) · 행 사이 틈(쉬는 시간) · 행 높이(= 길이) · 병합. 뷰 순서를 흔드는 sort·filter 와는 못 쓴다.
 */
export const timetableFeature: TableFeature = {
    id: 'timetable', version: '0.1.0',
    needs: ['row-head', 'row-gaps', 'row-weight', 'merge'],
    conflicts: ['sort', 'filter'],
    install: () => {},
};

/** 시간표 화면이 시트에 넘기는 조립 목록 — 되돌리기는 시간표가 쥐니 history 는 안 끼운다. */
export const TIMETABLE_FEATURES: (string | TableFeature)[] = [
    'rows', 'axis-edit', 'col-resize', 'sticky-headers', 'paste-policy:append',
    'row-head', 'row-gaps', 'row-weight', 'merge', timetableFeature,
];
