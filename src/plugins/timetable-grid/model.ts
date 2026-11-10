/**
 * 시간표 그리드 — **순수 모델**(React·host 모름 · vitest 단독).
 *   🔴 손 편집이 바닥이다(명세 16:13) — 이 파일이 그 바닥: 빈 표 만들기 · 칸 글자 · 행/열 넣고 빼기 ·
 *      머리 이름 · 셀 병합(세로 필수·가로 허용) · 열 꼴/범위 꼴 바꾸기. 전부 새 데이터를 돌려주는 순수 함수다.
 *   ⛔ 학교 낱말(교시·반·과목·담임·급식) 0 — 칸은 글자일 뿐이고 뜻은 그리드가 모른다(명세).
 *   타입은 약속(contract-week-grid)에서 import type 으로만 받는다(구조 검사 ⑱ d·g).
 *
 *   일정 목록 계산은 schedule.ts(같은 폴더)에 산다 — 이 파일은 「한 장의 모양과 손 편집」만.
 */
import type {
    TimetableData, RangeSpec, ColumnSpec, RowSpec, Cell, CellAddr, GridDay, ScheduleEntry,
} from '../contract-week-grid/types';

export type { TimetableData, RangeSpec, ColumnSpec, RowSpec, Cell, CellAddr, GridDay, ScheduleEntry };

// ── 작은 유틸 ──

let seq = 0;
/** 행 id — 저장 안 되는 순번 + 시각이면 충분(노드와 달리 한 시간표 안에서만 유일하면 된다). */
export function newRowId(): string {
    seq += 1;
    return `r${Date.now().toString(36)}_${seq.toString(36)}`;
}

/** 요일 이름 — 1=월 … 6=토. */
export const DAY_LABELS: Record<GridDay, string> = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토' };

/** 칸 열쇠 — 'c{col}r{row}'. ⛔ 문자열을 손으로 짓지 말고 이걸로만(약속의 「제공자가 정한다」와 같은 결). */
export function cellKey(col: number, row: number): string { return `c${col}r${row}`; }

/** 칸 열쇠 되풀기 — 꼴이 아니면 null. */
export function parseCellKey(key: string): CellAddr | null {
    const m = /^c(\d+)r(\d+)$/.exec(key);
    return m ? { col: Number(m[1]), row: Number(m[2]) } : null;
}

// ── 빈 표(처음 켰을 때) ──

/** 기본 행 시각 — 09:00 부터 50분 행 + 10분 틈(구글 캘린더처럼 높이 ∝ 시간이 보이게). */
function defaultRowRange(index: number): { start: number; end: number } {
    const start = 9 * 60 + index * 60;   // 540, 600, 660 …
    return { start, end: start + 50 };
}

/** 새 행 하나 — 이름 빈 문자열(⛔ 「1교시」 안 박음) + 기본 시각. */
export function makeRow(index: number, name = ''): RowSpec {
    return { id: newRowId(), name, range: defaultRowRange(index) };
}

/**
 * 처음 켰을 때의 빈 표 — **월~금 × 6행**(명세 「아무것도 안 묻는다」). 범위는 미설정(기간·빈 경계).
 *   행 이름은 비어 있고, 칸은 0개(글자 없음).
 */
export function blankTimetable(): TimetableData {
    return {
        range: { kind: 'period', start: '', end: '' },
        columns: { kind: 'weekday', days: [1, 2, 3, 4, 5] },
        // 🔴 행 id 는 결정적('r0'…'r5') — data 없는 시간표를 매 렌더 blankTimetable() 로 그려도 React 키가 안 흔들린다.
        rows: [0, 1, 2, 3, 4, 5].map((i) => ({ id: `r${i}`, name: '', range: defaultRowRange(i) })),
        cells: {},
    };
}

// ── 열·행 개수와 머리 이름 ──

/** 열 개수 — 요일이면 고른 요일 수, 일차면 count. */
export function columnCount(cols: ColumnSpec): number {
    return cols.kind === 'weekday' ? cols.days.length : Math.max(0, cols.count);
}

export function rowCount(data: TimetableData): number { return data.rows.length; }

/** 그 열의 기본 머리 이름(꼴에서 뽑은 것) — 요일이면 '월'…'토', 일차면 'N일차'. */
export function defaultColName(cols: ColumnSpec, col: number): string {
    if (cols.kind === 'weekday') {
        const d = cols.days[col];
        return d ? DAY_LABELS[d] : '';
    }
    return `${col + 1}일차`;
}

