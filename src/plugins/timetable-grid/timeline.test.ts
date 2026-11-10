/**
 * W10a 시간 띠 — 행 길이가 1급 값 · 뒤 행 밀림 · 쉬는 시간은 갭 · 겹침 금지(경로마다) · 되돌리기 한 묶음 · 옛 자료 변환.
 */
import { describe, it, expect, afterEach } from 'vitest';
import type { NodesApi } from '../explorer/contracts/nodes';
import {
    blankTimetable, setCellText, setRowLength, setGapBefore, setRowTime, setRowTimeChecked, addRow, removeRow,
    rowLength, gapBefore, timelineProblem, guardTimeline, migrateBreakRows, normalizeTimetable, getCell, DAY_END,
    type TimetableData, type RowSpec,
} from './model';
import { pasteTsv } from './gridNav';
import { scheduleOn } from './schedule';
import { applyEdit, initGridNodes, sheetDataOf, stepEdit, SHEET_TYPE } from './nodes';

const ranges = (t: TimetableData) => t.rows.map((r) => [r.range.start, r.range.end]);
const gaps = (t: TimetableData) => t.rows.slice(1).map((_, i) => gapBefore(t, i + 1));

describe('행 길이 끌기 — 뒤 행 밀림 · 갭 유지', () => {
    it('행 1을 +30분 늘리면 뒤 행 전부가 30분 밀리고 갭은 그대로', () => {
        const t0 = blankTimetable();   // 50분 행 + 10분 갭 × 6
        const t = setRowLength(t0, 1, 80);
        expect(rowLength(t, 1)).toBe(80);
        expect(ranges(t)).toEqual([[540, 590], [600, 680], [690, 740], [750, 800], [810, 860], [870, 920]]);
        expect(gaps(t)).toEqual(gaps(t0));
        expect(timelineProblem(t.rows)).toBeNull();
    });
    it('줄이면 뒤 행이 당겨진다 · 최소 5분', () => {
        const t = setRowLength(blankTimetable(), 0, 0);
        expect(ranges(t)[0]).toEqual([540, 545]);
        expect(ranges(t)[1]).toEqual([555, 605]);   // 45분 당겨짐, 갭 10 유지
    });
    it('🔴 칸은 행을 따라간다 — 밀린 행의 칸 글자가 밀린 시각으로 나온다', () => {
        let t = setCellText(blankTimetable(), 0, 3, '과학');   // 월 · 4행
        const id = t.rows[3].id;
        t = setRowLength(t, 0, 80);
        expect(t.rows[3].id).toBe(id);
        expect(getCell(t, 0, 3)?.text).toBe('과학');
        expect(scheduleOn(t, '2026-11-02').find((e) => e.text === '과학')).toMatchObject({ start: 720 + 30, end: 770 + 30 });
    });
    it('하루 끝을 넘기면 막는다(그대로)', () => {
        const t0 = blankTimetable();
        expect(setRowLength(t0, 0, DAY_END)).toBe(t0);
    });
});

describe('갭(쉬는 시간)', () => {
    it('갭을 늘리면 그 뒤 행이 밀리고 앞 행·다른 갭은 그대로', () => {
        const t = setGapBefore(blankTimetable(), 2, 30);
        expect(gaps(t)).toEqual([10, 30, 10, 10, 10]);
        expect(ranges(t).slice(0, 2)).toEqual([[540, 590], [600, 650]]);
        expect(ranges(t)[2]).toEqual([680, 730]);
    });
    it('갭은 0까지 줄일 수 있고 음수는 0 · 첫 행 앞은 갭이 아니다', () => {
        const t0 = blankTimetable();
        expect(gapBefore(setGapBefore(t0, 1, -20), 1)).toBe(0);
        expect(setGapBefore(t0, 0, 30)).toBe(t0);
    });
});

