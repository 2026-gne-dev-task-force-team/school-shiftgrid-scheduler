import { describe, expect, it } from 'vitest';
import type { Op } from '../../server-link/replay';
import { addBase, addCondition, addDay, addStaff, applyAuxOps, deactivateStaff, delDay, editStaff, effectiveOn, judgeDay, reassignNeededCount } from './ops';
import { demoAux, demoLessons } from './source';
import type { AuxDay, AuxRole, AuxStaff } from './types';

// 2026-11-19 = 목요일. 3-2 는 그날 체험학습(수업 없음), 1-1 은 정상.
const D = '2026-11-19';
const day = (o: Partial<AuxDay> = {}): AuxDay => ({ id: 'd1', staffId: 's1', date: D, startMin: 540, endMin: 580, classKey: '1-1', source: 'manual', ...o });
const staff: AuxStaff = { id: 's9', name: '강사09', kind: '한국어', unit: 'period', active: true, allowedActivities: [], targetTracks: [] };
const run = (role: AuxRole, ops: Op[], server = demoAux()) => applyAuxOps({ userId: 'u-a', role }, server, ops, demoLessons);

describe('권한 — 근태담당만', () => {
    const ops: [string, Op][] = [['명부 add', addStaff(staff)], ['날짜별 add', addDay(day())], ['기본 add', addBase({ id: 'b9', staffId: 's1', dow: 0, startMin: 540, endMin: 580, classKey: '1-1' })]];
    it.each(ops)('%s', (_n, op) => {
        expect(run('근태담당', [op]).errors).toEqual([]);
        for (const r of ['교사', '교무', '교감', '관리자'] as AuxRole[]) expect(run(r, [op]).errors[0]).toContain('근태담당만');
    });
});

describe('날짜별 배정 판정(엔진 연결)', () => {
    it('수업 없는 칸(체험학습)·허용 교과 밖·근무 밖·다른 보조 겹침은 거부', () => {
        expect(run('근태담당', [addDay(day({ classKey: '3-2' }))]).errors[0]).toContain('재배정 필요');
        const s = demoAux(); s.staff[0].allowedActivities = ['체육'];
        expect(run('근태담당', [addDay(day())], s).errors[0]).toContain('허용 교과');
        expect(run('근태담당', [addDay(day({ startMin: 660, endMin: 700 }))]).errors[0]).toContain('수업이 없음');
        const out = run('근태담당', [addDay(day({ startMin: 590, endMin: 630 }))]);
        expect(out.errors).toEqual([]);
        const two = demoAux(); two.day.push(day({ id: 'dx', staffId: 's2', startMin: 590, endMin: 630 }));
        expect(run('근태담당', [addDay(day({ startMin: 590, endMin: 630 }))], two).errors[0]).toContain('다른 보조 인력');
    });
    it('근무 시간대 밖(시각 단위)은 거부, 교시 단위는 보지 않는다', () => {
        const s = demoAux(); s.conditions[0].workEndMin = 560;
        expect(run('근태담당', [addDay(day())], s).errors[0]).toContain('근무 시간대 밖');
        expect(run('근태담당', [addDay(day({ id: 'd2', staffId: 's2', startMin: 590, endMin: 630 }))]).errors).toEqual([]);
    });
    it('명부에 없는 보조 · 시각 거꾸로는 칸 규칙에서 막힌다', () => {
        expect(run('근태담당', [addDay(day({ staffId: 'zz' }))]).errors[0]).toContain('명부에 없습니다');
        expect(run('근태담당', [addDay(day({ endMin: 500 }))]).errors[0]).toContain('종료');
    });
    it('반이 빈 줄(지원 불가)은 엔진을 건너뛰고 들어간다', () => {
        expect(run('근태담당', [addDay(day({ classKey: '', source: 'none' }))]).errors).toEqual([]);
    });
});

describe('명부 · 기본 배정 · 날짜별 덮기', () => {
    it('비활성은 지우지 않고 쉬게 한다 — 기본 배정에서도 빠진다', () => {
        const s = demoAux();
        expect(effectiveOn(s, D)).toHaveLength(1);
        const out = run('근태담당', [deactivateStaff(s.staff[0])]);
        expect(out.next.staff[0].active).toBe(false);
        expect(out.next.staff).toHaveLength(2);
        expect(effectiveOn(out.next, D)).toHaveLength(0);
    });
    it('날짜별 줄이 같은 보조·시작의 기본 배정을 덮는다', () => {
        const s = demoAux(); s.day.push(day({ classKey: '' }));
        expect(effectiveOn(s, D)).toHaveLength(0);
        s.day[0].classKey = '1-1'; s.day[0].startMin = 540;
        expect(effectiveOn(s, D)).toHaveLength(1);
        expect(effectiveOn(s, '2026-11-20')).toHaveLength(0);
    });
    it('같은 조작을 두 번 재생해도 결과가 같다(멱등) · 이름 비면 막는다', () => {
        const once = run('근태담당', [addStaff(staff), addCondition({ id: 's9:0', staffId: 's9', dow: 0, workStartMin: null, workEndMin: null, periods: 3 })]);
        expect(run('근태담당', [addStaff(staff)], once.next).next).toEqual(once.next);
        expect(run('근태담당', [addStaff({ ...staff, id: 's8', name: ' ' })]).errors[0]).toContain('이름');
        expect(run('근태담당', [editStaff(demoAux().staff[0], { ...demoAux().staff[0], name: '강사01b' })]).errors).toEqual([]);
        expect(run('근태담당', [delDay('없음')]).errors).toEqual([]);
    });
});

describe('재배정 필요 배지(14일)', () => {
    it('기본 배정이 어긋나는 날만 센다 — 수업 바뀜(체험학습)으로 걸린다', () => {
        const s = demoAux(); s.base[0].classKey = '3-2'; // 목요일마다 3-2
        // 11-15(일)부터 14일: 목 11-19 · 11-26 → 11-19 만 3-2 체험학습
        expect(reassignNeededCount(s, '2026-11-15', demoLessons)).toBe(1);
        expect(judgeDay(s, D, demoLessons(D))[0].reason).toBe('체험학습');
    });
    it('14일 밖은 세지 않고, 정상 배정은 0', () => {
        const s = demoAux(); s.base[0].classKey = '3-2';
        expect(reassignNeededCount(s, '2026-11-20', demoLessons)).toBe(0);
        expect(reassignNeededCount(demoAux(), '2026-11-15', demoLessons)).toBe(0);
    });
    it('14일째까지만 센다 — 18일 뒤 목요일(12-03) 수업 없음은 밖', () => {
        const lessons = (d: string) => (d >= '2026-12-03' ? [] : demoLessons(d));
        expect(reassignNeededCount(demoAux(), '2026-11-15', lessons)).toBe(0);
        expect(reassignNeededCount(demoAux(), '2026-11-20', lessons)).toBe(1);
    });
    it('날짜별로 다른 반에 재배정하면 건수가 줄어든다', () => {
        const s = demoAux(); s.base[0].classKey = '3-2';
        s.day.push(day({ classKey: '1-1', source: 'reassign' }));
        expect(reassignNeededCount(s, '2026-11-15', demoLessons)).toBe(0);
    });
});
