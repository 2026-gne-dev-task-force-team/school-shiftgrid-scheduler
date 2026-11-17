// account ② (판 B5) — invites · from-doc · members · last_admin · reset-link. 가짜 표·가짜 Auth 로 잰다.
import { describe, expect, it } from 'vitest';
import { buildKeyRing, parseKeys } from '../_shared/crypto/keys.ts';
import type { KeyRing } from '../_shared/crypto/envelope.ts';
import { sealPart } from '../parts/store.ts';
import {
    accountHandler,
    cleanRoles,
    hashInviteCode,
    judgeMemberPatch,
    newInviteCode,
    peopleFromDoc,
    type AccountAuth,
    type AccountStore,
    type InviteListRow,
    type MemberRow,
} from './handler.ts';
import { supabaseStore, toHex, type DbResult, type Q } from './store.ts';

const ORIGIN = 'https://tt.example.org';
const NOW = new Date('2026-11-17T03:00:00Z');
const KEY_TEXT = `k1:${btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))}`;
let ring: KeyRing | null = null;
const keys = async () => (ring ??= await buildKeyRing(parseKeys(KEY_TEXT)));

type Inv = InviteListRow & { codeHex: string };
type Mem = MemberRow & { projectId: string };

function memStore() {
    const invites = new Map<string, Inv>();
    const members: Mem[] = [];
    const docs = new Map<string, { version: number; ct: Uint8Array<ArrayBuffer> }>();
    const of = (pid: string) => members.filter((m) => m.projectId === pid);
    const store: AccountStore = {
        async findInviteByHash(h) {
            for (const r of invites.values()) if (r.codeHex === toHex(h)) return { ...r };
            return null;
        },
        async claimInvite(id, nowIso) {
            const r = invites.get(id);
            if (!r || r.usedAt || r.revokedAt || !(r.expiresAt > nowIso)) return false;
            r.usedAt = nowIso;
            return true;
        },
        async releaseInvite(id) {
            const r = invites.get(id)!;
            r.usedAt = null;
            r.usedBy = null;
        },
        async setInviteUser(id, uid) {
            invites.get(id)!.usedBy = uid;
        },
        async memberExists(pid, uid) {
            return of(pid).some((m) => m.userId === uid);
        },
        async insertMember(row) {
            if (row.personRef && of(row.projectId).some((m) => m.personRef === row.personRef)) return 'person_taken';
            members.push({ projectId: row.projectId, userId: row.userId, roles: [...row.roles], personRef: row.personRef, active: true });
            return 'ok';
        },
        insertProject: async () => undefined,
        deleteProject: async () => undefined,
        listMemberships: async () => [],
        projectNames: async () => [],
        async insertInvites(rows) {
            for (const r of rows) {
                invites.set(r.id, {
                    id: r.id,
                    projectId: r.projectId,
                    roles: [...r.roles],
                    personRef: r.personRef,
                    expiresAt: r.expiresAt,
                    usedAt: null,
                    usedBy: null,
                    revokedAt: null,
                    createdBy: r.createdBy,
                    createdAt: NOW.toISOString(),
                    codeHex: toHex(r.codeHash),
                });
            }
        },
        async listInvites(pid) {
            return [...invites.values()].filter((r) => r.projectId === pid).map(({ codeHex: _h, ...r }) => r);
        },
        async revokeInvite(pid, id, nowIso) {
            const r = invites.get(id);
            if (!r || r.projectId !== pid) return 'missing';
            if (r.usedAt) return 'used';
            if (r.revokedAt) return 'revoked';
            r.revokedAt = nowIso;
            return 'ok';
        },
        async listMembers(pid) {
            return of(pid).map(({ projectId: _p, ...m }) => ({ ...m, roles: [...m.roles] }));
        },
        async updateMember(pid, uid, patch) {
            const m = of(pid).find((x) => x.userId === uid);
            if (!m) return 'missing';
            if (patch.personRef && of(pid).some((x) => x.userId !== uid && x.personRef === patch.personRef)) return 'person_taken';
            if (patch.roles) m.roles = [...patch.roles];
            if (patch.personRef !== undefined) m.personRef = patch.personRef;
            if (patch.active !== undefined) m.active = patch.active;
            return 'ok';
        },
        async readDoc(pid) {
            return docs.get(pid) ?? null;
        },
    };
    return { store, invites, members, docs };
}

