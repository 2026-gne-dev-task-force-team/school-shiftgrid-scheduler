/**
 * 시간표 그리드 — 일정 목록 검사(명세 3단계). 「어느 날짜·시각에 무엇이 적용되나」가 핵심.
 */
import { describe, it, expect } from 'vitest';
import { dayNumber, gridDayOf, eachDate, inRange, activeColumn, scheduleOn, scheduleRange } from './schedule';
import { blankTimetable, setCellText, mergeCells, setRowTime } from './model';
import type { TimetableData } from './model';

/** 기본: 월~금, 6행, (col,row) 에 글자 몇 개. 범위는 2026-11-02(월)~2026-11-30. */
function base(): TimetableData {
    let t = blankTimetable();
    t = { ...t, range: { kind: 'period', start: '2026-11-02', end: '2026-11-30' } };
    t = setCellText(t, 0, 0, '월1');   // 월요일 1행
    t = setCellText(t, 2, 0, '수1');   // 수요일 1행
    return t;
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

describe('일정 목록(scheduleOn)', () => {
    it('기본 칸만 — 월요일에 월1', () => {
        const got = scheduleOn(base(), '2026-11-02');
        expect(got.map((e) => e.text)).toEqual(['월1']);
        expect(got[0]).toMatchObject({ date: '2026-11-02', col: 0, row: 0, start: 540, end: 590 });
    });
    it('범위 밖 날짜는 빈 목록', () => {
        expect(scheduleOn(base(), '2026-12-25')).toEqual([]);
    });
    it('세로 병합 앵커는 시작~끝을 span 만큼 늘린다', () => {
        let t = base();
        t = setCellText(t, 0, 0, '블록');
        t = mergeCells(t, { col0: 0, row0: 0, col1: 0, row1: 1 });   // 1·2행 세로 병합
        const got = scheduleOn(t, '2026-11-02');
        const block = got.find((e) => e.row === 0)!;
        expect(block.start).toBe(540);   // 1행 시작
        expect(block.end).toBe(650);     // 2행 끝(병합으로 늘어남)
        // 덮인 1행(row 1)은 따로 안 나온다
        expect(got.some((e) => e.row === 1)).toBe(false);
    });
    it('칸별 시각 덮어쓰기는 행 시각보다 우선 — 하지만 행 일괄 편집이 바닥', () => {
        let t = base();
        t = setRowTime(t, 0, 480, 520);   // 1행 시각을 08:00~08:40 로 일괄
        const got = scheduleOn(t, '2026-11-02');
        expect(got.find((e) => e.row === 0)).toMatchObject({ start: 480, end: 520 });
    });
});

describe('일정 목록(scheduleRange) — 한 주', () => {
    it('월·수에만 칸이 있으니 그 둘만', () => {
        const got = scheduleRange(base(), '2026-11-02', '2026-11-08');
        // 월(월1) · 수(수1) — 일요일 제외
        expect(got.map((e) => `${e.date}:${e.text}`)).toEqual(['2026-11-02:월1', '2026-11-04:수1']);
    });
});
