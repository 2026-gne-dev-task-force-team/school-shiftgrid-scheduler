/**
 * 스케줄러 모델 검사 — 파생 시각 · 5분 스냅 · 행 늘리면 뒤가 밀림 · 카드 겹침 나누기 · 눈금 적용.
 * 🔴 전부 순수 함수만 — React·DOM 없음(기본 node 환경).
 */
import { describe, it, expect } from 'vitest';
import {
    defaultSchedule, DEFAULT_GRID, addCard, removeCard, moveCard, resizeCard, updateCard,
    resizeRow, addCol, removeCol, setColLabel, columnLayout, rowTimes, cardTime,
    axisSpanMinutes, snap, applyGrid, rowDisplayLabel,
    type Schedule, type Card,
} from './model';

const base = (): Schedule => defaultSchedule();

describe('기본 스케줄', () => {
    it('5열(월~금) × 6줄(40분·쉬는 10·09:00) · 카드 0', () => {
        const s = base();
        expect(s.startTime).toBe('09:00');
        expect(s.cols.map((c) => c.label)).toEqual(['월', '화', '수', '목', '금']);
        expect(s.rows.length).toBe(6);
        expect(s.rows.every((r) => r.minutes === 40 && r.gapAfter === 10 && r.assignable)).toBe(true);
        expect(s.cards.length).toBe(0);
    });
});

describe('파생 시각 — 저장 안 하고 startTime + 누적', () => {
    it('rowTimes: 40분 수업 + 10분 쉬는 시간이 누적된다', () => {
        const s = base();
        const t = rowTimes(s.startTime, s.rows);
        expect(t[0]).toEqual({ start: '09:00', end: '09:40' });   // 1줄
        expect(t[1]).toEqual({ start: '09:50', end: '10:30' });   // 09:40 + 10분 틈
        expect(t[2]).toEqual({ start: '10:40', end: '11:20' });
    });
    it('cardTime: 카드도 startTime + 오프셋에서 파생', () => {
        let s = base();
        s = addCard(s, { colKey: s.cols[0].key, start: 50, minutes: 40, title: '수학' });
        expect(cardTime(s, s.cards[0])).toEqual({ start: '09:50', end: '10:30' });
    });
    it('rowDisplayLabel: 라벨 없으면 수업 줄만 세어 자동 번호', () => {
        const s = base();
        expect(rowDisplayLabel(s.rows, 0)).toBe('1');
        expect(rowDisplayLabel(s.rows, 2)).toBe('3');
    });
});

describe('5분 스냅 — 🔴 손맛의 핵심', () => {
    it('snap 은 5분 격자로 반올림', () => {
        expect(snap(52)).toBe(50);
        expect(snap(53)).toBe(55);
        expect(snap(57)).toBe(55);
    });
    it('addCard 가 start·minutes 를 스냅한다', () => {
        let s = base();
        s = addCard(s, { colKey: s.cols[0].key, start: 52, minutes: 43, title: 'x' });
        expect(s.cards[0].start).toBe(50);
        expect(s.cards[0].minutes).toBe(45);
    });
    it('moveCard 가 start 를 스냅한다', () => {
        let s = base();
        s = addCard(s, { id: 'a', colKey: s.cols[0].key, start: 0, minutes: 40, title: 'x' });
        s = moveCard(s, 'a', { start: 63 });
        expect(s.cards[0].start).toBe(65);
    });
    it('resizeCard 가 minutes 를 스냅하고 최소 5분을 지킨다', () => {
        let s = base();
        s = addCard(s, { id: 'a', colKey: s.cols[0].key, start: 0, minutes: 40, title: 'x' });
        s = resizeCard(s, 'a', 23);
        expect(s.cards[0].minutes).toBe(25);
        s = resizeCard(s, 'a', 1);
        expect(s.cards[0].minutes).toBe(5);
    });
});

describe('카드 이동·속성', () => {
    it('moveCard 로 다른 열로 옮긴다 · 없는 열이면 그대로', () => {
        let s = base();
        s = addCard(s, { id: 'a', colKey: s.cols[0].key, start: 0, minutes: 40, title: 'x' });
        s = moveCard(s, 'a', { colKey: s.cols[2].key });
        expect(s.cards[0].colKey).toBe(s.cols[2].key);
        s = moveCard(s, 'a', { colKey: '없는키' });
        expect(s.cards[0].colKey).toBe(s.cols[2].key);
    });
    it('updateCard 로 제목·사람·반복을 고친다(즉시 반영)', () => {
        let s = base();
        s = addCard(s, { id: 'a', colKey: s.cols[0].key, start: 0, minutes: 40, title: 'x' });
        s = updateCard(s, 'a', { title: '국어', people: ['김교사', '1-1'], repeat: 'once' });
        expect(s.cards[0].title).toBe('국어');
        expect(s.cards[0].people).toEqual(['김교사', '1-1']);
        expect(s.cards[0].repeat).toBe('once');
    });
    it('반복 기본값은 weekly', () => {
        let s = base();
        s = addCard(s, { colKey: s.cols[0].key, start: 0, minutes: 40, title: 'x' });
        expect(s.cards[0].repeat).toBe('weekly');
    });
    it('removeCard 로 지운다', () => {
        let s = base();
        s = addCard(s, { id: 'a', colKey: s.cols[0].key, start: 0, minutes: 40, title: 'x' });
        s = removeCard(s, 'a');
        expect(s.cards.length).toBe(0);
    });
    it('카드 start 는 축 밖으로 못 나간다(가둠)', () => {
        let s = base();
        const span = axisSpanMinutes(s.rows);
        s = addCard(s, { id: 'a', colKey: s.cols[0].key, start: span + 1000, minutes: 40, title: 'x' });
        expect(s.cards[0].start).toBeLessThanOrEqual(span - s.cards[0].minutes);
    });
});

