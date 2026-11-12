import { describe, expect, it } from 'vitest';
import type { Op } from '../../server-link/replay';
import { addChange, addEvent, applyDaysOps, delChange, delEvent, editChange, editEvent } from './ops';
import { demoDays } from './source';
import type { CalendarEvent, DaysRole, TimetableChange } from './types';

const ev: CalendarEvent = { id: 'e9', date: '2026-12-01', endDate: '2026-12-01', kind: 'event', title: '가짜 행사' };
const mine: TimetableChange = { id: 'c9', date: '2026-12-02', classKey: '1-1', period: 2, subject: '음악', note: '', createdBy: 'u-a' };
const others: TimetableChange = { ...mine, id: 'c8', createdBy: 'u-b' };
const server = () => { const d = demoDays(); d.changes.push({ ...others }); return d; };
const ok = (role: DaysRole, op: Op) => applyDaysOps({ userId: 'u-a', role }, server(), [op]).errors.length === 0;

describe('권한표 — 교사는 changes 의 add·del(자기 것)만', () => {
    // 행 = 조작, 열 = 교사 · 근태담당 · 교무 · 교감 · 관리자
    const rows: [string, Op, boolean, boolean][] = [
        ['변경 add(내 이름)', addChange(mine), true, true],
        ['변경 add(남 이름)', addChange({ ...mine, id: 'c7', createdBy: 'u-b' }), false, true],
        ['변경 del(내 것 c1)', delChange('c1'), true, true],
        ['변경 del(남 것 c8)', delChange('c8'), false, true],
        ['변경 set', editChange({ ...demoDays().changes[0] }, { ...demoDays().changes[0], subject: '국어' }), false, true],
        ['일정 add', addEvent(ev), false, true],
        ['일정 set', editEvent(demoDays().calendar[0], { ...demoDays().calendar[0], title: '바꿈' }), false, true],
        ['일정 del', delEvent('e1'), false, true],
    ];
    it.each(rows)('%s → 교사 %s / 관리 역할 %s', (_n, op, teacher, manager) => {
        expect(ok('교사', op)).toBe(teacher);
        for (const r of ['근태담당', '교무', '교감', '관리자'] as DaysRole[]) expect(ok(r, op)).toBe(manager);
    });
    it('같은 큐에서 add 한 것은 바로 자기 것으로 지운다', () => {
        expect(applyDaysOps({ userId: 'u-a', role: '교사' }, server(), [addChange(mine), delChange('c9')]).errors).toEqual([]);
    });
});

describe('재생 · 칸 규칙', () => {
    it('같은 조작을 두 번 재생해도 결과가 같다(멱등)', () => {
        const v = { userId: 'u-a', role: '교무' as const };
        const once = applyDaysOps(v, server(), [addEvent(ev), delEvent('e1')]);
        const twice = applyDaysOps(v, once.next, [addEvent(ev), delEvent('e1')]);
        expect(twice.next).toEqual(once.next);
        expect(twice.replayed.skipped).toHaveLength(2);
    });
    it('서버가 바뀌어 set 이 어긋나면 충돌 오류', () => {
        const v = { userId: 'u-a', role: '교무' as const };
        const base = demoDays().calendar[0];
        const s = demoDays(); s.calendar[0] = { ...base, title: '서버가 먼저 바꿈' };
        expect(applyDaysOps(v, s, [editEvent(base, { ...base, title: '내 값' })]).errors[0]).toContain('충돌');
    });
    it('칸 규칙: 끝 날짜가 앞서거나 교시가 범위 밖이면 막는다', () => {
        const v = { userId: 'u-a', role: '관리자' as const };
        expect(applyDaysOps(v, demoDays(), [addEvent({ ...ev, endDate: '2026-11-30' })]).errors[0]).toContain('끝 날짜');
        expect(applyDaysOps(v, demoDays(), [addChange({ ...mine, period: 11 })]).errors[0]).toContain('교시');
    });
});
