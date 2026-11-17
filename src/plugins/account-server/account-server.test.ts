/**
 * account-server(③ F2) — 가짜 supabase 클라이언트로 돈다(네트워크 0 · 실서버·키·URL 0 · 지어낸 이름만).
 *   로그인 성공·실패(틀린 비번·네트워크·잠듦) · 초대 코드 가입 → 곧바로 로그인 · identity 약속 꼴 · 로컬 모드 무기여.
 */
import { describe, it, expect, vi } from 'vitest';
import { createAccountServer, FIELD, MIN_PASSWORD, PASSWORD_METHOD, type AuthClient, type AuthUser } from './session';
import type { Failure } from '../server-link/contracts/server-link';
import { accountServerPlugin, isServerMode } from './index';
import type { CurrentUser } from '../account/contracts/identity';

const PW = 'correct-horse-9';

/** 가짜 서버 — 계정 표·초대 코드 표·me 응답. 호출 기록을 남긴다. */
function fakeServer(opts: { offline?: boolean; sleeping?: boolean } = {}) {
    const users = new Map<string, { id: string; password: string }>([['kim.gamja@example.test', { id: 'u-1', password: PW }]]);
    const invites = new Map<string, { projectId: string; roles: string[]; personRef: string | null; used: boolean }>([
        ['ABCD2345EFGH', { projectId: 'p-1', roles: ['교사'], personRef: 'homeroom:3-2', used: false }],
    ]);
    const members = new Map<string, { id: string; name: string; roles: string[]; personRef: string | null }[]>([
        ['u-1', [{ id: 'p-1', name: '가상중학교', roles: ['관리자'], personRef: 'user:u-1' }]],
    ]);
    const calls: string[] = [];
    let signedIn: AuthUser | null = null;
    const netErr = () => Object.assign(new Error('Failed to fetch'), { name: 'AuthRetryableFetchError', status: 0 });
    const httpErr = (status: number, code: string) => ({
        name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code',
        context: { status, json: async () => ({ error: { code, message: code } }) },
    });

    const client: AuthClient = {
        auth: {
            async signInWithPassword({ email, password }) {
                calls.push(`signIn:${email}`);
                if (opts.offline) return { data: { user: null, session: null }, error: netErr() };
                if (opts.sleeping) return { data: { user: null, session: null }, error: { name: 'AuthApiError', status: 503, message: 'unavailable' } };
                const u = users.get(email);
                if (!u || u.password !== password) {
                    return { data: { user: null, session: null }, error: { name: 'AuthApiError', status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' } };
                }
                signedIn = { id: u.id, email };
                return { data: { user: signedIn, session: { access_token: 'fake' } }, error: null };
            },
            async signOut() { calls.push('signOut'); signedIn = null; return { error: null }; },
            async getSession() { return { data: { session: signedIn ? { user: signedIn } : null } }; },
        },
        functions: {
            async invoke(name, o) {
                calls.push(`fn:${name}`);
                if (opts.offline) throw Object.assign(new TypeError('Failed to fetch'), { name: 'FunctionsFetchError' });
                if (name === 'account/me') {
                    if (!signedIn) return { data: null, error: httpErr(401, 'unauthorized') };
                    return { data: { userId: signedIn.id, projects: members.get(signedIn.id) ?? [] }, error: null };
                }
                if (name === 'account/signup') {
                    const b = o.body as { inviteCode: string; email: string; password: string };
                    const inv = invites.get(b.inviteCode);
                    if (!inv) return { data: null, error: httpErr(400, 'invalid_invite') };
                    if (inv.used) return { data: null, error: httpErr(409, 'invite_used') };
                    if (users.has(b.email)) return { data: null, error: httpErr(409, 'email_taken') };
                    inv.used = true;
                    const id = `u-${users.size + 1}`;
                    users.set(b.email, { id, password: b.password });
                    members.set(id, [{ id: inv.projectId, name: '가상중학교', roles: inv.roles, personRef: inv.personRef }]);
                    return { data: { userId: id, projectId: inv.projectId, roles: inv.roles }, error: null };
                }
                return { data: null, error: httpErr(404, 'not_found') };
            },
        },
    };
    return { client, calls, users, invites };
}

/** server-link classify 의 대역 — 같은 네 갈래(값 import 는 꾸러미 경계 위반이라 테스트도 대역을 쓴다). */
function classifyFailure(e: unknown): Failure {
    const r = (e ?? {}) as { status?: number; code?: string; message?: string; context?: { status?: number } };
    const status = r.status ?? r.context?.status;
    if (status === 401) return { kind: 'unauthorized', status };
    if (status === 503) return { kind: 'sleeping', status };
    if (!status) return { kind: 'network', message: r.message };
    return { kind: 'server', status, code: r.code, message: r.message };
}

function make(client: AuthClient | null) {
    return createAccountServer({ getClient: () => client, classify: classifyFailure });
}

/** identity 0.2 CurrentUser 꼴 — 로컬 account 와 같은 칸·같은 타입. */
function expectIdentityShape(u: CurrentUser) {
    expect(['guest', 'user']).toContain(u.kind);   // 🔴 서버 모드에서 master 없음
    expect(typeof u.displayName).toBe('string');
    expect(typeof u.verified).toBe('boolean');
    expect(Array.isArray(u.roles)).toBe(true);
    expect(u.roles.every((r) => typeof r === 'string')).toBe(true);
    if (u.kind === 'user') expect(typeof u.id).toBe('string');
    else expect(u.id).toBeUndefined();
    if (u.fields !== undefined) for (const k of Object.keys(u.fields)) expect(k.startsWith('account-server.')).toBe(true);
}

describe('identity 약속 꼴', () => {
    it('로그인 전은 손님 — 항상 객체 · master 아님 · 권한 0', () => {
        const s = make(fakeServer().client);
        const u = s.current();
        expectIdentityShape(u);
        expect(u).toMatchObject({ kind: 'guest', verified: false, roles: [] });
        expect(s.can('account.users.view')).toBe(false);
    });

    it('로그인 뒤 user + 지금 프로젝트의 roles·fields(이메일·personRef)', async () => {
        const s = make(fakeServer().client);
        const r = await s.signIn(' Kim.Gamja@example.test ', PW);
        expect(r.ok).toBe(true);
        const u = s.current();
        expectIdentityShape(u);
        expect(u).toMatchObject({ kind: 'user', id: 'u-1', verified: true, roles: ['관리자'], displayName: 'kim.gamja@example.test' });
        expect(u.fields).toMatchObject({ [FIELD.email]: 'kim.gamja@example.test', [FIELD.projectId]: 'p-1', [FIELD.personRef]: 'user:u-1' });
        expect(s.can('anything.view')).toBe(true);
    });

    it('credential — 방법 하나 · 지금 그 사람으로 로그인했을 때만 통과', async () => {
        const s = make(fakeServer().client);
        expect(s.methods()).toEqual([PASSWORD_METHOD]);
        expect(await s.challenge(PASSWORD_METHOD.id, 'u-1')).toBe(false);
        await s.signIn('kim.gamja@example.test', PW);
        expect(await s.challenge(PASSWORD_METHOD.id, 'u-1')).toBe(true);
        expect(await s.challenge(PASSWORD_METHOD.id, 'u-9')).toBe(false);
    });
});

describe('로그인', () => {
    it('성공하면 신분 바뀜 알림이 울린다 · 로그아웃하면 손님으로', async () => {
        const f = fakeServer();
        const s = make(f.client);
        const fn = vi.fn();
        s.onIdentityChange(fn);
        await s.signIn('kim.gamja@example.test', PW);
        expect(fn).toHaveBeenCalledTimes(1);
        await s.signOut();
        expect(s.current().kind).toBe('guest');
        expect(fn).toHaveBeenCalledTimes(2);
        expect(f.calls).toContain('signOut');
    });

    it('틀린 비번 → wrong-password · 손님 그대로', async () => {
        const s = make(fakeServer().client);
        const r = await s.signIn('kim.gamja@example.test', 'nope-nope');
        expect(r).toMatchObject({ ok: false, reason: 'wrong-password' });
        expect(s.current().kind).toBe('guest');
    });

    it('네트워크 끊김 → network · 서버 잠듦 → sleeping', async () => {
        expect(await make(fakeServer({ offline: true }).client).signIn('kim.gamja@example.test', PW)).toMatchObject({ ok: false, reason: 'network' });
        expect(await make(fakeServer({ sleeping: true }).client).signIn('kim.gamja@example.test', PW)).toMatchObject({ ok: false, reason: 'sleeping' });
    });

    it('서버 미설정(클라이언트 없음) → unconfigured · 아무것도 안 부른다', async () => {
        const s = make(null);
        expect(await s.signIn('kim.gamja@example.test', PW)).toMatchObject({ ok: false, reason: 'unconfigured' });
        expect(await s.signUp('ABCD2345EFGH', 'a@example.test', PW)).toMatchObject({ ok: false, reason: 'unconfigured' });
    });

    it('새로고침 복원 — server-link 가 signed-in 을 알리면 세션에서 사람을 읽고, signed-out 이면 손님', async () => {
        const f = fakeServer();
        await f.client.auth.signInWithPassword({ email: 'kim.gamja@example.test', password: PW });   // 이전 세션이 남아 있다
        const s = make(f.client);
        await s.linkChanged('signed-in');
        expect(s.current()).toMatchObject({ kind: 'user', id: 'u-1', roles: ['관리자'] });
        await s.linkChanged('signed-out');
        expect(s.current().kind).toBe('guest');
    });
});

describe('초대 코드 가입', () => {
    it('가입하면 곧바로 로그인 상태 — signup 함수 뒤 signInWithPassword · 초대의 역할·personRef', async () => {
        const f = fakeServer();
        const s = make(f.client);
        const r = await s.signUp(' ABCD2345EFGH ', 'Park.Haneul@example.test', PW);
        expect(r.ok).toBe(true);
        expect(f.calls.slice(0, 2)).toEqual(['fn:account/signup', 'signIn:park.haneul@example.test']);
        const u = s.current();
        expectIdentityShape(u);
        expect(u).toMatchObject({ kind: 'user', id: 'u-2', roles: ['교사'], fields: { [FIELD.personRef]: 'homeroom:3-2' } });
    });

    it('함수 오류 code 를 갈래로 — 틀린 코드·쓰인 코드·겹친 이메일', async () => {
        const f = fakeServer();
        const s = make(f.client);
        expect(await s.signUp('WRONGCODE000', 'a@example.test', PW)).toMatchObject({ ok: false, reason: 'invalid-invite' });
        expect(await s.signUp('ABCD2345EFGH', 'kim.gamja@example.test', PW)).toMatchObject({ ok: false, reason: 'email-taken' });
        expect((await s.signUp('ABCD2345EFGH', 'b@example.test', PW)).ok).toBe(true);
        await s.signOut();
        expect(await s.signUp('ABCD2345EFGH', 'c@example.test', PW)).toMatchObject({ ok: false, reason: 'invite-used' });
    });

    it(`비번 ${MIN_PASSWORD}자 미만·빈 코드는 함수를 부르기 전에 막는다`, async () => {
        const f = fakeServer();
        const s = make(f.client);
        expect(await s.signUp('ABCD2345EFGH', 'a@example.test', 'short')).toMatchObject({ ok: false, reason: 'weak-password' });
        expect(await s.signUp('  ', 'a@example.test', PW)).toMatchObject({ ok: false, reason: 'invalid-invite' });
        expect(f.calls).toEqual([]);
    });

    it('네트워크 끊김 → network', async () => {
        expect(await make(fakeServer({ offline: true }).client).signUp('ABCD2345EFGH', 'a@example.test', PW)).toMatchObject({ ok: false, reason: 'network' });
    });
});

describe('등록 — 로컬 모드엔 무기여', () => {
    it('서버 모드 판정은 주소·키 둘 다 있을 때만', () => {
        expect(isServerMode({ supabaseUrl: '', anonKey: '' })).toBe(false);
        expect(isServerMode({ supabaseUrl: 'https://example.invalid', anonKey: ' ' })).toBe(false);
        expect(isServerMode({ supabaseUrl: 'https://example.invalid', anonKey: 'k' })).toBe(true);
    });

    it('지금 site.config(빈 칸) — provides·화면 기여 0 이라 로컬 account 가 약속을 채운다', () => {
        expect(accountServerPlugin.manifest.provides ?? {}).toEqual({});
        expect(accountServerPlugin.manifest.contributes?.statusBar ?? []).toEqual([]);
        expect(accountServerPlugin.manifest.requires).toEqual({ 'server-link': '^0.1' });
    });
});
