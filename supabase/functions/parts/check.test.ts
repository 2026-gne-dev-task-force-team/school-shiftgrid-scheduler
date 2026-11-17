import { describe, expect, it } from 'vitest';
import { HttpError } from '../_shared/errors.ts';
import { checkPart, shapeRules } from './check.ts';
import type { Role } from '../../../shared/roles.ts';

const ch = (id: string, over: object = {}) => ({ id, date: '2026-03-02', trackName: '1-1', period: 3, ...over });
const run = (part: string, roles: Role[], next: unknown, prev: unknown | null) =>
    checkPart({ part, roles, next: { fmt: 1, body: next }, prev: prev === null ? null : { fmt: 1, body: prev } });
const code = (f: () => unknown) => {
    try {
        f();
    } catch (e) {
        return e instanceof HttpError ? `${e.status} ${e.code}` : 'other';
    }
    return 'none';
};

describe('꼴', () => {
    it('칸 경로를 돌려준다', () => {
        expect(shapeRules('ops.changes', [ch('a'), ch('b', { date: 5 })])).toEqual(['ops.changes[1].date']);
        expect(shapeRules('ops.changes', {})).toEqual(['ops.changes']);
        expect(shapeRules('ops.changes', [ch('a'), ch('a')])).toEqual(['ops.changes[1].id']);
        expect(shapeRules('ops.changes', [ch('a', { period: null })])).toEqual([]);
        expect(shapeRules('ops.aux', { monthClose: [{ id: 's:2026-03', staffId: 's', ym: '2026-3' }] })).toEqual(['ops.aux.monthClose[0].ym']);
        expect(shapeRules('ops.aux', { day: 1 })).toEqual(['ops.aux.day']);
        expect(shapeRules('doc', 'x')).toEqual([]);
    });
    it('꼴이 틀리면 차이는 보지 않는다', () => {
        expect(run('ops.changes', ['교사'], [{ id: 'a' }], [ch('a')])).toEqual(['ops.changes[0].date']);
    });
});

describe('ops.changes 차이', () => {
    const prev = [ch('a'), ch('b')];
    it('교사: 추가·삭제는 통과', () => {
        expect(run('ops.changes', ['교사'], [ch('a'), ch('b'), ch('c')], prev)).toEqual([]);
        expect(run('ops.changes', ['교사'], [ch('a')], prev)).toEqual([]);
    });
    it('교사: 기존 줄 수정은 403', () => {
        expect(code(() => run('ops.changes', ['교사'], [ch('a', { period: 4 }), ch('b')], prev))).toBe('403 changes_edit_forbidden');
    });
    it('교사 겸 교무·관리자는 수정 가능 · 첫 판은 통과', () => {
        expect(run('ops.changes', ['교사', '교무'], [ch('a', { period: 4 })], prev)).toEqual([]);
        expect(run('ops.changes', ['관리자'], [ch('a', { period: 4 })], prev)).toEqual([]);
        expect(run('ops.changes', ['교사'], [ch('a')], null)).toEqual([]);
    });
});

describe('ops.aux 마감', () => {
    const mc = (id: string, ym = '2026-03') => ({ id, staffId: id.split(':')[0], ym });
    const prev = { monthClose: [mc('s1:2026-03')] };
    it('근태담당: 마감 추가는 되고 해제·수정은 403', () => {
        expect(run('ops.aux', ['근태담당'], { monthClose: [mc('s1:2026-03'), mc('s2:2026-03')] }, prev)).toEqual([]);
        expect(code(() => run('ops.aux', ['근태담당'], { monthClose: [] }, prev))).toBe('403 month_close_admin_only');
        expect(code(() => run('ops.aux', ['근태담당'], { monthClose: [mc('s1:2026-03', '2026-04')] }, prev))).toBe('403 month_close_admin_only');
    });
    it('관리자는 해제 가능', () => {
        expect(run('ops.aux', ['관리자'], { monthClose: [] }, prev)).toEqual([]);
    });
});
