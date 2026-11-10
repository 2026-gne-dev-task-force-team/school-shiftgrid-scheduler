/**
 * 시간표 순수 모델 검사 — 손 편집의 바닥(명세 1단계). 병합 유효성이 이 검사의 핵심이다.
 */
import { describe, it, expect } from 'vitest';
import {
    blankTimetable, cellKey, parseCellKey, columnCount, rowCount, defaultColName, colName,
    setCellText, getCell, isCovered, canMerge, mergeCells, unmergeCells,
    addRow, removeRow, addColumn, removeColumn, renameRow, renameColumn, setColumnDay, toggleColumnKind,
    toggleRangeKind, colWidth, setColWidth, viewRange, setView, setRowTime, COL_W, COL_MIN_W,
} from './model';
import type { TimetableData } from './model';

describe('빈 표(처음 켰을 때)', () => {
    it('월~금 × 6행 · 범위 미설정 · 칸 0', () => {
        const t = blankTimetable();
        expect(t.columns).toEqual({ kind: 'weekday', days: [1, 2, 3, 4, 5] });
        expect(columnCount(t.columns)).toBe(5);
        expect(rowCount(t)).toBe(6);
        expect(Object.keys(t.cells).length).toBe(0);
        expect(t.rows.every((r) => r.name === '')).toBe(true);   // ⛔ 「1교시」 안 박음
        expect(t.range).toEqual({ kind: 'period', start: '', end: '' });
    });
    it('기본 행 시각은 09:00 부터 50분 + 10분 틈', () => {
        const t = blankTimetable();
        expect(t.rows[0].range).toEqual({ start: 540, end: 590 });
        expect(t.rows[1].range).toEqual({ start: 600, end: 650 });
    });
});

describe('칸 열쇠', () => {
    it('key ↔ parse 왕복', () => {
        expect(cellKey(3, 4)).toBe('c3r4');
        expect(parseCellKey('c3r4')).toEqual({ col: 3, row: 4 });
        expect(parseCellKey('x')).toBeNull();
    });
});

describe('칸 글자', () => {
    it('빈 칸은 저장 안 하고, 글자를 넣으면 생긴다', () => {
        let t = blankTimetable();
        t = setCellText(t, 1, 2, '국어');
        expect(getCell(t, 1, 2)?.text).toBe('국어');
        t = setCellText(t, 1, 2, '');
        expect(getCell(t, 1, 2)).toBeUndefined();
        expect(Object.keys(t.cells).length).toBe(0);
    });
    it('순수 — 원본은 안 바뀐다', () => {
        const t = blankTimetable();
        const t2 = setCellText(t, 0, 0, 'x');
        expect(getCell(t, 0, 0)).toBeUndefined();
        expect(getCell(t2, 0, 0)?.text).toBe('x');
    });
});

describe('셀 병합 — 유효성', () => {
    it('한 칸은 병합 못 한다', () => {
        const t = blankTimetable();
        expect(canMerge(t, { col0: 0, row0: 0, col1: 0, row1: 0 }).ok).toBe(false);
    });
    it('격자 밖은 막는다', () => {
        const t = blankTimetable();
        expect(canMerge(t, { col0: 0, row0: 0, col1: 9, row1: 1 }).ok).toBe(false);
    });
    it('세로 2행 병합 — 앵커가 rowSpan 2, 아래 칸이 덮인다', () => {
        let t = blankTimetable();
        t = setCellText(t, 1, 0, '자습');
        t = mergeCells(t, { col0: 1, row0: 0, col1: 1, row1: 1 });
        expect(getCell(t, 1, 0)?.rowSpan).toBe(2);
        expect(isCovered(t, 1, 1)).toBe(true);
        expect(getCell(t, 1, 1)).toBeUndefined();
    });
    it('가로 병합도 된다(colSpan)', () => {
        let t = blankTimetable();
        t = mergeCells(t, { col0: 0, row0: 0, col1: 2, row1: 0 });
        expect(getCell(t, 0, 0)?.colSpan).toBe(3);
        expect(isCovered(t, 1, 0)).toBe(true);
        expect(isCovered(t, 2, 0)).toBe(true);
    });
    it('기존 병합을 가로지르는 선택은 막는다', () => {
        let t = blankTimetable();
        t = mergeCells(t, { col0: 0, row0: 0, col1: 0, row1: 1 });   // (0,0)-(0,1) 세로 병합
        // (0,1)-(0,2) 는 위 병합을 가로지른다(아래로 걸침)
        expect(canMerge(t, { col0: 0, row0: 1, col1: 0, row1: 2 }).ok).toBe(false);
        // 기존 병합을 통째로 품는 큰 선택은 된다
        expect(canMerge(t, { col0: 0, row0: 0, col1: 1, row1: 2 }).ok).toBe(true);
    });
    it('병합 해제 — span 이 1 로 돌아오고 덮였던 칸이 되살아난다', () => {
        let t = blankTimetable();
        t = setCellText(t, 1, 0, '자습');
        t = mergeCells(t, { col0: 1, row0: 0, col1: 1, row1: 2 });
        expect(isCovered(t, 1, 1)).toBe(true);
        t = unmergeCells(t, 1, 0);
        expect(getCell(t, 1, 0)?.rowSpan).toBeUndefined();
        expect(isCovered(t, 1, 1)).toBe(false);
        expect(getCell(t, 1, 0)?.text).toBe('자습');   // 앵커 글자는 남는다
    });
});

