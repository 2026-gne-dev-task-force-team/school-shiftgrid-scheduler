/**
 * selection.ts 검산 — 범위 선택 순수 계산. 날짜·시각은 지역 Date 로 고정(2026-11).
 *   역방향 끌기 정렬 · 한 칸 · 날 넘김 · 자정 24:00 · Shift 확장 · 라벨 글자 · 열별 구간 자르기 경계 · 스냅.
 */
import { describe, it, expect } from 'vitest';
import {
    daysSelection, timeSelection, floorToSnap,
    dayInSelection, timeSliceForDay, selectionLabel,
    type CalSelection,
} from './selection';

const DAY_MS = 86_400_000;
/** 2026-11-D HH:MM 지역 ms */
const t = (d: number, h = 0, min = 0) => new Date(2026, 10, d, h, min).getTime();
const dayStart = (d: number) => new Date(2026, 10, d).getTime();

describe('daysSelection — 두 점 정렬', () => {
    it('정방향·역방향 끌기가 같은 범위를 준다', () => {
        expect(daysSelection('2026-11-03', '2026-11-07')).toEqual({ kind: 'days', from: '2026-11-03', to: '2026-11-07' });
        expect(daysSelection('2026-11-07', '2026-11-03')).toEqual({ kind: 'days', from: '2026-11-03', to: '2026-11-07' });
    });
    it('한 칸 선택은 from===to', () => {
        expect(daysSelection('2026-11-03', '2026-11-03')).toEqual({ kind: 'days', from: '2026-11-03', to: '2026-11-03' });
    });
});

describe('timeSelection — 슬롯 두 개 → 반열린 [start,end)', () => {
    it('한 칸(anchor===cur)은 [cur, cur+snap)', () => {
        expect(timeSelection(t(3, 14, 0), t(3, 14, 0), 30)).toEqual({ kind: 'time', startMs: t(3, 14, 0), endMs: t(3, 14, 30) });
    });
    it('죽 끌면 큰 쪽 칸 끝까지(14:00~15:30 슬롯 → [14:00, 16:00))', () => {
        expect(timeSelection(t(3, 14, 0), t(3, 15, 30), 30)).toEqual({ kind: 'time', startMs: t(3, 14, 0), endMs: t(3, 16, 0) });
    });
    it('역방향도 같은 결과', () => {
        expect(timeSelection(t(3, 15, 30), t(3, 14, 0), 30)).toEqual({ kind: 'time', startMs: t(3, 14, 0), endMs: t(3, 16, 0) });
    });
    it('날을 넘겨도 된다', () => {
        expect(timeSelection(t(3, 23, 0), t(4, 1, 0), 30)).toEqual({ kind: 'time', startMs: t(3, 23, 0), endMs: t(4, 1, 30) });
    });
});

describe('floorToSnap — 분을 슬롯 시작으로', () => {
    it('30분 단위로 내린다', () => {
        expect(floorToSnap(0, 30)).toBe(0);
        expect(floorToSnap(29, 30)).toBe(0);
        expect(floorToSnap(44, 30)).toBe(30);
        expect(floorToSnap(14 * 60 + 10, 30)).toBe(14 * 60);
    });
    it('마지막 칸은 23:30(1440-snap)으로 가둔다 · 음수는 0', () => {
        expect(floorToSnap(1439, 30)).toBe(1410);
        expect(floorToSnap(5000, 30)).toBe(1410);
        expect(floorToSnap(-5, 30)).toBe(0);
    });
});

describe('dayInSelection', () => {
    it('days: from~to 양끝 포함', () => {
        const sel = daysSelection('2026-11-03', '2026-11-07');
        expect(dayInSelection(sel, '2026-11-03')).toBe(true);
        expect(dayInSelection(sel, '2026-11-07')).toBe(true);
        expect(dayInSelection(sel, '2026-11-05')).toBe(true);
        expect(dayInSelection(sel, '2026-11-02')).toBe(false);
        expect(dayInSelection(sel, '2026-11-08')).toBe(false);
    });
    it('time: startMs 날 ~ endMs-1 의 날만(반열린)', () => {
        const sel = timeSelection(t(3, 23, 0), t(4, 1, 0), 30);   // [11/3 23:00, 11/4 01:30)
        expect(dayInSelection(sel, '2026-11-03')).toBe(true);
        expect(dayInSelection(sel, '2026-11-04')).toBe(true);
        expect(dayInSelection(sel, '2026-11-05')).toBe(false);
        expect(dayInSelection(sel, '2026-11-02')).toBe(false);
    });
    it('time: 끝이 자정이면 그 다음 날은 안 칠한다(반열린 끝)', () => {
        const sel: CalSelection = { kind: 'time', startMs: t(3, 22, 0), endMs: t(4, 0, 0) };  // [11/3 22:00, 11/4 00:00)
        expect(dayInSelection(sel, '2026-11-03')).toBe(true);
        expect(dayInSelection(sel, '2026-11-04')).toBe(false);
    });
    it('null 은 늘 false', () => {
        expect(dayInSelection(null, '2026-11-03')).toBe(false);
    });
});