describe('🔴 겹침 금지 — 경로마다', () => {
    it('직접 입력: 끝을 늘려 뒤 행과 겹치면 뒤 행을 민다(갭 유지)', () => {
        const t = setRowTime(blankTimetable(), 0, 540, 620);
        expect(ranges(t).slice(0, 2)).toEqual([[540, 620], [630, 680]]);
        expect(timelineProblem(t.rows)).toBeNull();
    });
    it('직접 입력: 앞 행과 겹치면 막는다 — 앞 행 끝에 맞추고 알림 한 줄', () => {
        const r = setRowTimeChecked(blankTimetable(), 1, 570, 620);   // 앞 행 540~590 과 겹침
        expect(ranges(r.data)[1]).toEqual([590, 640]);
        expect(r.notice).toContain('09:50');
        expect(timelineProblem(r.data.rows)).toBeNull();
    });
    it('직접 입력: 하루 끝을 넘기면 막는다(그대로 + 알림)', () => {
        const t0 = blankTimetable();
        const r = setRowTimeChecked(t0, 5, 1400, 1450);
        expect(r.data).toBe(t0);
        expect(r.notice).toContain('하루 끝');
    });
    it('행 추가: 안쪽에 넣으면 뒤 행이 「새 길이 + 갭」만큼 밀린다', () => {
        const t = addRow(blankTimetable(), 1);
        expect(t.rows.length).toBe(7);
        expect(ranges(t).slice(0, 3)).toEqual([[540, 590], [600, 650], [660, 710]]);
        expect(timelineProblem(t.rows)).toBeNull();
    });
    it('행 추가: 하루 끝을 넘기면 막는다', () => {
        const t0: TimetableData = { ...blankTimetable(), rows: [{ id: 'a', name: '', range: { start: 1380, end: 1430 } }] };
        expect(addRow(t0)).toBe(t0);
    });
    it('행 삭제: 뒤 행이 당겨지고 앞 갭은 그대로', () => {
        const t = removeRow(blankTimetable(), 1);
        expect(ranges(t).slice(0, 2)).toEqual([[540, 590], [600, 650]]);
        expect(timelineProblem(t.rows)).toBeNull();
    });
    it('붙여넣기: 칸만 바뀌고 시간은 그대로 · 관문을 지나도 겹침 없음', () => {
        const t0 = blankTimetable();
        const t = guardTimeline(t0, pasteTsv(t0, { col0: 0, row0: 0, col1: 0, row1: 0 }, 'a\tb\nc\td').data);
        expect(t.rows).toBe(t0.rows);
        expect(getCell(t, 1, 1)?.text).toBe('d');
    });
    it('관문: 겹치게 만든 편집은 뒤 행을 밀어서 푼다 · 하루 끝을 넘긴 편집은 막는다', () => {
        const t0 = blankTimetable();
        const bad: RowSpec[] = t0.rows.map((r, i) => (i === 2 ? { ...r, range: { start: 620, end: 670 } } : r));   // 앞 행(600~650)과 겹침
        const fixed = guardTimeline(t0, { ...t0, rows: bad });
        expect(timelineProblem(fixed.rows)).toBeNull();
        expect(ranges(fixed)[2]).toEqual([650, 700]);
        const late: RowSpec[] = t0.rows.map((r, i) => (i === 5 ? { ...r, range: { start: 1400, end: 1460 } } : r));
        expect(guardTimeline(t0, { ...t0, rows: late })).toBe(t0);
    });
});