/** 가짜 Auth — JWT 둘 · project_members 읽기는 memStore 를 본다 · recovery 토큰은 사용자당 하나(새로 만들면 옛 것 무효 · 한 번 쓰면 무효) */
function fakeAuth(members: Mem[]) {
    const jwts: Record<string, string> = { 'jwt-admin': 'u-admin', 'jwt-t': 'u-t', 'jwt-out': 'u-out', 'jwt-admin2': 'u-admin2' };
    const emails: Record<string, string> = { 'u-t': 't@example.org', 'u-admin': 'a@example.org' };
    const recovery = new Map<string, string>();
    let n = 0;
    let created = 0;
    const client: AccountAuth = {
        auth: {
            getUser: async (jwt) => (jwts[jwt] ? { data: { user: { id: jwts[jwt] } }, error: null } : { data: { user: null }, error: { status: 401 } }),
            admin: {
                createUser: async () => ({ data: { user: { id: `new-${++created}` } }, error: null }),
                getUserById: async (uid) =>
                    members.some((m) => m.userId === uid) ? { data: { user: { id: uid, email: emails[uid] ?? null } }, error: null } : { data: { user: null }, error: { status: 404 } },
                generateLink: async ({ email }) => {
                    const uid = Object.keys(emails).find((k) => emails[k] === email)!;
                    const token = `tok${++n}`;
                    recovery.set(uid, token);
                    return { data: { properties: { action_link: `https://ref.supabase.co/auth/v1/verify?token=${token}&type=recovery` } }, error: null };
                },
            },
        },
        from: () => ({
            select: () => ({
                eq: (_c: string, pid: string) => ({
                    eq: (_c2: string, uid: string) => ({
                        maybeSingle: async () => {
                            const m = members.find((x) => x.projectId === pid && x.userId === uid);
                            return { data: m ? { roles: m.roles, active: m.active } : null, error: null };
                        },
                    }),
                }),
            }),
        }),
    };
    /** 링크 쓰기 — Auth 의 verify 처럼 맞는 토큰이면 지우고 true */
    const useLink = (link: string): boolean => {
        const token = new URL(link).searchParams.get('token');
        for (const [uid, t] of recovery) {
            if (t === token) {
                recovery.delete(uid);
                return true;
            }
        }
        return false;
    };
    return { client, useLink };
}

function setup() {
    const s = memStore();
    s.members.push(
        { projectId: 'p1', userId: 'u-admin', roles: ['관리자'], personRef: null, active: true },
        { projectId: 'p1', userId: 'u-t', roles: ['교사'], personRef: 'A01', active: true },
    );
    const a = fakeAuth(s.members);
    let n = 0;
    const h = accountHandler({ client: a.client, store: s.store, keys, allowedOrigin: ORIGIN, clock: () => NOW, newId: () => `I${++n}` });
    return { s, a, h };
}

const call = (h: (r: Request) => Promise<Response>, method: string, path: string, jwt?: string, body?: unknown) =>
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
type J = Record<string, unknown> & { error?: { code: string } };
const json = async (res: Response) => (await res.json()) as J;

