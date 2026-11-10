/**
 * 시간표 격자의 칸 이동·범위 글자 다루기 — 순수 함수(화면 없이 잰다).
 *   🔴 병합 칸은 한 칸으로 건넌다: 이동은 늘 「그 자리를 덮는 병합의 앵커」로 떨어진다.
 *   TSV 해석·생성은 창틀 공용(parseClipboard/toTsv)을 쓴다 — 시트와 같은 규칙.
 */
import { parseClipboard, toTsv } from '../../pane-ui-system';
import { addColumn, addRow, cellKey, columnCount, getCell, isCovered, normSel, parseCellKey, rowCount, setCellText, type Selection, type TimetableData } from './model';

export interface Pos { c: number; r: number; }

/** (c,r) 을 덮는 병합의 앵커 — 병합 밖이면 그 자리 그대로. */
export function ownerOf(data: TimetableData, c: number, r: number): Pos {
    for (const [key, cell] of Object.entries(data.cells)) {
        const a = parseCellKey(key);
        if (!a) continue;
        const rs = cell.rowSpan ?? 1, cs = cell.colSpan ?? 1;
        if ((rs > 1 || cs > 1) && c >= a.col && c < a.col + cs && r >= a.row && r < a.row + rs) return { c: a.col, r: a.row };
    }
    return { c, r };
}

/** 한 칸 움직이기 — 병합 칸에서 나갈 땐 병합의 먼 가장자리 너머로. 표 밖이면 제자리. */
export function step(data: TimetableData, from: Pos, dc: number, dr: number): Pos {
    const o = ownerOf(data, from.c, from.r);
    const cell = getCell(data, o.c, o.r);
    const cs = cell?.colSpan ?? 1, rs = cell?.rowSpan ?? 1;
    const c = dc > 0 ? o.c + cs : dc < 0 ? o.c - 1 : o.c;
    const r = dr > 0 ? o.r + rs : dr < 0 ? o.r - 1 : o.r;
    if (c < 0 || r < 0 || c >= columnCount(data.columns) || r >= rowCount(data)) return o;
    return ownerOf(data, c, r);
}

/** 범위 → TSV(덮인 칸은 빈 글자). */
export function rangeTsv(data: TimetableData, sel: Selection): string {
    const s = normSel(sel);
    const rows: string[][] = [];
    for (let r = s.row0; r <= s.row1; r++) {
        const line: string[] = [];
        for (let c = s.col0; c <= s.col1; c++) line.push(isCovered(data, c, r) ? '' : getCell(data, c, r)?.text ?? '');
        rows.push(line);
    }
    return toTsv(rows);
}

/** 범위 글자 지우기 — 바뀐 게 없으면 원본을 그대로 돌려준다(빈 되돌리기 칸을 안 쌓는다). 병합은 그대로. */
export function clearRange(data: TimetableData, sel: Selection): TimetableData {
    const s = normSel(sel);
    let d = data;
    for (let r = s.row0; r <= s.row1; r++) {
        for (let c = s.col0; c <= s.col1; c++) if (getCell(d, c, r)?.text) d = setCellText(d, c, r, '');
    }
    return d;
}

/**
 * TSV 붙여넣기 — 선택 왼쪽-위부터. 표 밖은 자르고 덮인 칸은 건너뛴다.
 *   한 칸짜리 글을 범위에 붙이면 범위 전체를 채운다(엑셀 관례). 바뀐 게 없으면 원본 그대로.
 *   돌려주는 area = 붙여넣은 범위(선택을 거기로 옮긴다).
 */
export function pasteTsv(data: TimetableData, sel: Selection, text: string): { data: TimetableData; area: Selection; notice?: string } {
    const s = normSel(sel);
    const grid = parseClipboard(text);
    if (grid.length === 1 && grid[0].length === 0) return { data, area: s };
    const single = grid.length === 1 && grid[0].length === 1;
    const h = single ? s.row1 - s.row0 + 1 : grid.length;
    const w = single ? s.col1 - s.col0 + 1 : Math.max(...grid.map((g) => g.length));
    // 넘치면 자동 확장 — 교시(행)는 addRow(시간 관문 guardTimeline 경유), 열은 addColumn. 더 못 늘리면 들어간 만큼만.
    let base = data;
    if (!single) {
        while (rowCount(base) < s.row0 + h) { const nx = addRow(base); if (nx === base || rowCount(nx) === rowCount(base)) break; base = nx; }
        while (columnCount(base.columns) < s.col0 + w) { const nx = addColumn(base); if (nx === base) break; base = nx; }
    }
    data = base;
    const nC = columnCount(data.columns), nR = rowCount(data);
    const lostRows = Math.max(0, s.row0 + h - nR), lostCols = Math.max(0, s.col0 + w - nC);
    const notice = lostRows > 0 ? `${lostRows}행은 하루 끝을 넘어 붙이지 못했습니다` : lostCols > 0 ? `${lostCols}열은 더 붙이지 못했습니다` : undefined;
    const area = { col0: s.col0, row0: s.row0, col1: Math.min(s.col0 + w, nC) - 1, row1: Math.min(s.row0 + h, nR) - 1 };
    let d = data;
    for (let r = area.row0; r <= area.row1; r++) {
        for (let c = area.col0; c <= area.col1; c++) {
            const v = single ? grid[0][0] : grid[r - s.row0]?.[c - s.col0];
            if (v === undefined || isCovered(d, c, r) || (d.cells[cellKey(c, r)]?.text ?? '') === v) continue;
            d = setCellText(d, c, r, v);
        }
    }
    return { data: d, area, notice };
}