describe('행 넣고 빼기', () => {
    it('끝에 행 추가 — 7행', () => {
        const t = addRow(blankTimetable());
        expect(rowCount(t)).toBe(7);
    });
    it('행 지우면 아래 칸이 위로 당겨진다', () => {
        let t = blankTimetable();
        t = setCellText(t, 0, 3, 'A');
        t = removeRow(t, 1);
        expect(rowCount(t)).toBe(5);
        expect(getCell(t, 0, 2)?.text).toBe('A');   // 3 → 2 로
    });
    it('행을 지우면 거기 걸친 병합은 풀린다', () => {
        let t = blankTimetable();
        t = setCellText(t, 0, 1, 'M');
        t = mergeCells(t, { col0: 0, row0: 1, col1: 0, row1: 3 });   // 1~3 세로 병합
        t = removeRow(t, 2);                                          // 가운데 행 제거
        // 병합이 풀려 앵커 span 이 사라진다(남은 앵커가 어디든 rowSpan 없음)
        const anchors = Object.values(t.cells).filter((c) => (c.rowSpan ?? 1) > 1);
        expect(anchors.length).toBe(0);
    });
    it('마지막 한 행은 안 지운다', () => {
        let t: TimetableData = { range: { kind: 'repeat', count: 1 }, columns: { kind: 'cycle', count: 1 }, rows: blankTimetable().rows.slice(0, 1), cells: {} };
        t = removeRow(t, 0);
        expect(rowCount(t)).toBe(1);
    });
});

describe('열 넣고 빼기', () => {
    it('요일 열 추가 — 다음 빈 요일(토)', () => {
        const t = addColumn(blankTimetable());   // 월~금 → 월~토
        expect(t.columns).toEqual({ kind: 'weekday', days: [1, 2, 3, 4, 5, 6] });
    });
    it('요일 6개 다 차면 더 못 넣는다', () => {
        let t = addColumn(blankTimetable());   // 토까지 6
        t = addColumn(t);                      // 그대로
        expect(columnCount(t.columns)).toBe(6);
    });
    it('열 지우면 오른쪽 칸이 왼쪽으로 당겨진다', () => {
        let t = blankTimetable();
        t = setCellText(t, 3, 0, 'B');
        t = removeColumn(t, 1);
        expect(columnCount(t.columns)).toBe(4);
        expect(getCell(t, 2, 0)?.text).toBe('B');   // 3 → 2
    });
});

describe('머리 이름·열 꼴', () => {
    it('행 이름 고치기', () => {
        const t = renameRow(blankTimetable(), 0, '아침');
        expect(t.rows[0].name).toBe('아침');
    });
    it('열 기본 이름 = 요일, 덮어쓰면 그 이름', () => {
        let t = blankTimetable();
        expect(defaultColName(t.columns, 2)).toBe('수');
        t = renameColumn(t, 2, 'A조');
        expect(colName(t, 2)).toBe('A조');
        t = renameColumn(t, 2, '');   // 비우면 기본으로 복귀
        expect(colName(t, 2)).toBe('수');
    });
    it('요일 열을 다른 요일로', () => {
        const t = setColumnDay(blankTimetable(), 0, 6);   // 첫 열을 토로
        expect((t.columns as { days: number[] }).days[0]).toBe(6);
    });
    it('열 꼴 토글 — 요일↔일차(개수 유지)', () => {
        let t = toggleColumnKind(blankTimetable());   // 월~금(5) → 5일차
        expect(t.columns).toEqual({ kind: 'cycle', count: 5 });
        t = toggleColumnKind(t);                       // 5일차 → 월~금
        expect(t.columns).toEqual({ kind: 'weekday', days: [1, 2, 3, 4, 5] });
    });
    it('범위 꼴 토글 — 기간↔N회', () => {
        let t = toggleRangeKind(blankTimetable());
        expect(t.range.kind).toBe('repeat');
        t = toggleRangeKind(t);
        expect(t.range.kind).toBe('period');
    });
});

describe('열 너비·보이는 시각(Q4 T2·T4·T5)', () => {
    it('열 너비 — 기본 · 바꾸면 저장 · 기본값으로 돌리면 덮어쓰기가 걷힌다 · 하한', () => {
        let t = blankTimetable();
        expect(colWidth(t, 1)).toBe(COL_W);
        t = setColWidth(t, 1, 200);
        expect(colWidth(t, 1)).toBe(200);
        expect(setColWidth(t, 1, 10).colWidths).toEqual({ '1': COL_MIN_W });
        expect(setColWidth(t, 1, COL_W).colWidths).toBeUndefined();
    });
    it('열을 지우면 그 오른쪽 열 너비가 당겨진다', () => {
        let t = setColWidth(setColWidth(blankTimetable(), 1, 200), 3, 300);
        t = removeColumn(t, 1);
        expect(t.colWidths).toEqual({ '2': 300 });
    });
    it('보이는 시각 — 자동은 행 시각을 정시로 감싼다 · 정하면 그것 · null 로 자동 복귀', () => {
        let t = blankTimetable();   // 09:00 ~ 14:50
        expect(viewRange(t)).toEqual({ start: 540, end: 900 });
        t = setRowTime(t, 5, 840, 905);   // 끝 15:05 → 16:00 까지 감싼다
        expect(viewRange(t).end).toBe(960);
        t = setView(t, { start: 420, end: 1080 });
        expect(viewRange(t)).toEqual({ start: 420, end: 1080 });
        expect(viewRange(setView(t, null))).toEqual({ start: 540, end: 960 });
    });
    it('보이는 시각 — 끝이 시작보다 앞서면 15분 뒤로 민다', () => {
        expect(setView(blankTimetable(), { start: 600, end: 500 }).view).toEqual({ start: 600, end: 615 });
    });
});
