/**
 * 시간표 그리드 — 특별 시간표 적용 + 일정 목록 검사(명세 3단계). 「어느 날짜·시각에 무엇이 적용되나」가 핵심.
 */
import { describe, it, expect } from 'vitest';
import {
    dayNumber, gridDayOf, eachDate, inRange, activeColumn, orderedSpecials, scheduleOn, scheduleRange,
    type SpecialInput,
} from './schedule';
import { blankTimetable, setCellText, mergeCells, setRowTime } from './model';
import type { TimetableData, SpecialData } from './model';

/** 기본: 월~금, 6행, (col,row) 에 글자 몇 개. 범위는 2026-11-02(월)~2026-11-30. */
function base(): TimetableData {
    let t = blankTimetable();
    t = { ...t, range: { kind: 'period', start: '2026-11-02', end: '2026-11-30' } };
    t = setCellText(t, 0, 0, '월1');   // 월요일 1행
    t = setCellText(t, 2, 0, '수1');   // 수요일 1행
    return t;
}

function special(id: string, mode: 'overlay' | 'replace', cells: [number, number, string][], priority?: number): SpecialInput {
    let t = blankTimetable() as TimetableData;
    for (const [c, r, text] of cells) t = setCellText(t, c, r, text);
    const data: SpecialData = { ...t, range: { kind: 'period', start: '2026-11-09', end: '2026-11-09' }, mode, ...(priority !== undefined ? { priority } : {}) };
    return { id, data };
}

describe('날짜 유틸', () => {
    it('dayNumber 는 하루 차이가 1', () => {
        expect(dayNumber('2026-11-03') - dayNumber('2026-11-02')).toBe(1);
        expect(Number.isNaN(dayNumber('nope'))).toBe(true);
    });
    it('gridDayOf — 월=1 … 토=6, 일요일은 null', () => {
        expect(gridDayOf('2026-11-02')).toBe(1);   // 월
        expect(gridDayOf('2026-11-07')).toBe(6);   // 토
        expect(gridDayOf('2026-11-08')).toBeNull();   // 일
    });
    it('eachDate — 둘 다 포함, 역순은 빈 배열', () => {
        expect(eachDate('2026-11-02', '2026-11-04')).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
        expect(eachDate('2026-11-04', '2026-11-02')).toEqual([]);
    });
});

describe('범위·열 고르기', () => {
    it('inRange — 기간 경계', () => {
        const t = base();
        expect(inRange(t, '2026-11-01')).toBe(false);
        expect(inRange(t, '2026-11-02')).toBe(true);
        expect(inRange(t, '2026-11-30')).toBe(true);
        expect(inRange(t, '2026-12-01')).toBe(false);
    });
    it('activeColumn — 요일은 자리, 일요일은 null', () => {
        const t = base();
        expect(activeColumn(t, '2026-11-02')).toBe(0);   // 월 = 0열
        expect(activeColumn(t, '2026-11-04')).toBe(2);   // 수 = 2열
        expect(activeColumn(t, '2026-11-08')).toBeNull();   // 일
    });
    it('activeColumn — 일차(cycle)는 anchor 로부터 순환', () => {
        const t: TimetableData = { ...blankTimetable(), columns: { kind: 'cycle', count: 3 } };
        expect(activeColumn(t, '2026-11-02', '2026-11-02')).toBe(0);
        expect(activeColumn(t, '2026-11-03', '2026-11-02')).toBe(1);
        expect(activeColumn(t, '2026-11-05', '2026-11-02')).toBe(0);   // 3일 뒤 = 다시 0
    });
});

describe('우선순위', () => {
    it('숫자를 매긴 특별이 위치 기본보다 앞선다', () => {
        const a = special('a', 'overlay', []);              // 위치만
        const b = special('b', 'overlay', [], 5);           // 숫자 매김
        const c = special('c', 'overlay', []);              // 위치만
        // 입력 순서 a,b,c → 정렬하면 위치(a,c) 먼저, 숫자(b) 마지막(= 가장 셈)
        const order = orderedSpecials([a, b, c]).map((s) => s.id);
        expect(order[order.length - 1]).toBe('b');
    });
    it('위치 기본 — 뒤 노드가 더 세다', () => {
        const a = special('a', 'overlay', []);
        const b = special('b', 'overlay', []);
        expect(orderedSpecials([a, b]).map((s) => s.id)).toEqual(['a', 'b']);
    });
});

