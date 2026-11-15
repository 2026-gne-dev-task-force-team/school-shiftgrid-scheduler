import { describe, expect, it } from 'vitest';
import { addDay, addExc, applyAuxOps, closeMonth, delExc, editExc, reopenMonth } from '../ops';
import { demoAux, demoLessons } from '../source';
import type { AuxException, AuxPart, AuxRole } from '../types';
import { judgeAuxChange } from './judge';
import { monthTotals } from './total';

const exc = (o: Partial<AuxException> = {}): AuxException => ({ id: 'e1', staffId: 's1', date: '2026-10-15', kind: '결근', amount: -60, note: '', ...o });
const run = (role: AuxRole, server: AuxPart, ops: Parameters<typeof applyAuxOps>[2]) => applyAuxOps({ userId: 'u', role }, server, ops, demoLessons);
const closed = (): AuxPart => { const s = demoAux(); s.exceptions.push(exc()); s.monthClose.push({ id: 's1:2026-10', staffId: 's1', ym: '2026-10' }); return s; };

describe('마감', () => {
    it('마감 전에는 예외를 지울 수 있고, 마감하면 10-15 결근 지우기·고치기는 409', () => {
        const open = demoAux(); open.exceptions.push(exc());
        expect(run('근태담당', open, [delExc('e1')]).errors).toEqual([]);
        const c = run('근태담당', open, [closeMonth({ id: 's1:2026-10', staffId: 's1', ym: '2026-10' })]);
        expect(c.errors).toEqual([]);
        const del = run('근태담당', c.next, [delExc('e1')]);
        expect(del.status).toBe(409);
        expect(run('근태담당', c.next, [editExc(exc(), exc({ amount: -30 }))]).status).toBe(409);
    });
    it('정정 −1 은 들어가고 합계에 「정정 후」가 따로 보인다', () => {
        const out = run('근태담당', closed(), [addExc(exc({ id: 'e2', kind: '정정', amount: -1, note: '시간 오기' }))]);
        expect(out.errors).toEqual([]);
        const t = monthTotals(out.next, '2026-10')[0];
        expect([t.exceptions, t.correction, t.before, t.after, t.closed]).toEqual([-60, -1, t.work - 60, t.work - 61, true]);
    });
    it('마감 달의 결근 추가·날짜별 배정 추가는 409, 다른 달·다른 보조는 통과', () => {
        expect(run('근태담당', closed(), [addExc(exc({ id: 'e3' }))]).status).toBe(409);
        expect(run('근태담당', closed(), [addDay({ id: 'd', staffId: 's1', date: '2026-10-15', startMin: 540, endMin: 580, classKey: '1-1', source: 'manual' })]).status).toBe(409);
        expect(run('근태담당', closed(), [addExc(exc({ id: 'e4', date: '2026-11-02' }))]).errors).toEqual([]);
        expect(run('근태담당', closed(), [addExc(exc({ id: 'e5', staffId: 's2' }))]).errors).toEqual([]);
    });
    it('정정은 사유 필수', () => {
        expect(run('근태담당', closed(), [addExc(exc({ id: 'e2', kind: '정정', amount: -1, note: ' ' }))]).errors[0]).toContain('사유');
    });
});

describe('마감 해제 권한', () => {
    it('관리자만 해제 · 근태담당은 403 · 교사는 403', () => {
        expect(run('근태담당', closed(), [reopenMonth('s1:2026-10')]).status).toBe(403);
        expect(run('교사', closed(), [reopenMonth('s1:2026-10')]).status).toBe(403);
        const ok = run('관리자', closed(), [reopenMonth('s1:2026-10')]);
        expect(ok.errors).toEqual([]);
        expect(ok.next.monthClose).toHaveLength(0);
    });
    it('관리자는 해제 말고는 못 고친다', () => {
        expect(run('관리자', closed(), [addExc(exc({ id: 'e6', date: '2026-11-02' }))]).status).toBe(403);
    });
    it('순수 함수: 차이 없으면 ok · 비관리자 해제는 403', () => {
        const s = closed();
        expect(judgeAuxChange(s, s, '근태담당')).toEqual({ ok: true });
        expect(judgeAuxChange(s, { ...s, monthClose: [] }, '근태담당')).toMatchObject({ ok: false, status: 403 });
        expect(judgeAuxChange(s, { ...s, monthClose: [] }, '관리자')).toEqual({ ok: true });
    });
});

describe('월 합계', () => {
    it('근무 양(기본 배정 40분 × 10월 목요일 5번) + 예외 합', () => {
        const s = demoAux(); s.exceptions.push(exc({ date: '2026-10-08', amount: -20 }), exc({ id: 'e2', kind: '추가', amount: 30, date: '2026-10-09' }));
        const t = monthTotals(s, '2026-10');
        expect(t[0]).toMatchObject({ work: 200, exceptions: 10, correction: 0, before: 210, after: 210, closed: false });
        expect(t[1].work).toBe(0);
    });
});