/** 실제 보일 열 머리 이름 — colNames 덮어쓰기가 있으면 그것, 없으면 기본. */
export function colName(data: TimetableData, col: number): string {
    const over = data.colNames?.[String(col)];
    return over !== undefined && over !== '' ? over : defaultColName(data.columns, col);
}

// ── 병합: 덮인 칸 계산 ──

/** 어느 칸이 병합에 덮였나(앵커 제외) — 열쇠 집합. 앵커는 rowSpan/colSpan>1 을 들고, 덮인 칸은 안 그린다. */
export function coveredBy(data: TimetableData): Set<string> {
    const covered = new Set<string>();
    for (const [key, cell] of Object.entries(data.cells)) {
        const addr = parseCellKey(key);
        if (!addr) continue;
        const rs = cell.rowSpan ?? 1;
        const cs = cell.colSpan ?? 1;
        if (rs <= 1 && cs <= 1) continue;
        for (let r = addr.row; r < addr.row + rs; r++) {
            for (let c = addr.col; c < addr.col + cs; c++) {
                if (c === addr.col && r === addr.row) continue;   // 앵커는 제외
                covered.add(cellKey(c, r));
            }
        }
    }
    return covered;
}

export function isCovered(data: TimetableData, col: number, row: number): boolean {
    return coveredBy(data).has(cellKey(col, row));
}

export function getCell(data: TimetableData, col: number, row: number): Cell | undefined {
    return data.cells[cellKey(col, row)];
}

// ── 칸 글자·시각 ──

/** 얕은 복사로 cells 를 바꿔 새 데이터를 돌려준다(원본 불변). */
function withCells(data: TimetableData, cells: Record<string, Cell>): TimetableData {
    return { ...data, cells };
}

/** 칸 글자 쓰기 — 빈 문자열이고 병합/시각도 없으면 칸을 지운다(빈 칸은 저장 안 함). */
export function setCellText(data: TimetableData, col: number, row: number, text: string): TimetableData {
    const key = cellKey(col, row);
    const cells = { ...data.cells };
    const prev = cells[key];
    const next: Cell = { ...(prev ?? { text: '' }), text };
    if (next.text === '' && (next.rowSpan ?? 1) <= 1 && (next.colSpan ?? 1) <= 1 && !next.time) {
        delete cells[key];
    } else {
        cells[key] = next;
    }
    return withCells(data, cells);
}

// ── 셀 병합(세로 필수·가로 허용) ──

export interface Selection { col0: number; row0: number; col1: number; row1: number; }

/** 선택을 왼쪽-위~오른쪽-아래로 정규화. */
export function normSel(s: Selection): Selection {
    return {
        col0: Math.min(s.col0, s.col1), row0: Math.min(s.row0, s.row1),
        col1: Math.max(s.col0, s.col1), row1: Math.max(s.row0, s.row1),
    };
}

/** 병합 블록(앵커+span)들의 사각형 목록. */
function mergeBlocks(data: TimetableData): { col: number; row: number; cs: number; rs: number }[] {
    const out: { col: number; row: number; cs: number; rs: number }[] = [];
    for (const [key, cell] of Object.entries(data.cells)) {
        const addr = parseCellKey(key);
        if (!addr) continue;
        const rs = cell.rowSpan ?? 1;
        const cs = cell.colSpan ?? 1;
        if (rs > 1 || cs > 1) out.push({ col: addr.col, row: addr.row, cs, rs });
    }
    return out;
}

/**
 * 병합할 수 있나 — 🔴 선택이 격자 안이고, 칸이 둘 이상이며, 이미 있는 병합 블록이 선택 경계를 가로지르지 않아야 한다.
 *   (가름선: 겹치는 블록은 선택 안에 통째로 들어와 있어야 한다 — 걸치면 안 된다.)
 */
export function canMerge(data: TimetableData, sel: Selection): { ok: boolean; reason?: string } {
    const s = normSel(sel);
    const cols = columnCount(data.columns);
    const rows = rowCount(data);
    if (s.col0 < 0 || s.row0 < 0 || s.col1 >= cols || s.row1 >= rows) return { ok: false, reason: '격자 밖' };
    if (s.col0 === s.col1 && s.row0 === s.row1) return { ok: false, reason: '한 칸은 병합할 수 없다' };
    for (const b of mergeBlocks(data)) {
        const bc1 = b.col + b.cs - 1;
        const br1 = b.row + b.rs - 1;
        const intersects = b.col <= s.col1 && bc1 >= s.col0 && b.row <= s.row1 && br1 >= s.row0;
        if (!intersects) continue;
        const inside = b.col >= s.col0 && bc1 <= s.col1 && b.row >= s.row0 && br1 <= s.row1;
        if (!inside) return { ok: false, reason: '선택이 기존 병합을 가로지른다' };
    }
    return { ok: true };
}

