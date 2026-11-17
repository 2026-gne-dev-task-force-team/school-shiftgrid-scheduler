// @vitest-environment jsdom
/**
 * 비밀번호 판(③ F4·F6) — 가짜 supabase 클라이언트·가짜 location/history 로 돈다(네트워크 0 · 실서버·키·URL 0 · 지어낸 이름만).
 *   F4: 8자·두 칸 검사 · 지금 비번 확인 → updateUser → signOut(others) · 재설정 메일 · 프레임 거부(호출 0 · 입력칸 0)
 *   F6: 착지 판정 · PASSWORD_RECOVERY → 새 비번 판 · 링크 한 번만 · 새 비번 8자 · 주소창 토큰 조각 지움
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect } from 'vitest';
import { classifyFailure } from '../../server-link/errors';
import { MIN_PASSWORD } from '../session';
import { createPasswordOps, isFramed, type PasswordClient } from './password';
import { createRecovery, readLanding, scrubLanding, type HistoryLike, type LocationLike } from './recovery';
import { PasswordDialogs } from './PasswordDialogs';
import { createPasswordUi } from './ui';
import { accountServerPlugin } from '../index';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const EMAIL = 'kim.gamja@example.test';
const OLD = 'correct-horse-9';
const NEW = 'battery-staple-7';

/** 가짜 Auth — 계정 하나 · 호출 기록 · 인증 사건을 손으로 쏠 수 있다. */
function fakeAuth(opts: { offline?: boolean; rateLimited?: boolean } = {}) {
    let password = OLD;
    const calls: string[] = [];
    const subs = new Set<(event: string, session: unknown) => void>();
    const netErr = () => Object.assign(new Error('Failed to fetch'), { name: 'AuthRetryableFetchError', status: 0 });
    const client: PasswordClient = {
        auth: {
            async signInWithPassword({ email, password: pw }) {
                calls.push(`signIn:${email}`);
                if (opts.offline) return { data: null, error: netErr() };
                if (email !== EMAIL || pw !== password) return { data: null, error: { name: 'AuthApiError', status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' } };
                return { data: { user: { id: 'u-1' } }, error: null };
            },
            async updateUser({ password: pw }) {
                calls.push('updateUser');
                if (opts.offline) return { data: null, error: netErr() };
                if (pw === password) return { data: null, error: { name: 'AuthApiError', status: 422, code: 'same_password', message: 'same' } };
                password = pw;
                return { data: { user: { id: 'u-1' } }, error: null };
            },
            async signOut(o) { calls.push(`signOut:${o?.scope ?? 'local'}`); return { error: null }; },
            async resetPasswordForEmail(email, o) {
                calls.push(`reset:${email}:${o?.redirectTo ?? ''}`);
                if (opts.rateLimited) return { data: null, error: { name: 'AuthApiError', status: 429, code: 'over_email_send_rate_limit', message: 'rate' } };
                return { data: {}, error: null };
            },
            onAuthStateChange(cb) {
                subs.add(cb);
                return { data: { subscription: { unsubscribe: () => { subs.delete(cb); } } } };
            },
        },
    };
    return { client, calls, password: () => password, emit: (event: string) => { for (const fn of [...subs]) fn(event, { user: { id: 'u-1' } }); }, subs };
}

function makeOps(c: PasswordClient | null, o: { framed?: boolean; email?: string | null } = {}) {
    return createPasswordOps({
        getClient: () => c,
        classify: classifyFailure,
        currentEmail: () => (o.email === undefined ? EMAIL : o.email),
        redirectTo: () => 'https://example.invalid/app/',
        isFramed: () => o.framed ?? false,
    });
}

/** 가짜 주소창 — replaceState 가 경로·조각을 갈아 끼운다. */
function fakeUrl(url: string) {
    const u = new URL(url, 'https://example.invalid');
    const loc: LocationLike = { pathname: u.pathname, search: u.search, hash: u.hash };
    const writes: string[] = [];
    const hist: HistoryLike = {
        state: null,
        replaceState(_d, _t, next) {
            writes.push(next ?? '');
            const n = new URL(next ?? '', 'https://example.invalid');
            loc.pathname = n.pathname; loc.search = n.search; loc.hash = n.hash;
        },
    };
    return { loc, hist, writes, href: () => `${loc.pathname}${loc.search}${loc.hash}` };
}

const RECOVERY_HASH = '#access_token=fake.jwt.tok&expires_in=900&refresh_token=fakeRefresh&token_type=bearer&type=recovery';

describe('F4 비번 바꾸기', () => {
    it('지금 비번 확인 → updateUser → 다른 기기 끊기(scope others) 순서', async () => {
        const f = fakeAuth();
        expect(await makeOps(f.client).changePassword(OLD, NEW, NEW)).toEqual({ ok: true });
        expect(f.calls).toEqual([`signIn:${EMAIL}`, 'updateUser', 'signOut:others']);
        expect(f.password()).toBe(NEW);
    });

    it(`새 비번 ${MIN_PASSWORD}자 미만·두 칸 다름·지금과 같음은 서버에 가기 전에 막는다`, async () => {
        const f = fakeAuth();
        const ops = makeOps(f.client);
        expect(await ops.changePassword(OLD, 'a'.repeat(MIN_PASSWORD - 1), 'a'.repeat(MIN_PASSWORD - 1))).toMatchObject({ ok: false, reason: 'short' });
        expect(await ops.changePassword(OLD, NEW, `${NEW}x`)).toMatchObject({ ok: false, reason: 'mismatch' });
        expect(await ops.changePassword(OLD, OLD, OLD)).toMatchObject({ ok: false, reason: 'same' });
        expect(f.calls).toEqual([]);
        expect((await ops.changePassword(OLD, 'a'.repeat(MIN_PASSWORD), 'a'.repeat(MIN_PASSWORD))).ok).toBe(true);
    });

    it('지금 비번이 틀리면 updateUser 를 안 부른다 · 끊김은 network', async () => {
        const f = fakeAuth();
        expect(await makeOps(f.client).changePassword('wrong-pass-1', NEW, NEW)).toMatchObject({ ok: false, reason: 'wrong-password' });
        expect(f.calls).not.toContain('updateUser');
        expect(await makeOps(fakeAuth({ offline: true }).client).changePassword(OLD, NEW, NEW)).toMatchObject({ ok: false, reason: 'network' });
    });

    it('손님·서버 미설정이면 부르지 않는다', async () => {
        const f = fakeAuth();
        expect(await makeOps(f.client, { email: null }).changePassword(OLD, NEW, NEW)).toMatchObject({ ok: false, reason: 'signed-out' });
        expect(await makeOps(null).changePassword(OLD, NEW, NEW)).toMatchObject({ ok: false, reason: 'unconfigured' });
        expect(f.calls).toEqual([]);
    });

    it('프레임 거부 — 남의 창 안이면 바꾸기·메일 둘 다 아무것도 안 부른다', async () => {
        const f = fakeAuth();
        const ops = makeOps(f.client, { framed: true });
        expect(await ops.changePassword(OLD, NEW, NEW)).toMatchObject({ ok: false, reason: 'framed' });
        expect(await ops.sendResetMail(EMAIL)).toMatchObject({ ok: false, reason: 'framed' });
        expect(f.calls).toEqual([]);
    });

    it('isFramed — top !== self 면 안 · top 읽기가 던지면(다른 출처) 안', () => {
        const self = {};
        expect(isFramed({ top: self, self })).toBe(false);
        expect(isFramed({ top: {}, self })).toBe(true);
        const crossOrigin = { self, get top(): unknown { throw new Error('SecurityError'); } };
        expect(isFramed(crossOrigin)).toBe(true);
    });
});

describe('F4 재설정 메일', () => {
    it('주소를 다듬어 redirectTo 와 함께 보낸다 · 이메일 꼴 아니면 안 보낸다', async () => {
        const f = fakeAuth();
        const ops = makeOps(f.client);
        expect(await ops.sendResetMail('not-an-email')).toMatchObject({ ok: false, reason: 'bad-email' });
        expect(f.calls).toEqual([]);
        expect(await ops.sendResetMail('  Kim.Gamja@Example.test ')).toEqual({ ok: true });
        expect(f.calls).toEqual([`reset:${EMAIL}:https://example.invalid/app/`]);
    });

    it('너무 잦으면(429) rate-limited', async () => {
        expect(await makeOps(fakeAuth({ rateLimited: true }).client).sendResetMail(EMAIL)).toMatchObject({ ok: false, reason: 'rate-limited' });
    });
});

describe('F6 재설정 링크 착지', () => {
    it('주소 판정 — 암시 흐름 recovery · 오류 조각 · 평소', () => {
        expect(readLanding({ pathname: '/', search: '', hash: RECOVERY_HASH })).toEqual({ kind: 'recovery' });
        expect(readLanding({ pathname: '/', search: '', hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid' }))
            .toEqual({ kind: 'link-error', code: 'otp_expired' });
        expect(readLanding({ pathname: '/', search: '?tab=1', hash: '#board' })).toEqual({ kind: 'none' });
    });

    it('토큰 조각만 지우고 다른 조각·경로는 남긴다', () => {
        const u = fakeUrl(`/app/?tab=1&code=pkce-fake${RECOVERY_HASH}`);
        expect(scrubLanding(u.loc, u.hist)).toBe(true);
        expect(u.href()).toBe('/app/?tab=1');
        expect(scrubLanding(u.loc, u.hist)).toBe(false);
        const v = fakeUrl('/app/#board&type=recovery');
        scrubLanding(v.loc, v.hist);
        expect(v.href()).toBe('/app/#board');
    });

    function landing(url = `/app/${RECOVERY_HASH}`, framed = false) {
        const f = fakeAuth();
        const u = fakeUrl(url);
        const r = createRecovery({ getClient: () => f.client, classify: classifyFailure, location: () => u.loc, history: () => u.hist, isFramed: () => framed });
        r.capture();
        r.attach(f.client);
        return { f, u, r };
    }

    it('PASSWORD_RECOVERY → 새 비번 판 · 주소창에서 토큰 조각이 지워진다', () => {
        const { f, u, r } = landing();
        expect(r.state()).toBe('waiting');
        expect(u.href()).toContain('access_token');      // 클라이언트가 먹기 전엔 그대로 둔다
        f.emit('PASSWORD_RECOVERY');
        expect(r.state()).toBe('ready');
        expect(u.href()).toBe('/app/');
        expect(u.writes.join()).not.toContain('fake.jwt.tok');
    });

    it(`새 비번 ${MIN_PASSWORD}자 · 두 칸 같음 → updateUser → 다른 기기 끊기`, async () => {
        const { f, r } = landing();
        f.emit('PASSWORD_RECOVERY');
        expect(await r.submit('short', 'short')).toMatchObject({ ok: false, reason: 'short' });
        expect(await r.submit(NEW, `${NEW}x`)).toMatchObject({ ok: false, reason: 'mismatch' });
        expect(f.calls).toEqual([]);
        expect(await r.submit(NEW, NEW)).toEqual({ ok: true });
        expect(f.calls).toEqual(['updateUser', 'signOut:others']);
        expect(r.state()).toBe('done');
    });

    it('링크는 한 번만 — 바꾼 뒤 다시 내면 link-used · 늦게 온 사건도 판을 다시 안 연다', async () => {
        const { f, r } = landing();
        f.emit('PASSWORD_RECOVERY');
        expect((await r.submit(NEW, NEW)).ok).toBe(true);
        expect(await r.submit('another-pass-3', 'another-pass-3')).toMatchObject({ ok: false, reason: 'link-used' });
        f.emit('PASSWORD_RECOVERY');
        expect(r.state()).toBe('done');
        expect(f.calls.filter((c) => c === 'updateUser')).toHaveLength(1);
    });

    it('겹쳐 누른 두 번째 제출은 서버에 안 간다', async () => {
        const { f, r } = landing();
        f.emit('PASSWORD_RECOVERY');
        const [a, b] = await Promise.all([r.submit(NEW, NEW), r.submit(NEW, NEW)]);
        expect([a.ok, b.ok].sort()).toEqual([false, true]);
        expect(f.calls.filter((c) => c === 'updateUser')).toHaveLength(1);
    });

    it('이미 쓴 링크로 다시 오면(otp_expired) 오류 판 · 바로 닦는다 · updateUser 0', async () => {
        const { f, u, r } = landing('/app/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
        expect(r.state()).toBe('link-error');
        expect(r.errorCode()).toBe('otp_expired');
        expect(u.href()).toBe('/app/');
        expect(await r.submit(NEW, NEW)).toMatchObject({ ok: false, reason: 'not-recovery' });
        expect(f.calls).toEqual([]);
    });

    it('사건을 놓쳐도 — 주소가 recovery 였고 세션이 서면 판을 연다 · 세션이 안 서면 오류 판', () => {
        const a = landing();
        a.r.linkChanged('loading');
        expect(a.u.href()).toContain('access_token');
        a.r.linkChanged('signed-in');
        expect(a.r.state()).toBe('ready');
        expect(a.u.href()).toBe('/app/');
        const b = landing();
        b.r.linkChanged('signed-out');
        expect(b.r.state()).toBe('link-error');
    });

    it('평소 주소면 아무 판도 안 열고 주소도 안 건드린다', () => {
        const { f, u, r } = landing('/app/?tab=1#board');
        r.linkChanged('signed-in');
        f.emit('SIGNED_IN');
        expect(r.state()).toBe('idle');
        expect(u.writes).toEqual([]);
    });

    it('프레임 거부 — 착지여도 남의 창 안이면 updateUser 안 부른다', async () => {
        const { f, r } = landing(`/app/${RECOVERY_HASH}`, true);
        f.emit('PASSWORD_RECOVERY');
        expect(await r.submit(NEW, NEW)).toMatchObject({ ok: false, reason: 'framed' });
        expect(f.calls).toEqual([]);
    });
});

describe('창 — 프레임 거부는 입력칸을 안 그린다', () => {
    function mount(framed: boolean, open: 'change' | 'reset' | 'recovery') {
        const f = fakeAuth();
        const ui = createPasswordUi();
        const u = fakeUrl(`/app/${RECOVERY_HASH}`);
        const recovery = createRecovery({ getClient: () => f.client, classify: classifyFailure, location: () => u.loc, history: () => u.hist, isFramed: () => framed });
        const slot = document.createElement('div');
        document.body.append(slot);
        const root = createRoot(slot);
        act(() => { root.render(<PasswordDialogs ui={ui} ops={makeOps(f.client, { framed })} recovery={recovery} signedIn={() => true} framed={framed} />); });
        act(() => {
            if (open === 'recovery') { recovery.capture(); recovery.attach(f.client); f.emit('PASSWORD_RECOVERY'); } else ui.open(open);
        });
        const fields = document.body.querySelectorAll('input[type="password"],input[type="email"]').length;
        const notice = document.body.querySelector('[data-pw-framed]');
        act(() => root.unmount());
        slot.remove();
        return { fields, notice };
    }

    for (const v of ['change', 'reset', 'recovery'] as const) {
        it(`${v} — 틀 밖이면 입력칸 · 틀 안이면 입력칸 0 + 안내`, () => {
            const out = mount(false, v);
            expect(out.fields).toBeGreaterThan(0);
            expect(out.notice).toBeNull();
            const inside = mount(true, v);
            expect(inside.fields).toBe(0);
            expect(inside.notice).not.toBeNull();
        });
    }
});

describe('등록 — 로컬 모드엔 무기여', () => {
    it('지금 site.config(빈 칸) — 비번 명령·창 0', () => {
        expect(accountServerPlugin.manifest.contributes?.commands ?? []).toEqual([]);
        expect(accountServerPlugin.manifest.contributes?.statusBar ?? []).toEqual([]);
    });
});
