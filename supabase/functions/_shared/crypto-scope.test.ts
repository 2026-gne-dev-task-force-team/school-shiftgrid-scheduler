import { describe, expect, it, vi } from 'vitest';
import { assertMayOpen, findPlanted, logLine, mayOpen, OPEN_SCOPE, safeLog, ScopeError, type FnName, type OpenKind } from './crypto-scope.ts';

const NAME = '심은이름-쿠키토끼';

describe('여는 범위 표', () => {
    it('parts 는 모든 조각(보관 doc@n 포함)을 열고 다른 종류는 못 연다', () => {
        for (const p of ['doc', 'doc@3', 'ops.rooms', 'ops.aux', 'ops.settings']) expect(mayOpen('parts', 'part', p)).toBe(true);
        for (const k of ['sub', 'room', 'audit', 'user', 'project'] as OpenKind[]) expect(mayOpen('parts', k)).toBe(false);
    });
    it('sub 는 그날 입력 조각만 — ops.rooms·ops.settings·보관본은 못 연다', () => {
        for (const p of ['doc', 'ops.fixed', 'ops.calendar', 'ops.changes', 'ops.classSubjects', 'ops.aux']) expect(mayOpen('sub', 'part', p)).toBe(true);
        for (const p of ['ops.rooms', 'ops.settings', 'ops.installed', 'doc@3']) expect(mayOpen('sub', 'part', p)).toBe(false);
        expect(mayOpen('sub', 'sub')).toBe(true);
        expect(mayOpen('sub', 'room')).toBe(false);
    });
    it('rooms 는 doc·ops.rooms 와 예약 행만', () => {
        expect(mayOpen('rooms', 'part', 'ops.rooms')).toBe(true);
        expect(mayOpen('rooms', 'part', 'ops.aux')).toBe(false);
        expect(mayOpen('rooms', 'room')).toBe(true);
        expect(mayOpen('rooms', 'sub')).toBe(false);
    });
    it('감사는 admin-ops(키 교체)만 연다 — 일반 함수는 쓰기만', () => {
        for (const fn of ['parts', 'sub', 'rooms', 'account', 'health'] as FnName[]) expect(mayOpen(fn, 'audit')).toBe(false);
        expect(mayOpen('admin-ops', 'audit')).toBe(true);
    });
    it('account 는 doc·계정·프로젝트 이름만 · health 는 아무것도', () => {
        expect(mayOpen('account', 'part', 'doc')).toBe(true);
        expect(mayOpen('account', 'part', 'ops.aux')).toBe(false);
        expect(mayOpen('account', 'user')).toBe(true);
        expect(mayOpen('account', 'project')).toBe(true);
        for (const k of ['part', 'sub', 'room', 'audit', 'user', 'project'] as OpenKind[]) expect(mayOpen('health', k, 'doc')).toBe(false);
    });
    it('모르는 함수·모르는 조각 이름·조각 이름 빠짐은 거부', () => {
        expect(mayOpen('nope', 'part', 'doc')).toBe(false);
        expect(mayOpen('admin-ops', 'part', NAME)).toBe(false);
        expect(mayOpen('admin-ops', 'part')).toBe(false);
        expect(mayOpen('parts', 'part', 'ops.__proto__')).toBe(false);
    });
    it('표의 함수 이름은 supabase/functions 폴더와 같다(여섯)', () => {
        expect(Object.keys(OPEN_SCOPE).sort()).toEqual(['account', 'admin-ops', 'health', 'parts', 'rooms', 'sub']);
    });
});

describe('assertMayOpen · ScopeError', () => {
    it('범위 밖이면 던지고 메시지에 함수·종류·알려진 조각 이름만', () => {
        expect(() => assertMayOpen('sub', 'part', 'doc')).not.toThrow();
        expect(() => assertMayOpen('sub', 'part', 'ops.rooms')).toThrow(ScopeError);
        try {
            assertMayOpen('sub', 'part', 'ops.rooms');
        } catch (e) {
            expect((e as Error).message).toBe('scope_denied fn=sub kind=part part=ops.rooms');
        }
    });
    it('모르는 조각 이름(사용자 입력일 수 있다)은 메시지에 싣지 않는다', () => {
        try {
            assertMayOpen('sub', 'part', NAME);
            throw new Error('던져야 한다');
        } catch (e) {
            expect(e).toBeInstanceOf(ScopeError);
            expect((e as Error).message).not.toContain('쿠키토끼');
            expect((e as Error).message).toContain('part=?');
        }
    });
});

describe('평문 0 로그', () => {
    it('안전한 꼴 값은 그대로 · 한글·공백 글은 [redacted]', () => {
        expect(logLine('decrypt_failed', { part: 'doc', n: 3, ok: false })).toBe('decrypt_failed part=doc n=3 ok=false');
        expect(logLine('x', { reason: NAME })).toBe('x reason=[redacted]');
        expect(logLine('x', { reason: 'has space' })).toBe('x reason=[redacted]');
        expect(logLine(NAME)).toBe('[redacted]');
    });
    it('객체·배열·긴 글은 꼴만', () => {
        const line = logLine('x', { o: { name: NAME }, a: [NAME, NAME], long: 'a'.repeat(65), none: null });
        expect(line).toBe('x o=[object] a=[array:2] long=[redacted] none=-');
        expect(findPlanted(line, [NAME, '쿠키토끼'])).toEqual([]);
    });
    it('키 이름에 평문이 들어와도 안 샌다', () => {
        expect(findPlanted(logLine('x', { [NAME]: 1 }), [NAME])).toEqual([]);
    });
    it('safeLog 는 console.error 에 한 줄만 보낸다', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        safeLog('decrypt_failed', { part: 'doc', why: NAME });
        expect(spy).toHaveBeenCalledExactlyOnceWith('decrypt_failed part=doc why=[redacted]');
        spy.mockRestore();
    });
    it('findPlanted 는 있는 이름만 돌려준다', () => {
        expect(findPlanted(`a ${NAME} b`, [NAME, '다른이름'])).toEqual([NAME]);
        expect(findPlanted('깨끗', [NAME])).toEqual([]);
    });
});