describe('invites — 코드 원문은 한 번만', () => {
    it('발급 응답에만 원문 · 저장은 sha256 · 목록엔 원문·해시 없음 · 그 코드로 가입된다', async () => {
        const { s, h } = setup();
        const res = await call(h, 'POST', 'projects/p1/invites', 'jwt-admin', { roles: ['교사', '교무'], personRef: 'B02', days: 3 });
        expect(res.status).toBe(201);
        expect(res.headers.get('Cache-Control')).toBe('no-store');
        const body = (await json(res)) as { id: string; code: string; expiresAt: string };
        expect(body.code).toMatch(/^[A-Z2-7]{12}$/);
        expect(body.expiresAt).toBe('2026-11-20T03:00:00.000Z');
        const stored = s.invites.get(body.id)!;
        expect(stored.codeHex).toBe(toHex(await hashInviteCode(body.code)));
        expect(JSON.stringify([...s.invites.values()])).not.toContain(body.code);
        expect(stored).toMatchObject({ roles: ['교사', '교무'], personRef: 'B02', createdBy: 'u-admin' });

        const list = await (await call(h, 'GET', 'projects/p1/invites', 'jwt-admin')).text();
        expect(list).not.toContain(body.code);
        expect(list).not.toContain(stored.codeHex.slice(2));
        expect(JSON.parse(list).invites).toEqual([expect.objectContaining({ id: body.id, state: 'pending', personRef: 'B02' })]);
        expect(Object.keys(JSON.parse(list).invites[0])).not.toContain('code');

        const sg = await call(h, 'POST', 'signup', undefined, { inviteCode: body.code, email: 'n@example.org', password: 'pass-word-1' });
        expect(sg.status).toBe(201);
        expect(JSON.parse(await (await call(h, 'GET', 'projects/p1/invites', 'jwt-admin')).text()).invites[0].state).toBe('used');
    });
    it('본문 검사 400 — 모르는 역할 · 빈 역할 · days 범위 밖', async () => {
        const { h } = setup();
        for (const b of [{ roles: ['임금님'] }, { roles: [] }, { roles: ['교사'], days: 31 }, { roles: ['교사'], personRef: 5 }]) {
            expect((await call(h, 'POST', 'projects/p1/invites', 'jwt-admin', b)).status, JSON.stringify(b)).toBe(400);
        }
    });
    it('철회 — 그 코드로 가입 안 됨 · 쓰인 코드 철회 409 · 없는 id 404 · 다시 철회는 그대로 200', async () => {
        const { h } = setup();
        const a = (await json(await call(h, 'POST', 'projects/p1/invites', 'jwt-admin', { roles: ['교사'] }))) as { id: string; code: string };
        const b = (await json(await call(h, 'POST', 'projects/p1/invites', 'jwt-admin', { roles: ['교사'] }))) as { id: string; code: string };
        expect((await call(h, 'DELETE', `projects/p1/invites/${a.id}`, 'jwt-admin')).status).toBe(200);
        expect((await call(h, 'DELETE', `projects/p1/invites/${a.id}`, 'jwt-admin')).status).toBe(200);
        const sg = await call(h, 'POST', 'signup', undefined, { inviteCode: a.code, email: 'x@example.org', password: 'pass-word-1' });
        expect((await json(sg)).error?.code).toBe('invalid_invite');
        await call(h, 'POST', 'signup', undefined, { inviteCode: b.code, email: 'y@example.org', password: 'pass-word-1' });
        expect((await json(await call(h, 'DELETE', `projects/p1/invites/${b.id}`, 'jwt-admin'))).error?.code).toBe('invite_used');
        expect((await call(h, 'DELETE', 'projects/p1/invites/nope', 'jwt-admin')).status).toBe(404);
    });
    it('코드 만들기 — base32 12자 · 매번 다름', () => {
        const cs = new Set(Array.from({ length: 50 }, newInviteCode));
        expect(cs.size).toBe(50);
        for (const c of cs) expect(c).toMatch(/^[A-Z2-7]{12}$/);
    });
});

