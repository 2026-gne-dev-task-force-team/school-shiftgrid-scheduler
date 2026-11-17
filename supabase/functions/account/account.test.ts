import { describe, expect, it } from 'vitest';
import { aadProject } from '../_shared/crypto/aad.ts';
import { openText, sealText, type Bytes, type KeyRing } from '../_shared/crypto/envelope.ts';
import { buildKeyRing, parseKeys } from '../_shared/crypto/keys.ts';
import {
    accountHandler,
    hashInviteCode,
    judgeInvite,
    normalizeInviteCode,
    ulid,
    type AccountAuth,
    type AccountStore,
    type CreateUserResult,
    type InviteRow,
    type MembershipRow,
} from './handler.ts';
import { fromHex, supabaseStore, toHex, type DbResult, type Q } from './store.ts';

const ORIGIN = 'https://tt.example.org';
const NOW = new Date('2026-11-17T03:00:00Z');
const CODE = 'ABCDEFGH2345';
const CODE2 = 'QRSTUVWX6723';

const KEY_TEXT = `k1:${btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))}`;
let ring: KeyRing | null = null;
const keys = async () => (ring ??= await buildKeyRing(parseKeys(KEY_TEXT)));

const hex = (b: Bytes) => toHex(b);

/** 메모리 표 — 집기(claim)는 조건부 UPDATE 와 같은 뜻으로 */
function memStore() {
    const invites = new Map<string, InviteRow & { codeHex: string; usedBy: string | null }>();
    const members: (MembershipRow & { userId: string })[] = [];
    const projects = new Map<string, { nameCt: Bytes; createdBy: string; dataEpoch: string }>();
    const store: AccountStore = {
        async findInviteByHash(h) {
            for (const r of invites.values()) if (r.codeHex === hex(h)) return { ...r };
            return null;
        },
        async claimInvite(id, nowIso) {
            const r = invites.get(id);
            if (!r || r.usedAt || r.revokedAt || !(r.expiresAt > nowIso)) return false;
            r.usedAt = nowIso;
            return true;
        },
        async releaseInvite(id) {
            const r = invites.get(id);
            if (r) {
                r.usedAt = null;
                r.usedBy = null;
            }
        },
        async setInviteUser(id, uid) {
            invites.get(id)!.usedBy = uid;
        },
        async memberExists(pid, uid) {
            return members.some((m) => m.projectId === pid && m.userId === uid);
        },
        async insertMember(row) {
            if (row.personRef && members.some((m) => m.projectId === row.projectId && m.personRef === row.personRef)) {
                return 'person_taken';
            }
            members.push({ projectId: row.projectId, userId: row.userId, roles: [...row.roles], personRef: row.personRef, active: true });
            return 'ok';
        },
        async insertProject(row) {
            projects.set(row.id, { nameCt: row.nameCt, createdBy: row.createdBy, dataEpoch: row.dataEpoch });
        },
        async deleteProject(id) {
            projects.delete(id);
        },
        async listMemberships(uid) {
            return members.filter((m) => m.userId === uid);
        },
        async projectNames(ids) {
            return ids.filter((i) => projects.has(i)).map((i) => ({ id: i, nameCt: projects.get(i)!.nameCt }));
        },
    };
    return { store, invites, members, projects };
}

async function addInvite(
    s: ReturnType<typeof memStore>,
    code: string,
    over: Partial<InviteRow> = {},
): Promise<void> {
    const id = over.id ?? `inv-${s.invites.size + 1}`;
    s.invites.set(id, {
        id,
        projectId: 'p1',
        roles: ['교사'],
        personRef: null,
        expiresAt: '2026-11-24T00:00:00.000Z',
        usedAt: null,
        revokedAt: null,
        ...over,
        codeHex: hex(await hashInviteCode(code)),
        usedBy: null,
    });
}

/** 가짜 Auth — 「Allow new users to sign up」 OFF: 열린 signUp 은 언제나 거부, admin.createUser 만 된다 */
function fakeAuth(users: Record<string, string> = { 'jwt-a': 'u-a', 'jwt-b': 'u-b' }) {
    const created: { email: string; password: string; email_confirm: boolean }[] = [];
    const emails = new Set<string>(['taken@example.org']);
    let openSignUpCalls = 0;
    const client: AccountAuth & { auth: { signUp(): Promise<unknown> } } = {
        auth: {
            getUser: async (jwt) =>
                users[jwt] ? { data: { user: { id: users[jwt] } }, error: null } : { data: { user: null }, error: { status: 401 } },
            signUp: async () => {
                openSignUpCalls++;
                return { data: { user: null }, error: { status: 422, code: 'signup_disabled' } };
            },
            admin: {
                createUser: async (attrs): Promise<CreateUserResult> => {
                    if (emails.has(attrs.email)) {
                        return { data: { user: null }, error: { status: 422, code: 'email_exists', message: 'already registered' } };
                    }
                    emails.add(attrs.email);
                    created.push(attrs);
                    return { data: { user: { id: `new-${created.length}` } }, error: null };
                },
            },
        },
        from: () => {
            throw new Error('auth.ts 의 표 읽기는 이 함수에서 안 쓴다');
        },
    };
    return { client, created, openSignUps: () => openSignUpCalls };
}