describe('행 늘리면 뒤 줄이 저절로 밀림 — 🔴 파생이라 미는 코드가 없다', () => {
    it('1줄을 40→60분으로 늘리면 2줄 이후 시각이 20분씩 밀린다', () => {
        let s = base();
        const before = rowTimes(s.startTime, s.rows);
        s = resizeRow(s, s.rows[0].key, 60);
        const after = rowTimes(s.startTime, s.rows);
        expect(after[0]).toEqual({ start: '09:00', end: '10:00' });         // 바뀐 줄
        // 2줄: 전 09:50~10:30 → 후 10:10~10:50 (20분 밀림)
        expect(before[1]).toEqual({ start: '09:50', end: '10:30' });
        expect(after[1]).toEqual({ start: '10:10', end: '10:50' });
        // 끝 줄도 20분 밀렸다
        const lastB = before[before.length - 1];
        const lastA = after[after.length - 1];
        expect(lastA.start).not.toBe(lastB.start);
    });
    it('resizeRow 도 5분 스냅·최소 5분', () => {
        let s = base();
        s = resizeRow(s, s.rows[0].key, 63);
        expect(s.rows[0].minutes).toBe(65);
        s = resizeRow(s, s.rows[0].key, 1);
        expect(s.rows[0].minutes).toBe(5);
    });
});

describe('열 추가·삭제', () => {
    it('addCol 은 다음 요일 라벨로 붙는다', () => {
        let s = base();
        s = addCol(s);
        expect(s.cols.length).toBe(6);
        expect(s.cols[5].label).toBe('토');
    });
    it('removeCol 은 그 열의 카드도 같이 지운다', () => {
        let s = base();
        s = addCard(s, { colKey: s.cols[0].key, start: 0, minutes: 40, title: 'x' });
        s = addCard(s, { colKey: s.cols[1].key, start: 0, minutes: 40, title: 'y' });
        s = removeCol(s, s.cols[0].key);
        expect(s.cols.length).toBe(4);
        expect(s.cards.map((c) => c.title)).toEqual(['y']);
    });
    it('setColLabel', () => {
        let s = base();
        s = setColLabel(s, s.cols[0].key, '월요일');
        expect(s.cols[0].label).toBe('월요일');
    });
});

describe('겹침 나누기 — 한 열 안', () => {
    const mk = (id: string, start: number, minutes: number): Card =>
        ({ id, colKey: 'c', start, minutes, title: id, people: [], repeat: 'weekly' });

    it('안 겹치면 각자 폭 1(lanes 1)', () => {
        const m = columnLayout([mk('a', 0, 40), mk('b', 50, 40)]);
        expect(m.get('a')).toEqual({ lane: 0, lanes: 1 });
        expect(m.get('b')).toEqual({ lane: 0, lanes: 1 });
    });
    it('둘이 겹치면 lanes 2, lane 0·1', () => {
        const m = columnLayout([mk('a', 0, 40), mk('b', 20, 40)]);
        expect(m.get('a')!.lanes).toBe(2);
        expect(m.get('b')!.lanes).toBe(2);
        expect(new Set([m.get('a')!.lane, m.get('b')!.lane])).toEqual(new Set([0, 1]));
    });
    it('셋이 모두 겹치면 lanes 3', () => {
        const m = columnLayout([mk('a', 0, 60), mk('b', 10, 60), mk('c', 20, 60)]);
        expect(m.get('a')!.lanes).toBe(3);
        expect(m.get('c')!.lanes).toBe(3);
    });
    it('떨어진 두 덩어리는 서로 폭을 안 나눈다', () => {
        const m = columnLayout([mk('a', 0, 40), mk('b', 10, 40), mk('c', 100, 40)]);
        expect(m.get('a')!.lanes).toBe(2);
        expect(m.get('c')!.lanes).toBe(1);
    });
});

describe('눈금 적용(applyGrid) — 줄·열 갈고 카드는 분 위치로 살림', () => {
    it('수업분을 바꾸면 줄 길이가 바뀐다(축이 바뀐다)', () => {
        let s = base();
        s = applyGrid(s, { ...DEFAULT_GRID, classMinutes: 50 });
        expect(s.rows.every((r) => r.minutes === 50)).toBe(true);
    });
    it('살아남는 열의 카드는 분 위치로 남는다', () => {
        let s = base();
        s = addCard(s, { id: 'a', colKey: s.cols[0].key, start: 0, minutes: 40, title: 'x' });
        s = applyGrid(s, { ...DEFAULT_GRID, classMinutes: 50 });
        expect(s.cards.length).toBe(1);
        expect(s.cards[0].colKey).toBe(s.cols[0].key);   // index 0 → 새 열 0
        expect(s.cards[0].start).toBe(0);
    });
    it('열 수를 줄이면 없어진 열의 카드는 떨어진다', () => {
        let s = base();
        s = addCard(s, { colKey: s.cols[4].key, start: 0, minutes: 40, title: 'z' });   // 금요일(index 4)
        s = applyGrid(s, { ...DEFAULT_GRID, colCount: 3 });
        expect(s.cols.length).toBe(3);
        expect(s.cards.length).toBe(0);
    });
});