/**
 * 셀 병합 — 왼쪽-위 앵커가 선택 전체를 먹는다(rowSpan·colSpan). 앵커 글자는 남기고, 덮인 칸은 맵에서 뺀다.
 *   ⛔ canMerge 가 false 면 그대로 돌려준다(아무 일 없음).
 */
export function mergeCells(data: TimetableData, sel: Selection): TimetableData {
    if (!canMerge(data, sel).ok) return data;
    const s = normSel(sel);
    const cells = { ...data.cells };
    // 선택 안의 기존 병합 앵커를 먼저 풀고(span 초기화), 덮인 칸을 지운다.
    for (let r = s.row0; r <= s.row1; r++) {
        for (let c = s.col0; c <= s.col1; c++) {
            if (c === s.col0 && r === s.row0) continue;
            delete cells[cellKey(c, r)];
        }
    }
    const anchorKey = cellKey(s.col0, s.row0);
    const anchor: Cell = { ...(cells[anchorKey] ?? { text: '' }) };
    anchor.rowSpan = s.row1 - s.row0 + 1;
    anchor.colSpan = s.col1 - s.col0 + 1;
    if (anchor.rowSpan <= 1) delete anchor.rowSpan;
    if (anchor.colSpan <= 1) delete anchor.colSpan;
    cells[anchorKey] = anchor;
    return withCells(data, cells);
}

/** 병합 해제 — 그 앵커의 span 을 1 로(덮였던 칸은 빈 칸으로 되살아난다). 앵커가 아니면 아무 일 없음. */
export function unmergeCells(data: TimetableData, col: number, row: number): TimetableData {
    const key = cellKey(col, row);
    const cell = data.cells[key];
    if (!cell || ((cell.rowSpan ?? 1) <= 1 && (cell.colSpan ?? 1) <= 1)) return data;
    const cells = { ...data.cells };
    const next: Cell = { ...cell };
    delete next.rowSpan;
    delete next.colSpan;
    if (next.text === '' && !next.time) delete cells[key]; else cells[key] = next;
    return withCells(data, cells);
}

// ── 행 넣고 빼기 ──

/** 선택 안의 블록이 그 행/열 선을 건드리면 풀어 둔다(구조를 바꾸기 전 안전) — 세로(row)·가로(col) 공통. */
function unmergeTouching(cells: Record<string, Cell>, axis: 'row' | 'col', index: number): Record<string, Cell> {
    const out = { ...cells };
    for (const [key, cell] of Object.entries(cells)) {
        const addr = parseCellKey(key);
        if (!addr) continue;
        const rs = cell.rowSpan ?? 1;
        const cs = cell.colSpan ?? 1;
        if (rs <= 1 && cs <= 1) continue;
        const lo = axis === 'row' ? addr.row : addr.col;
        const span = axis === 'row' ? rs : cs;
        if (index >= lo && index <= lo + span - 1) {
            const next: Cell = { ...cell };
            delete next.rowSpan;
            delete next.colSpan;
            // 덮였던 칸은 지워진 채라 글자만 남긴다(앵커). 빈 앵커면 지운다.
            if (next.text === '' && !next.time) delete out[key]; else out[key] = next;
        }
    }
    return out;
}

/** 칸 맵을 축 하나로 다시 매긴다(remap(idx) → 새 idx | null[제거]). */
function remapCells(cells: Record<string, Cell>, axis: 'row' | 'col', remap: (i: number) => number | null): Record<string, Cell> {
    const out: Record<string, Cell> = {};
    for (const [key, cell] of Object.entries(cells)) {
        const addr = parseCellKey(key);
        if (!addr) continue;
        const idx = axis === 'row' ? addr.row : addr.col;
        const to = remap(idx);
        if (to === null) continue;
        const nCol = axis === 'col' ? to : addr.col;
        const nRow = axis === 'row' ? to : addr.row;
        out[cellKey(nCol, nRow)] = cell;
    }
    return out;
}