function setup() {
    const s = memStore();
    const a = fakeAuth();
    let n = 0;
    const h = accountHandler({
        client: a.client,
        store: s.store,
        keys,
        allowedOrigin: ORIGIN,
        clock: () => NOW,
        newId: () => `P${++n}`,
        newEpoch: () => 'e0',
    });
    return { s, a, h };
}

const call = (h: (r: Request) => Promise<Response>, method: string, path: string, body?: unknown, jwt?: string) =>
    h(
        new Request(`https://ref.supabase.co/functions/v1/account/${path}`, {
            method,
            headers: {
                ...(method !== 'GET' ? { Origin: ORIGIN, 'Content-Type': 'application/json' } : {}),
                ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        }),
    );
const json = async (res: Response) => (await res.json()) as Record<string, unknown> & { error?: { code: string } };

describe('account signup — 가입 OFF 에서 admin.createUser', () => {
    it('초대 코드 + 이메일 + 비번 → admin.createUser(email_confirm:true) · 열린 signUp 은 안 부른다 · 구성원 생김', async () => {
        const { s, a, h } = setup();
        await addInvite(s, CODE, { roles: ['교사', '근태담당'], personRef: 'T01' });
        const res = await call(h, 'POST', 'signup', { inviteCode: 'abcd-efgh-2345', email: 'New@Example.org', password: 'pass-word-1' });
        expect(res.status).toBe(201);
        expect(await json(res)).toEqual({ userId: 'new-1', projectId: 'p1', roles: ['교사', '근태담당'] });
        expect(a.created).toEqual([{ email: 'new@example.org', password: 'pass-word-1', email_confirm: true }]);
        expect(a.openSignUps()).toBe(0);
        expect(s.members).toEqual([{ projectId: 'p1', userId: 'new-1', roles: ['교사', '근태담당'], personRef: 'T01', active: true }]);
        expect(s.invites.get('inv-1')).toMatchObject({ usedAt: NOW.toISOString(), usedBy: 'new-1' });
    });
    it('코드 1회용 — 같은 코드 두 번째는 409 invite_used · 계정 하나만', async () => {
        const { s, a, h } = setup();
        await addInvite(s, CODE);
        expect((await call(h, 'POST', 'signup', { inviteCode: CODE, email: 'a1@example.org', password: 'pass-word-1' })).status).toBe(201);
        const res = await call(h, 'POST', 'signup', { inviteCode: CODE, email: 'a2@example.org', password: 'pass-word-1' });
        expect(res.status).toBe(409);
        expect((await json(res)).error?.code).toBe('invite_used');
        expect(a.created).toHaveLength(1);
    });
    it('동시 두 요청 — 집기는 한 쪽만 · 지는 쪽 409', async () => {
        const { s, a, h } = setup();
        await addInvite(s, CODE);
        const rs = await Promise.all([
            call(h, 'POST', 'signup', { inviteCode: CODE, email: 'c1@example.org', password: 'pass-word-1' }),
            call(h, 'POST', 'signup', { inviteCode: CODE, email: 'c2@example.org', password: 'pass-word-1' }),
        ]);
        expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
        expect(a.created).toHaveLength(1);
    });
    it('없는 코드·철회 400 invalid_invite · 지난 코드 400 invite_expired · 계정 안 만듦', async () => {
        const { s, a, h } = setup();
        await addInvite(s, CODE, { revokedAt: '2026-11-16T00:00:00Z' });
        await addInvite(s, CODE2, { expiresAt: '2026-11-17T02:59:59Z' });
        const body = (c: string) => ({ inviteCode: c, email: 'x@example.org', password: 'pass-word-1' });
        for (const [c, code] of [['ZZZZZZZZZZZZ', 'invalid_invite'], ['nope', 'invalid_invite'], [CODE, 'invalid_invite'], [CODE2, 'invite_expired']]) {
            const res = await call(h, 'POST', 'signup', body(c));
            expect(res.status).toBe(400);
            expect((await json(res)).error?.code).toBe(code);
        }
        expect(a.created).toHaveLength(0);
    });
    it('이미 있는 이메일은 409 email_taken · 코드는 되살아나 다른 이메일로 쓸 수 있다', async () => {
        const { s, h } = setup();
        await addInvite(s, CODE);
        const res = await call(h, 'POST', 'signup', { inviteCode: CODE, email: 'taken@example.org', password: 'pass-word-1' });
        expect(res.status).toBe(409);
        expect((await json(res)).error?.code).toBe('email_taken');
        expect(s.invites.get('inv-1')!.usedAt).toBeNull();
        expect((await call(h, 'POST', 'signup', { inviteCode: CODE, email: 'ok@example.org', password: 'pass-word-1' })).status).toBe(201);
    });
    it('본문 검사 — 이메일 꼴 400 bad_request · 짧은 비번 400 weak_password · JSON 아님 400', async () => {
        const { s, h } = setup();
        await addInvite(s, CODE);
        expect((await json(await call(h, 'POST', 'signup', { inviteCode: CODE, email: 'x', password: 'pass-word-1' }))).error?.code).toBe('bad_request');
        expect((await json(await call(h, 'POST', 'signup', { inviteCode: CODE, email: 'x@e.org', password: 'short' }))).error?.code).toBe('weak_password');
        const raw = await h(new Request('https://r.supabase.co/functions/v1/account/signup', { method: 'POST', headers: { Origin: ORIGIN }, body: '{' }));
        expect(raw.status).toBe(400);
    });
    it('signup 은 JWT 없이 401 이 아니다 · Origin 없으면 403', async () => {
        const { h } = setup();
        const res = await h(new Request('https://r.supabase.co/functions/v1/account/signup', { method: 'POST', body: '{}' }));
        expect(res.status).toBe(403);
        expect((await json(res)).error?.code).toBe('origin_mismatch');
    });
});

describe('account projects — 아무나 · 만든 이 = 관리자', () => {
    it('로그인한 누구나 만든다 → 만든 이가 관리자 · 이름은 암호문(AAD=project)', async () => {
        const { s, h } = setup();
        const res = await call(h, 'POST', 'projects', { name: '  ○○초 시간표 ' }, 'jwt-b');
        expect(res.status).toBe(201);
        expect(await json(res)).toEqual({ id: 'P1', name: '○○초 시간표', roles: ['관리자'] });
        expect(s.members).toEqual([{ projectId: 'P1', userId: 'u-b', roles: ['관리자'], personRef: null, active: true }]);
        const p = s.projects.get('P1')!;
        expect(p.createdBy).toBe('u-b');
        expect(new TextDecoder().decode(p.nameCt)).not.toContain('시간표');
        expect(await openText(await keys(), p.nameCt, (kid) => aadProject('P1', kid))).toBe('○○초 시간표');
        await expect(openText(await keys(), p.nameCt, (kid) => aadProject('P2', kid))).rejects.toThrow();
    });
    it('이름 빈칸 400 · 구성원 넣기 실패면 프로젝트를 지운다', async () => {
        const { s, h } = setup();
        expect((await call(h, 'POST', 'projects', { name: '   ' }, 'jwt-a')).status).toBe(400);
        s.store.insertMember = async () => {
            throw new Error('db');
        };
        expect((await call(h, 'POST', 'projects', { name: '학교' }, 'jwt-a')).status).toBe(500);
        expect(s.projects.size).toBe(0);
    });
});

describe('account join · me', () => {
    it('join — 로그인 사용자가 그 프로젝트 코드로 참여 · 두 번째 409 · 이미 구성원 409 · 다른 프로젝트 코드 400', async () => {
        const { s, h } = setup();
        await addInvite(s, CODE, { roles: ['교무'] });
        await addInvite(s, CODE2, { projectId: 'p2' });
        const res = await call(h, 'POST', 'projects/p1/join', { inviteCode: CODE }, 'jwt-a');
        expect(res.status).toBe(201);
        expect(s.members).toEqual([{ projectId: 'p1', userId: 'u-a', roles: ['교무'], personRef: null, active: true }]);
        expect((await json(await call(h, 'POST', 'projects/p1/join', { inviteCode: CODE }, 'jwt-b'))).error?.code).toBe('invite_used');
        await addInvite(s, 'MMMMMMMMMMMM');
        expect((await json(await call(h, 'POST', 'projects/p1/join', { inviteCode: 'MMMMMMMMMMMM' }, 'jwt-a'))).error?.code).toBe(
            'already_member',
        );
        expect((await json(await call(h, 'POST', 'projects/p1/join', { inviteCode: CODE2 }, 'jwt-b'))).error?.code).toBe('invalid_invite');
        expect(s.invites.get('inv-3')!.usedAt).toBeNull();
    });
    it('me — 살아 있는 구성원 자리만 · 이름 복호 · 정지는 빠진다', async () => {
        const { s, h } = setup();
        await call(h, 'POST', 'projects', { name: '가학교' }, 'jwt-a');
        await call(h, 'POST', 'projects', { name: '나학교' }, 'jwt-a');
        s.members[1].active = false;
        const res = await call(h, 'GET', 'me', undefined, 'jwt-a');
        expect(res.status).toBe(200);
        expect(await json(res)).toEqual({ userId: 'u-a', projects: [{ id: 'P1', name: '가학교', roles: ['관리자'], personRef: null }] });
        expect(await json(await call(h, 'GET', 'me', undefined, 'jwt-b'))).toEqual({ userId: 'u-b', projects: [] });
    });
    it('로그인 필요 경로(me·projects·join)는 JWT 없거나 무효면 401', async () => {
        const { s, h } = setup();
        await addInvite(s, CODE);
        for (const jwt of [undefined, 'bad']) {
            for (const [m, p, b] of [['GET', 'me', undefined], ['POST', 'projects', { name: 'x' }], ['POST', 'projects/p1/join', { inviteCode: CODE }]] as const) {
                const res = await call(h, m, p, b, jwt);
                expect(res.status, `${m} ${p} ${jwt}`).toBe(401);
                expect((await json(res)).error?.code).toBe('unauthorized');
            }
        }
        expect(s.members).toHaveLength(0);
        expect(s.invites.get('inv-1')!.usedAt).toBeNull();
    });
    it('없는 경로 404 · 방식 틀림 405', async () => {
        const { h } = setup();
        expect((await call(h, 'GET', 'nope')).status).toBe(404);
        expect((await call(h, 'GET', 'signup')).status).toBe(405);
        expect((await call(h, 'POST', 'me', {})).status).toBe(405);
    });
});

describe('도우미 · store', () => {
    it('코드 정리 · 판정 · ulid', () => {
        expect(normalizeInviteCode(' abcd efgh-2345 ')).toBe(CODE);
        expect(normalizeInviteCode('ABCDEFGH234')).toBeNull();
        expect(normalizeInviteCode(12)).toBeNull();
        const base: InviteRow = { id: 'i', projectId: 'p', roles: ['교사'], personRef: null, expiresAt: '2026-11-18T00:00:00Z', usedAt: null, revokedAt: null };
        expect(judgeInvite(base, NOW)).toBe(base);
        expect(() => judgeInvite({ ...base, roles: ['임금님'] }, NOW)).toThrow();
        expect(ulid(0)).toMatch(/^0{10}[0-9A-HJKMNP-TV-Z]{16}$/);
    });
    it('bytea 글자 왕복', () => {
        const b = new Uint8Array([0, 15, 255]);
        expect(toHex(b)).toBe('\\x000fff');
        expect(Array.from(fromHex('\\x000fff'))).toEqual([0, 15, 255]);
        expect(() => fromHex('00ff')).toThrow();
    });
    it('claimInvite 는 조건부 UPDATE(used_at·revoked_at null · 기한 안) — 한 행이면 true', async () => {
        const calls: string[] = [];
        let rows: unknown[] = [{ id: 'i1' }];
        const q: Q = {
            select: (c) => (calls.push(`select ${c}`), q),
            insert: () => q,
            update: (r) => (calls.push(`update ${JSON.stringify(r)}`), q),
            delete: () => q,
            eq: (c, v) => (calls.push(`eq ${c} ${String(v)}`), q),
            is: (c) => (calls.push(`is ${c} null`), q),
            gt: (c, v) => (calls.push(`gt ${c} ${v}`), q),
            in: () => q,
            limit: () => q,
            maybeSingle: async () => ({ data: null, error: null }),
            then: (ok, bad) => Promise.resolve<DbResult>({ data: rows, error: null }).then(ok, bad),
        };
        const st = supabaseStore({ from: () => q });
        expect(await st.claimInvite('i1', NOW.toISOString())).toBe(true);
        expect(calls).toEqual([
            `update {"used_at":"${NOW.toISOString()}"}`,
            'eq id i1',
            'is used_at null',
            'is revoked_at null',
            `gt expires_at ${NOW.toISOString()}`,
            'select id',
        ]);
        rows = [];
        expect(await st.claimInvite('i1', NOW.toISOString())).toBe(false);
    });
    it('sealText 로 만든 이름을 me 가 연다(같은 키 고리)', async () => {
        const ct = await sealText(await keys(), '다학교', (kid) => aadProject('P9', kid));
        expect(await openText(await keys(), ct, (kid) => aadProject('P9', kid))).toBe('다학교');
    });
});
