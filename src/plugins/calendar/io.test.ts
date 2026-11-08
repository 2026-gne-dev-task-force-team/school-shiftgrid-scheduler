/**
 * 가져오기·내보내기 순수 변환 — itemToSpec·planImport(UID 중복)·eventToIcs.
 */
import { describe, it, expect } from 'vitest';
import { itemToSpec, planImport, eventToIcs } from './io';
import type { CalendarItem } from './contracts/calendar';
import { parseLocal } from './events';

const item = (over: Partial<CalendarItem> = {}): CalendarItem => ({
    id: 'u1', title: '회의', start: '2026-06-01T09:00', end: '2026-06-01T10:00', allDay: false, ...over,
});

describe('itemToSpec — CalendarItem → 노드 name+data', () => {
    it('이름·메모·allDay·uid 를 옮긴다', () => {
        const s = itemToSpec(item({ memo: '쪽지' }));
        expect(s.name).toBe('회의');
        expect(s.data.allDay).toBe(false);
        expect(s.data.memo).toBe('쪽지');
        expect(s.data.uid).toBe('u1');
    });
    it('종일 날짜 문자열을 저장 꼴(자정 포함)로 정규화한다', () => {
        const s = itemToSpec(item({ id: 'd', allDay: true, start: '2026-06-01', end: '2026-06-02' }));
        expect(parseLocal(s.data.start).getTime()).toBe(parseLocal('2026-06-01').getTime());
        expect(parseLocal(s.data.end).getTime()).toBe(parseLocal('2026-06-02').getTime());
    });
});

describe('planImport — UID 중복 거르기(쥔님 2026-11-08)', () => {
    it('저장소에 이미 있는 UID 는 건너뛴다', () => {
        const r = planImport(['u1'], [item(), item({ id: 'u2', title: '새것' })]);
        expect(r.specs.map((s) => s.name)).toEqual(['새것']);
        expect(r.skipped).toBe(1);
    });
    it('같은 묶음 안 중복(같은 UID)도 한 번만', () => {
        const r = planImport([], [item(), item()]);
        expect(r.specs.length).toBe(1);
        expect(r.skipped).toBe(1);
    });
    it('UID 없는 항목은 못 거르고 늘 들인다', () => {
        const r = planImport([], [item({ id: '' }), item({ id: '' })]);
        expect(r.specs.length).toBe(2);
        expect(r.skipped).toBe(0);
    });
});

describe('eventToIcs — 노드 → 작성기 입력', () => {
    it('가져온 일정은 원본 UID, 아니면 노드 id', () => {
        expect(eventToIcs({ id: 'n1', name: 'A', data: { start: 's', end: 'e', allDay: false, uid: 'orig' } }).uid).toBe('orig');
        expect(eventToIcs({ id: 'n1', name: 'A', data: { start: 's', end: 'e', allDay: false } }).uid).toBe('n1');
    });
});