describe('옛 자료 변환 — 쉬는 시간 행 → 갭', () => {
    const old = (): TimetableData => ({
        range: { kind: 'period', start: '', end: '' },
        columns: { kind: 'weekday', days: [1, 2, 3, 4, 5] },
        rows: [
            { id: 'a', name: '1교시', range: { start: 540, end: 585 } },
            { id: 'b', name: '쉬는 시간', range: { start: 585, end: 595 } },
            { id: 'c', name: '2교시', range: { start: 595, end: 640 } },
            { id: 'd', name: '휴식', range: { start: 640, end: 650 } },
            { id: 'e', name: '3교시', range: { start: 650, end: 695 } },
        ],
        cells: { c0r0: { text: '국어' }, c0r2: { text: '수학' }, c1r4: { text: '영어' } },
    });
    it('빈 쉬는 시간 행은 빠지고 그 자리가 갭이 된다 · 칸은 제 행을 따라간다', () => {
        const t = migrateBreakRows(old());
        expect(t.rows.map((r) => r.id)).toEqual(['a', 'c', 'e']);
        expect(gaps(t)).toEqual([10, 10]);
        expect(getCell(t, 0, 0)?.text).toBe('국어');
        expect(getCell(t, 0, 1)?.text).toBe('수학');
        expect(getCell(t, 1, 2)?.text).toBe('영어');
    });
    it('글자가 든 「쉬는 시간」 행은 사용자 자료라 남긴다', () => {
        const o = old();
        o.cells.c2r1 = { text: '독서' };
        expect(migrateBreakRows(o).rows.map((r) => r.id)).toEqual(['a', 'b', 'c', 'e']);
    });
    it('겹친 옛 자료는 읽을 때 뒤로 밀어 푼다 · 고칠 게 없으면 같은 참조', () => {
        const t0 = blankTimetable();
        expect(normalizeTimetable(t0)).toBe(t0);
        const o: TimetableData = { ...t0, rows: [{ id: 'a', name: '', range: { start: 540, end: 600 } }, { id: 'b', name: '', range: { start: 580, end: 630 } }] };
        expect(ranges(normalizeTimetable(o))).toEqual([[540, 600], [600, 650]]);
    });
});

describe('노드 다리 — 읽기 변환 · 되돌리기 한 번 = 끌기 한 번', () => {
    let data: TimetableData | undefined;
    function mount(init?: TimetableData) {
        data = init;
        const node = () => ({ id: 's1', type: SHEET_TYPE, name: 't', data });
        const api = { byType: () => [node()], get: () => node(), setData: (_: string, d: TimetableData) => { data = d; }, subscribe: () => ({ dispose() {} }) } as unknown as NodesApi;
        initGridNodes(api);
    }
    afterEach(() => { initGridNodes(null); });

    it('옛 자료는 sheetDataOf 에서 갭으로 바뀌어 나온다(같은 저장 객체엔 같은 참조)', () => {
        mount({ ...blankTimetable(), rows: [
            { id: 'a', name: '', range: { start: 540, end: 590 } },
            { id: 'b', name: '쉬는시간', range: { start: 590, end: 600 } },
            { id: 'c', name: '', range: { start: 600, end: 650 } },
        ] });
        const d = sheetDataOf('s1');
        expect(d.rows.map((r) => r.id)).toEqual(['a', 'c']);
        expect(sheetDataOf('s1')).toBe(d);
    });
    it('끌기 한 번(뒤 행 밀림까지)이 되돌리기 한 칸 — 칸 글자는 그대로 산다', () => {
        mount(setCellText(blankTimetable(), 2, 4, '체육'));
        const before = ranges(sheetDataOf('s1'));
        applyEdit('s1', (d) => setRowLength(d, 0, 90));
        expect(ranges(sheetDataOf('s1'))[5]).toEqual([before[5][0] + 40, before[5][1] + 40]);
        stepEdit('s1', 'undo');
        expect(ranges(sheetDataOf('s1'))).toEqual(before);
        expect(getCell(sheetDataOf('s1'), 2, 4)?.text).toBe('체육');
        stepEdit('s1', 'redo');
        expect(rowLength(sheetDataOf('s1'), 0)).toBe(90);
        expect(timelineProblem(sheetDataOf('s1').rows)).toBeNull();
    });
    it('🔴 applyEdit 관문 — 겹치게 쓰려는 편집도 저장될 땐 겹침이 풀려 있다', () => {
        mount(blankTimetable());
        applyEdit('s1', (d) => ({ ...d, rows: d.rows.map((r, i) => (i === 1 ? { ...r, range: { start: 560, end: 610 } } : r)) }));
        expect(timelineProblem(sheetDataOf('s1').rows)).toBeNull();
        expect(ranges(sheetDataOf('s1'))[1]).toEqual([590, 640]);
        expect(timelineProblem(data!.rows), '저장된 날 값부터 겹침이 없다(읽기 변환에 기대지 않는다)').toBeNull();
    });
});
