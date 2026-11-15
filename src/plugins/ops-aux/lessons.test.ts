import { describe, expect, it } from 'vitest';
import type { Bundle } from '../../../shared/bundle/types.ts';
import { lessonsFromBundle } from './lessons';
import { lessonsOnOf, demoLessons } from './source';

// 가짜 학교: 1-1 반 · 1·2교시(09:00·09:50) + 점심 · 월~금 · 시간표 하나(11월)
const doc = {
    meta: { name: '가짜초', term: '', schemaVersion: 3 },
    activities: [{ id: 'a1', name: '국어' }, { id: 'a2', name: '수학' }],
    specs: [{ id: 'sp', name: '틀', cycleDays: 7, activeDays: [0, 1, 2, 3, 4], dayStart: '09:00', dayEnd: '12:00',
        slots: [
            { index: 0, label: '1교시', start: '09:00', end: '09:40', assignable: true },
            { index: 1, label: '2교시', start: '09:50', end: '10:30', assignable: true },
            { index: 2, label: '점심', start: '12:00', end: '12:40', assignable: false, kind: 'lunch' },
        ] }],
    tracks: [{ id: 't1', name: '1-1', specId: 'sp', grade: 1 }],
    timetables: [{ id: 'tt', name: '2학기', specId: 'sp', startDate: '2026-09-01', endDate: '2027-01-31', priority: 1 }],
    assignments: [{ id: 'x1', kind: 'work', timetableId: 'tt', trackId: 't1', dayIndex: 3, slotIndex: 0, activityId: 'a1' }],
};
const bundle = (calendar: unknown[] = [], changes: unknown[] = []): Bundle => ({ bundleVersion: 1, parts: { doc, calendar, changes }, versions: {} });

describe('번들 → 그날 수업 칸 변환기', () => {
    it('시간표 칸 — 목요일 1교시 국어, 점심은 빠지고, 주말은 비어 있다', () => {
        const f = lessonsFromBundle(bundle())!;
        const th = f('2026-11-19'); // 목
        expect(th.map((l) => [l.trackName, l.grade, l.startMin, l.endMin, l.subject, l.available])).toEqual([
            ['1-1', 1, 540, 580, '국어', true], ['1-1', 1, 590, 630, null, true],
        ]);
        expect(f('2026-11-21')).toEqual([]);
    });
    it('시간표 기간 밖은 비어 있다', () => {
        expect(lessonsFromBundle(bundle())!('2026-08-20')).toEqual([]);
    });
    it('변경 덮기 — 그날 그 반 N교시 과목이 바뀐다(다른 날은 그대로)', () => {
        const f = lessonsFromBundle(bundle([], [{ id: 'c', date: '2026-11-19', classKey: '1-1', period: 1, subject: '체육', note: '', createdBy: 'u' }]))!;
        expect(f('2026-11-19')[0].subject).toBe('체육');
        expect(f('2026-11-12')[0].subject).toBe('국어'); // 지난주 목요일은 그대로
        expect(f('2026-11-20')[0].subject).toBeNull(); // 금요일 칸은 비어 있다
    });
    it('학사 휴일(kind all)은 그날 수업이 통째로 빠진다 — 행사(event)는 안 빠진다', () => {
        const f = lessonsFromBundle(bundle([
            { id: 'e1', date: '2026-11-16', endDate: '2026-11-16', kind: 'all', title: '개교기념일' },
            { id: 'e2', date: '2026-11-17', endDate: '2026-11-17', kind: 'event', title: '행사' },
        ]))!;
        expect(f('2026-11-16')).toEqual([]);
        expect(f('2026-11-17')).toHaveLength(2);
    });
    it('번들·시간표가 없으면 null → lessonsOnOf 가 demo 로 떨어진다', () => {
        expect(lessonsFromBundle(null)).toBeNull();
        expect(lessonsFromBundle({ bundleVersion: 1, parts: {}, versions: {} })).toBeNull();
        expect(lessonsOnOf(null)).toBe(demoLessons);
        expect(lessonsOnOf(bundle())).not.toBe(demoLessons);
    });
});