describe('invites/from-doc — doc 복호 → 사람마다 코드', () => {
    const DOC = {
        tracks: [{ name: '1-1' }, { name: '1-2' }],
        agents: [
            { id: 'A01', name: '가선생', role: '전담' },
            { id: 'A02', name: '나선생', role: '비교과' },
        ],
    };
    it('담임·전담 사람마다 교사 코드 · 이미 이어진 사람(A01)·대기 중 초대는 건너뜀 · 표는 응답에만', async () => {
        const { s, h } = setup();
        s.docs.set('p1', { version: 4, ct: await sealPart(await keys(), 'p1', 'doc', 4, { fmt: 1, body: DOC }) });
        const res = await call(h, 'POST', 'projects/p1/invites/from-doc', 'jwt-admin', {});
        expect(res.status).toBe(201);
        const body = (await json(res)) as { invites: { name: string; personRef: string; code: string; inviteId: string }[]; skipped: unknown };
        expect(body.invites.map((x) => [x.personRef, x.name])).toEqual([
            ['homeroom:1-1', '1-1 담임'],
            ['homeroom:1-2', '1-2 담임'],
            ['A02', '나선생'],
        ]);
        expect(body.skipped).toEqual({ linked: 1, pending: 0 });
        for (const x of body.invites) {
            expect(s.invites.get(x.inviteId)).toMatchObject({ roles: ['교사'], personRef: x.personRef });
            expect(s.invites.get(x.inviteId)!.codeHex).toBe(toHex(await hashInviteCode(x.code)));
        }
        expect(JSON.stringify([...s.invites.values()])).not.toContain('가선생');
        const again = (await json(await call(h, 'POST', 'projects/p1/invites/from-doc', 'jwt-admin', {}))) as { invites: unknown[]; skipped: unknown };
        expect(again.invites).toEqual([]);
        expect(again.skipped).toEqual({ linked: 1, pending: 3 });
    });
    it('personRefs 로 골라 만들기 · doc 없으면 409 no_doc · 다른 판(version) AAD 면 500', async () => {
        const { s, h } = setup();
        expect((await json(await call(h, 'POST', 'projects/p1/invites/from-doc', 'jwt-admin', {}))).error?.code).toBe('no_doc');
        s.docs.set('p1', { version: 4, ct: await sealPart(await keys(), 'p1', 'doc', 4, { fmt: 1, body: DOC }) });
        const one = (await json(await call(h, 'POST', 'projects/p1/invites/from-doc', 'jwt-admin', { personRefs: ['A02'] }))) as { invites: { personRef: string }[] };
        expect(one.invites.map((x) => x.personRef)).toEqual(['A02']);
        s.docs.set('p1', { version: 5, ct: await sealPart(await keys(), 'p1', 'doc', 4, { fmt: 1, body: DOC }) });
        expect((await call(h, 'POST', 'projects/p1/invites/from-doc', 'jwt-admin', {})).status).toBe(500);
    });
    it('peopleFromDoc — 꼴 틀린 칸 건너뜀 · 겹침은 앞의 것', () => {
        expect(peopleFromDoc(null)).toEqual([]);
        expect(peopleFromDoc({ tracks: [{ name: ' 2-1 ' }, null, { name: 3 }], agents: [{ id: 'X' }, { id: 'X', name: 'dup' }, { name: 'no id' }] })).toEqual([
            { personRef: 'homeroom:2-1', name: '2-1 담임' },
            { personRef: 'X', name: 'X' },
        ]);
    });
});

describe('members — PATCH · last_admin', () => {
    it('목록 · 역할·personRef·정지 고치기', async () => {
        const { s, h } = setup();
        const list = (await json(await call(h, 'GET', 'projects/p1/members', 'jwt-admin'))) as { members: unknown[] };
        expect(list.members).toHaveLength(2);
        const res = await call(h, 'PATCH', 'projects/p1/members/u-t', 'jwt-admin', { roles: ['교사', '근태담당'], personRef: 'A09' });
        expect(res.status).toBe(200);
        expect(await json(res)).toEqual({ userId: 'u-t', roles: ['교사', '근태담당'], personRef: 'A09', active: true });
        expect(s.members[1]).toMatchObject({ roles: ['교사', '근태담당'], personRef: 'A09' });
        expect((await call(h, 'PATCH', 'projects/p1/members/u-t', 'jwt-admin', { active: false })).status).toBe(200);
        // 정지는 바로 먹는다 — 살아 있는 JWT 로도 403
        expect((await json(await call(h, 'GET', 'projects/p1/members', 'jwt-t'))).error?.code).toBe('not_member');
    });
    it('마지막 관리자 — 자기 관리자 빼기·정지 409 last_admin · 다른 관리자가 있으면 된다', async () => {
        const { s, h } = setup();
        for (const b of [{ roles: ['교사'] }, { active: false }]) {
            const res = await call(h, 'PATCH', 'projects/p1/members/u-admin', 'jwt-admin', b);
            expect(res.status, JSON.stringify(b)).toBe(409);
            expect((await json(res)).error?.code).toBe('last_admin');
        }
        expect(s.members[0]).toMatchObject({ roles: ['관리자'], active: true });
        // 정지된 관리자는 「살아 있는 관리자」로 안 센다
        s.members.push({ projectId: 'p1', userId: 'u-admin2', roles: ['관리자'], personRef: null, active: false });
        expect((await call(h, 'PATCH', 'projects/p1/members/u-admin', 'jwt-admin', { roles: ['교사'] })).status).toBe(409);
        s.members[2].active = true;
        expect((await call(h, 'PATCH', 'projects/p1/members/u-admin', 'jwt-admin', { roles: ['교사'] })).status).toBe(200);
        // 이제 u-admin2 가 마지막 — 스스로 정지 409
        expect((await json(await call(h, 'PATCH', 'projects/p1/members/u-admin2', 'jwt-admin2', { active: false }))).error?.code).toBe('last_admin');
    });
    it('본문 검사 400 · 없는 구성원 404 · personRef 겹침 409', async () => {
        const { s, h } = setup();
        expect((await call(h, 'PATCH', 'projects/p1/members/u-t', 'jwt-admin', {})).status).toBe(400);
        expect((await call(h, 'PATCH', 'projects/p1/members/u-t', 'jwt-admin', { active: 'no' })).status).toBe(400);
        expect((await call(h, 'PATCH', 'projects/p1/members/u-t', 'jwt-admin', { roles: ['임금님'] })).status).toBe(400);
        expect((await call(h, 'PATCH', 'projects/p1/members/u-zz', 'jwt-admin', { active: false })).status).toBe(404);
        s.members[0].personRef = 'Z1';
        expect((await json(await call(h, 'PATCH', 'projects/p1/members/u-t', 'jwt-admin', { personRef: 'Z1' }))).error?.code).toBe('person_taken');
    });
    it('judgeMemberPatch · cleanRoles 순수', () => {
        const ms: MemberRow[] = [
            { userId: 'a', roles: ['관리자', '교사'], personRef: null, active: true },
            { userId: 'b', roles: ['교사'], personRef: null, active: true },
        ];
        expect(() => judgeMemberPatch(ms, 'a', { roles: ['교사'] })).toThrow(/마지막 관리자/);
        expect(judgeMemberPatch(ms, 'a', { roles: ['관리자'] }).roles).toEqual(['관리자']);
        expect(judgeMemberPatch(ms, 'b', { active: false }).active).toBe(false);
        expect(cleanRoles(['교사', '교사'])).toEqual(['교사']);
        expect(cleanRoles('교사')).toBeNull();
    });
});