/** 행 넣기 — index(없으면 끝)에 빈 행. 끝에 넣으면 병합이 안 깨진다(안쪽이면 걸친 병합을 먼저 푼다). */
export function addRow(data: TimetableData, atIndex?: number): TimetableData {
    const n = rowCount(data);
    const at = atIndex === undefined ? n : Math.max(0, Math.min(atIndex, n));
    let cells = data.cells;
    if (at < n) cells = unmergeTouching(cells, 'row', at);
    cells = remapCells(cells, 'row', (i) => (i >= at ? i + 1 : i));
    const rows = [...data.rows];
    rows.splice(at, 0, makeRow(at));
    return { ...data, rows, cells };
}

/** 행 빼기 — 걸친 병합을 먼저 풀고, 그 행 칸을 지운 뒤 위로 당긴다. 마지막 한 행은 안 지운다. */
export function removeRow(data: TimetableData, index: number): TimetableData {
    const n = rowCount(data);
    if (n <= 1 || index < 0 || index >= n) return data;
    let cells = unmergeTouching(data.cells, 'row', index);
    cells = remapCells(cells, 'row', (i) => (i === index ? null : i > index ? i - 1 : i));
    const rows = data.rows.filter((_, i) => i !== index);
    return { ...data, rows, cells };
}

// ── 열 넣고 빼기 ──

/** 요일 꼴에서 아직 안 쓴 요일 하나(월~토 순). 다 찼으면 null. */
function nextFreeDay(days: GridDay[]): GridDay | null {
    for (const d of [1, 2, 3, 4, 5, 6] as GridDay[]) if (!days.includes(d)) return d;
    return null;
}

/** 열 넣기 — 요일이면 다음 빈 요일(없으면 그대로), 일차면 count+1. 끝에 붙는다(병합 안 깨짐). */
export function addColumn(data: TimetableData): TimetableData {
    if (data.columns.kind === 'weekday') {
        const d = nextFreeDay(data.columns.days);
        if (d === null) return data;
        return { ...data, columns: { kind: 'weekday', days: [...data.columns.days, d] } };
    }
    return { ...data, columns: { kind: 'cycle', count: data.columns.count + 1 } };
}

/** 열 빼기 — 걸친 병합을 풀고 그 열 칸을 지운 뒤 왼쪽으로 당긴다. 마지막 한 열은 안 지운다. */
export function removeColumn(data: TimetableData, col: number): TimetableData {
    const n = columnCount(data.columns);
    if (n <= 1 || col < 0 || col >= n) return data;
    let cells = unmergeTouching(data.cells, 'col', col);
    cells = remapCells(cells, 'col', (i) => (i === col ? null : i > col ? i - 1 : i));
    // colNames 도 당긴다.
    let colNames: Record<string, string> | undefined;
    if (data.colNames) {
        colNames = {};
        for (const [k, v] of Object.entries(data.colNames)) {
            const i = Number(k);
            if (i === col) continue;
            colNames[String(i > col ? i - 1 : i)] = v;
        }
    }
    let colWidths: Record<string, number> | undefined;
    if (data.colWidths) {
        colWidths = {};
        for (const [k, v] of Object.entries(data.colWidths)) {
            const i = Number(k);
            if (i !== col) colWidths[String(i > col ? i - 1 : i)] = v;
        }
    }
    let columns: ColumnSpec;
    if (data.columns.kind === 'weekday') columns = { kind: 'weekday', days: data.columns.days.filter((_, i) => i !== col) };
    else columns = { kind: 'cycle', count: data.columns.count - 1 };
    return { ...data, columns, cells, ...(colNames ? { colNames } : {}), colWidths };
}

// ── 머리 이름·행 시각 ──

export function renameRow(data: TimetableData, index: number, name: string): TimetableData {
    if (index < 0 || index >= data.rows.length) return data;
    const rows = data.rows.map((r, i) => (i === index ? { ...r, name } : r));
    return { ...data, rows };
}

/** 열 머리 이름 고치기 — 기본 이름과 같으면 덮어쓰기를 걷는다(요일 'A조'→'화' 로 돌리면 깔끔하게). */
export function renameColumn(data: TimetableData, col: number, name: string): TimetableData {
    const colNames = { ...(data.colNames ?? {}) };
    if (name === '' || name === defaultColName(data.columns, col)) delete colNames[String(col)];
    else colNames[String(col)] = name;
    const hasAny = Object.keys(colNames).length > 0;
    return { ...data, ...(hasAny ? { colNames } : { colNames: undefined }) };
}