describe('일정 목록(scheduleOn)', () => {
    it('특별 없으면 기본 칸만 — 월요일에 월1', () => {
        const got = scheduleOn(base(), [], '2026-11-02');
        expect(got.map((e) => e.text)).toEqual(['월1']);
        expect(got[0]).toMatchObject({ date: '2026-11-02', col: 0, row: 0, start: 540, end: 590, source: 'base' });
    });
    it('범위 밖 날짜는 빈 목록', () => {
        expect(scheduleOn(base(), [], '2026-12-25')).toEqual([]);
    });
    it('overlay — 그날 글자 든 칸만 덮는다(빈 칸은 기본이 남는다)', () => {
        // 2026-11-09 는 월요일 → 0열. overlay 가 (0,0) 을 「행사」로 덮는다.
        const sp = special('sp', 'overlay', [[0, 0, '행사']]);
        const got = scheduleOn(base(), [sp], '2026-11-09');
        expect(got.find((e) => e.row === 0)).toMatchObject({ text: '행사', source: 'sp' });
    });
    it('replace — 통째로 바뀐다(기본 글자가 사라진다)', () => {
        // replace 특별이 (0,1) 만 채움 → 그 열의 기본 (0,0)='월1' 도 덮여서 사라진다.
        const sp = special('sp', 'replace', [[0, 1, '종일자습']]);
        const got = scheduleOn(base(), [sp], '2026-11-09');
        // 월1(0,0) 은 replace 로 빈 칸이 되어 안 나오고, 종일자습(0,1) 만 나온다
        expect(got.map((e) => e.text)).toEqual(['종일자습']);
        expect(got[0].source).toBe('sp');
    });
    it('세로 병합 앵커는 시작~끝을 span 만큼 늘린다', () => {
        let t = base();
        t = setCellText(t, 0, 0, '블록');
        t = mergeCells(t, { col0: 0, row0: 0, col1: 0, row1: 1 });   // 1·2행 세로 병합
        const got = scheduleOn(t, [], '2026-11-02');
        const block = got.find((e) => e.row === 0)!;
        expect(block.start).toBe(540);   // 1행 시작
        expect(block.end).toBe(650);     // 2행 끝(병합으로 늘어남)
        // 덮인 1행(row 1)은 따로 안 나온다
        expect(got.some((e) => e.row === 1)).toBe(false);
    });
    it('칸별 시각 덮어쓰기는 행 시각보다 우선 — 하지만 행 일괄 편집이 바닥', () => {
        let t = base();
        t = setRowTime(t, 0, 480, 520);   // 1행 시각을 08:00~08:40 로 일괄
        const got = scheduleOn(t, [], '2026-11-02');
        expect(got.find((e) => e.row === 0)).toMatchObject({ start: 480, end: 520 });
    });
});

describe('일정 목록(scheduleRange) — 한 주', () => {
    it('기본만 — 월·수에만 칸이 있으니 그 둘만', () => {
        const got = scheduleRange(base(), [], '2026-11-02', '2026-11-08');
        // 월(월1) · 수(수1) — 일요일 제외
        expect(got.map((e) => `${e.date}:${e.text}`)).toEqual(['2026-11-02:월1', '2026-11-04:수1']);
    });
    it('특별(overlay)이 그 하루만 끼어든다', () => {
        const sp = special('sp', 'overlay', [[0, 0, '행사']]);   // 2026-11-09(월)
        const got = scheduleRange(base(), [sp], '2026-11-09', '2026-11-11');
        const mon = got.filter((e) => e.date === '2026-11-09');
        expect(mon.map((e) => e.text)).toContain('행사');
    });
});