describe('reset-link — 관리자가 한 번만 받는다', () => {
    it('링크는 응답에만(no-store) · 표에 안 남음 · 한 번 쓰면 무효 · 새로 만들면 옛 링크 무효', async () => {
        const { s, a, h } = setup();
        const r1 = await call(h, 'POST', 'projects/p1/members/u-t/reset-link', 'jwt-admin');
        expect(r1.status).toBe(201);
        expect(r1.headers.get('Cache-Control')).toBe('no-store');
        const { link } = (await json(r1)) as { link: string };
        expect(link).toMatch(/type=recovery/);
        expect(JSON.stringify({ i: [...s.invites.values()], m: s.members })).not.toContain(new URL(link).searchParams.get('token')!);
        expect(a.useLink(link)).toBe(true);
        expect(a.useLink(link)).toBe(false);
        const l2 = ((await json(await call(h, 'POST', 'projects/p1/members/u-t/reset-link', 'jwt-admin'))) as { link: string }).link;
        const l3 = ((await json(await call(h, 'POST', 'projects/p1/members/u-t/reset-link', 'jwt-admin'))) as { link: string }).link;
        expect(l2).not.toBe(l3);
        expect(a.useLink(l2)).toBe(false);
        expect(a.useLink(l3)).toBe(true);
    });
    it('다른 프로젝트 사람 404 · 이메일 없는 계정 409', async () => {
        const { s, h } = setup();
        expect((await call(h, 'POST', 'projects/p1/members/u-out/reset-link', 'jwt-admin')).status).toBe(404);
        s.members.push({ projectId: 'p1', userId: 'u-noemail', roles: ['교사'], personRef: null, active: true });
        expect((await json(await call(h, 'POST', 'projects/p1/members/u-noemail/reset-link', 'jwt-admin'))).error?.code).toBe('no_email');
    });
});