/** 요일 열의 그 열을 다른 요일로 바꾼다(열 머리에서 요일 고르기). 이미 쓰는 요일이면 아무 일 없음. */
export function setColumnDay(data: TimetableData, col: number, day: GridDay): TimetableData {
    if (data.columns.kind !== 'weekday') return data;
    if (data.columns.days.includes(day) && data.columns.days[col] !== day) return data;
    const days = data.columns.days.map((d, i) => (i === col ? day : d));
    return { ...data, columns: { kind: 'weekday', days } };
}

/** 🔴 행 시각 일괄 편집(2단계) — 그 행 전체에 시각이 들어간다(명세: 행 경계 끌기·시각 입력이 행 전체에). */
export function setRowTime(data: TimetableData, index: number, start: number, end: number): TimetableData {
    if (index < 0 || index >= data.rows.length) return data;
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    const rows = data.rows.map((r, i) => (i === index ? { ...r, range: { start: lo, end: hi } } : r));
    return { ...data, rows };
}

// ── 열 꼴·범위 꼴 바꾸기 ──

/** 열 꼴 바꾸기 — 요일↔일차. 열 개수는 되도록 지킨다(일차로 가면 같은 개수, 요일로 가면 앞에서부터 월~토). */
export function setColumnSpec(data: TimetableData, spec: ColumnSpec): TimetableData {
    return { ...data, columns: spec };
}

/** 요일↔일차 토글(지금 열 개수를 지키며). */
export function toggleColumnKind(data: TimetableData): TimetableData {
    const n = Math.max(1, columnCount(data.columns));
    if (data.columns.kind === 'weekday') return setColumnSpec(data, { kind: 'cycle', count: n });
    const days = ([1, 2, 3, 4, 5, 6] as GridDay[]).slice(0, Math.min(6, n));
    return setColumnSpec(data, { kind: 'weekday', days });
}

/** 범위 꼴 바꾸기 — 기간↔N회. */
export function setRangeSpec(data: TimetableData, spec: RangeSpec): TimetableData {
    return { ...data, range: spec };
}

export function toggleRangeKind(data: TimetableData): TimetableData {
    if (data.range.kind === 'period') return setRangeSpec(data, { kind: 'repeat', count: 1 });
    return setRangeSpec(data, { kind: 'period', start: '', end: '' });
}

// ── 열 너비·보이는 시각(T2·T4·T5) ──

/** 열 기본 너비(px) · 줄일 수 있는 하한. */
export const COL_W = 120;
export const COL_MIN_W = 56;

/** 그 열의 너비(px) — 끌어서 조절한 값이 있으면 그것. */
export function colWidth(data: TimetableData, col: number): number {
    return data.colWidths?.[String(col)] ?? COL_W;
}

/** 열 너비 바꾸기 — 하한 아래로는 안 내려간다. 기본값이면 덮어쓰기를 걷는다. */
export function setColWidth(data: TimetableData, col: number, width: number): TimetableData {
    const w = Math.max(COL_MIN_W, Math.round(width));
    const colWidths = { ...(data.colWidths ?? {}) };
    if (w === COL_W) delete colWidths[String(col)]; else colWidths[String(col)] = w;
    return { ...data, colWidths: Object.keys(colWidths).length ? colWidths : undefined };
}

/** 그리드에 보일 시각 범위(분) — 정한 값이 있으면 그것, 없으면 행 시각을 정시로 감싼 값(행이 없으면 09~15시). */
export function viewRange(data: TimetableData): { start: number; end: number } {
    if (data.view && data.view.end > data.view.start) return data.view;
    if (data.rows.length === 0) return { start: 9 * 60, end: 15 * 60 };
    const lo = Math.min(...data.rows.map((r) => r.range.start));
    const hi = Math.max(...data.rows.map((r) => r.range.end));
    return { start: Math.floor(lo / 60) * 60, end: Math.max(Math.ceil(hi / 60) * 60, Math.floor(lo / 60) * 60 + 60) };
}

/** 보일 시각 범위 정하기 — null 이면 자동으로 되돌린다. 끝은 시작보다 15분 이상 뒤여야 한다. */
export function setView(data: TimetableData, view: { start: number; end: number } | null): TimetableData {
    if (!view) return { ...data, view: undefined };
    const start = Math.max(0, Math.min(view.start, 24 * 60 - 15));
    const end = Math.min(24 * 60, Math.max(view.end, start + 15));
    return { ...data, view: { start, end } };
}