describe('timeSliceForDay — 열별 칠할 구간', () => {
    it('time: 그 날로 자른다(위로·아래로 넘치면 자정 경계로)', () => {
        const sel = timeSelection(t(3, 23, 0), t(4, 1, 0), 30);   // [11/3 23:00, 11/4 01:30)
        // 11/3 열: 23:00 ~ 자정
        expect(timeSliceForDay(sel, dayStart(3), '2026-11-03')).toEqual({ startMs: t(3, 23, 0), endMs: dayStart(4) });
        // 11/4 열: 자정 ~ 01:30
        expect(timeSliceForDay(sel, dayStart(4), '2026-11-04')).toEqual({ startMs: dayStart(4), endMs: t(4, 1, 30) });
        // 11/5 열: 없음
        expect(timeSliceForDay(sel, dayStart(5), '2026-11-05')).toBeNull();
    });
    it('time: 끝이 자정인 날은 그 전날만(경계 맞닿음은 안 칠함)', () => {
        const sel: CalSelection = { kind: 'time', startMs: t(3, 22, 0), endMs: dayStart(4) };
        expect(timeSliceForDay(sel, dayStart(3), '2026-11-03')).toEqual({ startMs: t(3, 22, 0), endMs: dayStart(4) });
        expect(timeSliceForDay(sel, dayStart(4), '2026-11-04')).toBeNull();   // a===b 는 빈 구간
    });
    it('days: 범위 안 날은 열 전체(종일), 밖은 null', () => {
        const sel = daysSelection('2026-11-03', '2026-11-05');
        expect(timeSliceForDay(sel, dayStart(4), '2026-11-04')).toEqual({ startMs: dayStart(4), endMs: dayStart(4) + DAY_MS });
        expect(timeSliceForDay(sel, dayStart(6), '2026-11-06')).toBeNull();
    });
});

describe('selectionLabel — Shift 확장 결과도 같은 라벨', () => {
    it('days 범위', () => {
        expect(selectionLabel(daysSelection('2026-11-03', '2026-11-07'))).toBe('11/3(화) ~ 11/7(토) · 5일');
    });
    it('days 한 칸', () => {
        expect(selectionLabel(daysSelection('2026-11-03', '2026-11-03'))).toBe('11/3(화) · 1일');
    });
    it('time 같은 날', () => {
        expect(selectionLabel(timeSelection(t(3, 14, 0), t(3, 15, 30), 30))).toBe('11/3(화) 14:00–16:00 · 2시간');
    });
    it('time 날 넘김', () => {
        expect(selectionLabel(timeSelection(t(3, 23, 0), t(4, 1, 0), 30))).toBe('11/3(화) 23:00 ~ 11/4(수) 01:30 · 2시간 30분');
    });
    it('time 자정 상한(24:00 표기, 날 안 넘김)', () => {
        // 마지막 칸 23:30 한 개 → [23:30, 24:00)
        expect(selectionLabel(timeSelection(t(3, 23, 30), t(3, 23, 30), 30))).toBe('11/3(화) 23:30–24:00 · 30분');
    });
    it('선택 없으면 빈 문자열', () => {
        expect(selectionLabel(null)).toBe('');
    });
});

describe('Shift 확장 — anchor 유지(daysSelection/timeSelection 재호출로 구현)', () => {
    it('anchor 11/5 에서 11/2 로 확장하면 11/2~11/5', () => {
        // 뷰는 anchor 를 쥐고 shift+click 때 daysSelection(anchor, target) 을 다시 부른다
        const anchor = '2026-11-05';
        expect(daysSelection(anchor, '2026-11-02')).toEqual({ kind: 'days', from: '2026-11-02', to: '2026-11-05' });
        expect(daysSelection(anchor, '2026-11-09')).toEqual({ kind: 'days', from: '2026-11-05', to: '2026-11-09' });
    });
    it('time anchor 14:00 슬롯에서 16:30 슬롯으로 확장', () => {
        const anchor = t(3, 14, 0);
        expect(timeSelection(anchor, t(3, 16, 30), 30)).toEqual({ kind: 'time', startMs: t(3, 14, 0), endMs: t(3, 17, 0) });
    });
});