describe('권한 — 관리자만', () => {
    const ROUTES: [string, string, unknown][] = [
        ['POST', 'projects/p1/invites', { roles: ['교사'] }],
        ['GET', 'projects/p1/invites', undefined],
        ['DELETE', 'projects/p1/invites/I1', undefined],
        ['POST', 'projects/p1/invites/from-doc', {}],
        ['GET', 'projects/p1/members', undefined],
        ['PATCH', 'projects/p1/members/u-admin', { roles: ['교사'] }],
        ['POST', 'projects/p1/members/u-admin/reset-link', undefined],
    ];
    it('교사 403 forbidden · 비구성원 403 not_member · JWT 없음 401 · 아무것도 안 바뀜', async () => {
        const { s, h } = setup();
        for (const [m, p, b] of ROUTES) {
            const t = await call(h, m, p, 'jwt-t', b);
            expect(t.status, `교사 ${m} ${p}`).toBe(403);
            expect((await json(t)).error?.code).toBe('forbidden');
            expect((await json(await call(h, m, p, 'jwt-out', b))).error?.code, `비구성원 ${m} ${p}`).toBe('not_member');
            expect((await call(h, m, p, undefined, b)).status, `무로그인 ${m} ${p}`).toBe(401);
        }
        expect(s.invites.size).toBe(0);
        expect(s.members[0]).toMatchObject({ roles: ['관리자'], active: true });
    });
    it('방식 틀림 405 · 없는 하위 경로 404', async () => {
        const { h } = setup();
        expect((await call(h, 'PUT', 'projects/p1/invites', 'jwt-admin', {})).status).toBe(405);
        expect((await call(h, 'GET', 'projects/p1/members/u-t', 'jwt-admin')).status).toBe(405);
        expect((await call(h, 'GET', 'projects/p1/nope', 'jwt-admin')).status).toBe(404);
    });
});

describe('store ② — 조건부 철회 · code_hash 안 읽음', () => {
    function fakeDb(results: DbResult[]) {
        const calls: string[] = [];
        const q: Q = {
            select: (c) => (calls.push(`select ${c}`), q),
            insert: (r) => (calls.push(`insert ${JSON.stringify(r)}`), q),
            update: (r) => (calls.push(`update ${JSON.stringify(r)}`), q),
            delete: () => q,
            eq: (c, v) => (calls.push(`eq ${c} ${String(v)}`), q),
            is: (c) => (calls.push(`is ${c} null`), q),
            gt: () => q,
            in: () => q,
            limit: () => q,
            maybeSingle: async () => results.shift()!,
            then: (ok, bad) => Promise.resolve(results.shift()!).then(ok, bad),
        };
        return { db: { from: (t: string) => (calls.push(`from ${t}`), q) }, calls };
    }
    it('revokeInvite — used_at·revoked_at null 조건 · 못 집으면 읽어서 가른다', async () => {
        const f = fakeDb([{ data: [{ id: 'i' }], error: null }]);
        expect(await supabaseStore(f.db).revokeInvite('p1', 'i', NOW.toISOString())).toBe('ok');
        expect(f.calls).toEqual(['from invites', `update {"revoked_at":"${NOW.toISOString()}"}`, 'eq id i', 'eq project_id p1', 'is used_at null', 'is revoked_at null', 'select id']);
        const g = fakeDb([{ data: [], error: null }, { data: { used_at: 'x', revoked_at: null }, error: null }]);
        expect(await supabaseStore(g.db).revokeInvite('p1', 'i', NOW.toISOString())).toBe('used');
        const k = fakeDb([{ data: [], error: null }, { data: null, error: null }]);
        expect(await supabaseStore(k.db).revokeInvite('p1', 'i', NOW.toISOString())).toBe('missing');
    });
    it('listInvites 는 code_hash 를 고르지 않는다 · insertInvites 는 해시만 hex 로', async () => {
        const f = fakeDb([{ data: [], error: null }]);
        await supabaseStore(f.db).listInvites('p1');
        expect(f.calls.find((c) => c.startsWith('select'))).not.toContain('code_hash');
        const g = fakeDb([{ data: null, error: null }]);
        await supabaseStore(g.db).insertInvites([
            { id: 'i', projectId: 'p1', codeHash: new Uint8Array([1, 2]), roles: ['교사'], personRef: null, expiresAt: 'e', createdBy: 'u' },
        ]);
        expect(g.calls[1]).toContain('"code_hash":"\\\\x0102"');
    });
    it('updateMember — 23505 person_ref 는 person_taken · 0행이면 missing', async () => {
        const f = fakeDb([{ data: null, error: { code: '23505', message: 'project_members_project_id_person_ref_key' } }]);
        expect(await supabaseStore(f.db).updateMember('p1', 'u', { personRef: 'X' })).toBe('person_taken');
        const g = fakeDb([{ data: [], error: null }]);
        expect(await supabaseStore(g.db).updateMember('p1', 'u', { active: false })).toBe('missing');
    });
});
