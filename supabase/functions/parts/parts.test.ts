import { beforeEach, describe, expect, it } from 'vitest';
import type { AuthClient } from '../_shared/auth.ts';
import type { KeyRing } from '../_shared/crypto/envelope.ts';
import { buildKeyRing, parseKeys } from '../_shared/crypto/keys.ts';
import { PART_LIMITS } from '../../../shared/check/limits.ts';
import { canReadPart, canWritePart } from './access.ts';
import { formatEtag, parseKnown, parseTag } from './etag.ts';
import { partsHandler, type PartsDeps } from './handler.ts';
import { byteaToHex, hexToBytea, openPart, sealPart, type PartRow, type PartsStore } from './store.ts';

const ORIGIN = 'https://tt.example.org';
const EPOCH = 'ab12cd34';
// 가짜 키(무작위 아님 · 시험 전용)
const KEY_TEXT = `k1:${btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))}`;

/** 메모리 저장소 — 조건부 쓰기 뜻을 그대로 흉내 */
function memStore(): PartsStore & { rows: Map<string, PartRow>; epochs: Map<string, string> } {
    const rows = new Map<string, PartRow>();
    const epochs = new Map([['p1', EPOCH]]);
    const k = (pid: string, part: string) => `${pid}/${part}`;
    return {
        rows,
        epochs,
        epoch: async (pid) => epochs.get(pid) ?? null,
        list: async (pid) => [...rows.entries()].filter(([key, r]) => key.startsWith(pid + '/') && !r.part.startsWith('doc@')).map(([, r]) => r),
        get: async (pid, part) => rows.get(k(pid, part)) ?? null,
        insertFirst: async (pid, row) => {
            if (rows.has(k(pid, row.part))) return false;
            rows.set(k(pid, row.part), { ...row, version: 1 });
            return true;
        },
        update: async (pid, part, from, row) => {
            const cur = rows.get(k(pid, part));
            if (!cur || cur.version !== from) return false;
            rows.set(k(pid, part), { part, version: from + 1, ...row });
            return true;
        },
        putArchive: async (pid, row) => {
            if (!rows.has(k(pid, row.part))) rows.set(k(pid, row.part), row);
        },
    };
}

function fakeAuth(users: Record<string, { id: string; roles: string[] }>): AuthClient {
    return {
        auth: {
            getUser: async (jwt) =>
                users[jwt] ? { data: { user: { id: users[jwt].id } }, error: null } : { data: { user: null }, error: { status: 401 } },
        },
        from: () => ({
            select: () => ({
                eq: (_c1, pid) => ({
                    eq: (_c2, uid) => ({
                        maybeSingle: async () => {
                            const u = Object.values(users).find((x) => x.id === uid);
                            return { data: pid === 'p1' && u ? { roles: u.roles, active: true } : null, error: null };
                        },
                    }),
                }),
            }),
        }),
    };
}

const USERS = {
    admin: { id: 'u-admin', roles: ['관리자'] },
    teacher: { id: 'u-t', roles: ['교사'] },
    aux: { id: 'u-aux', roles: ['근태담당'] },
};

let store: ReturnType<typeof memStore>;
let ring: KeyRing;
let deps: PartsDeps;
let call: (req: Request) => Promise<Response>;

beforeEach(async () => {
    store = memStore();
    ring = await buildKeyRing(parseKeys(KEY_TEXT));
    deps = { auth: fakeAuth(USERS), store, keys: async () => ring, allowedOrigin: ORIGIN };
    call = partsHandler(deps);
});

const base = 'https://ref.supabase.co/functions/v1/parts/projects/p1';
function put(part: string, body: unknown, opts: { who?: keyof typeof USERS; ifMatch?: string | null; q?: string } = {}) {
    const h: Record<string, string> = { Authorization: `Bearer ${opts.who ?? 'admin'}`, Origin: ORIGIN, 'Content-Type': 'application/json' };
    if (opts.ifMatch !== null) h['If-Match'] = opts.ifMatch ?? `"${EPOCH}.0"`;
    return call(new Request(`${base}/parts/${part}${opts.q ?? ''}`, { method: 'PUT', headers: h, body: typeof body === 'string' ? body : JSON.stringify(body) }));
}
const get = (who: keyof typeof USERS = 'admin', q = '') =>
    call(new Request(`${base}${q}`, { method: 'GET', headers: { Authorization: `Bearer ${who}` } }));
const errOf = async (res: Response) => ((await res.json()) as { error: Record<string, unknown> }).error;

describe('etag — "<epoch>.<version>"', () => {
    it('만들기·읽기', () => {
        expect(formatEtag(EPOCH, 3)).toBe(`"${EPOCH}.3"`);
        expect(parseTag(`"${EPOCH}.0"`)).toEqual({ epoch: EPOCH, version: 0 });
        expect(parseTag('W/"ab.1"')).toBeNull();
        expect(parseTag('*')).toBeNull();
        expect(parseTag('"3"')).toBeNull(); // 옛 꼴(판 번호만)은 안 받는다
        expect(parseKnown(`doc:"${EPOCH}.2",ops.rooms:${EPOCH}.1,깨짐`)).toEqual(
            new Map([['doc', { epoch: EPOCH, version: 2 }], ['ops.rooms', { epoch: EPOCH, version: 1 }]]),
        );
    });
});

describe('PUT — 428·412·413·ETag', () => {
    it('첫 PUT 은 If-Match "<epoch>.0" → 200 · version 1 · ETag 꼴', async () => {
        const res = await put('doc', { fmt: 1, body: { a: 1 } });
        expect(res.status).toBe(200);
        expect(res.headers.get('ETag')).toBe(`"${EPOCH}.1"`);
        expect(res.headers.get('ETag')).toMatch(/^"[A-Za-z0-9_-]+\.\d+"$/);
        expect(await res.json()).toMatchObject({ version: 1 });
    });
    it('If-Match 없으면 428 precondition_required · 아무것도 안 바뀜', async () => {
        const res = await put('doc', { fmt: 1, body: {} }, { ifMatch: null });
        expect(res.status).toBe(428);
        expect((await errOf(res)).code).toBe('precondition_required');
        expect(store.rows.size).toBe(0);
    });
    it('판 번호가 다르면 412 version_conflict + 서버 version', async () => {
        await put('doc', { fmt: 1, body: 1 });
        const res = await put('doc', { fmt: 1, body: 2 }, { ifMatch: `"${EPOCH}.0"` });
        expect(res.status).toBe(412);
        expect(await errOf(res)).toMatchObject({ code: 'version_conflict', version: 1 });
    });
    it('epoch 이 다르면(복원 뒤 옛 ETag) 412', async () => {
        await put('doc', { fmt: 1, body: 1 });
        store.epochs.set('p1', 'zz99zz99');
        const res = await put('doc', { fmt: 1, body: 2 }, { ifMatch: `"${EPOCH}.1"` });
        expect(res.status).toBe(412);
    });
    it('크기 초과는 413 part_too_large {part, limit, size} — 판 번호보다 먼저', async () => {
        const limit = PART_LIMITS['ops.settings'];
        const body = JSON.stringify({ fmt: 1, body: 'x'.repeat(limit) });
        const res = await put('ops.settings', body, { ifMatch: '"nope.9"' });
        expect(res.status).toBe(413);
        expect(await errOf(res)).toMatchObject({ code: 'part_too_large', part: 'ops.settings', limit, size: body.length });
        expect(store.rows.size).toBe(0);
    });
    it('한도는 평문 UTF-8 바이트 — 한글은 3바이트로 센다', async () => {
        const limit = PART_LIMITS['ops.settings'];
        const body = JSON.stringify({ fmt: 1, body: '가'.repeat(Math.ceil(limit / 3)) });
        expect(body.length).toBeLessThan(limit);
        expect((await put('ops.settings', body)).status).toBe(413);
    });
    it('역할: 교사는 ops.changes 는 되고 doc 은 403 · 보관 doc@1 은 404', async () => {
        expect((await put('ops.changes', { fmt: 1, body: [] }, { who: 'teacher' })).status).toBe(200);
        expect((await put('doc', { fmt: 1, body: {} }, { who: 'teacher' })).status).toBe(403);
        expect((await put('doc@1', { fmt: 1, body: {} })).status).toBe(404);
        expect((await put('ops.nope', { fmt: 1, body: {} })).status).toBe(404);
    });
    it('본문 꼴·fmt 판·검사 자리(B7)', async () => {
        expect((await put('doc', '{깨짐')).status).toBe(400);
        expect((await errOf(await put('doc', { fmt: 2, body: {} }))).code).toBe('fmt_mismatch');
        deps.check = () => ['doc.x'];
        const res = await put('doc', { fmt: 1, body: {} });
        expect(await errOf(res)).toMatchObject({ code: 'check_failed', rules: ['doc.x'] });
        expect(store.rows.size).toBe(0);
    });
    it('저장된 것은 암호문 — AAD 에 조각·판 번호가 묶여 다른 이름으로는 안 열린다', async () => {
        await put('doc', { fmt: 1, body: { secret: '가짜값' } });
        const row = store.rows.get('p1/doc')!;
        expect(new TextDecoder().decode(row.ct)).not.toContain('가짜값');
        expect(await openPart(ring, 'p1', 'doc', 1, row.ct)).toEqual({ fmt: 1, body: { secret: '가짜값' } });
        await expect(openPart(ring, 'p1', 'doc@1', 1, row.ct)).rejects.toThrow();
        await expect(openPart(ring, 'p1', 'doc', 2, row.ct)).rejects.toThrow();
    });
});

describe('archive=1 — doc@<n> 보관', () => {
    it('덮어쓸 때 옛 판이 doc@<옛 version> 으로 다시 잠겨 남는다 · 보통 PUT 은 안 남긴다', async () => {
        await put('doc', { fmt: 1, body: 'v1' });
        await put('doc', { fmt: 1, body: 'v2' }, { ifMatch: `"${EPOCH}.1"` });
        expect(store.rows.has('p1/doc@1')).toBe(false);
        const res = await put('doc', { fmt: 1, body: 'v3' }, { ifMatch: `"${EPOCH}.2"`, q: '?archive=1' });
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ version: 3, archivedAs: 'doc@2' });
        const arc = store.rows.get('p1/doc@2')!;
        expect(arc.version).toBe(2);
        expect(await openPart(ring, 'p1', 'doc@2', 2, arc.ct)).toEqual({ fmt: 1, body: 'v2' });
        expect(await openPart(ring, 'p1', 'doc', 3, store.rows.get('p1/doc')!.ct)).toEqual({ fmt: 1, body: 'v3' });
    });
    it('412 로 거부되면 보관본도 안 생긴다 · doc 밖에선 400', async () => {
        await put('doc', { fmt: 1, body: 'v1' });
        expect((await put('doc', { fmt: 1, body: 'x' }, { ifMatch: `"${EPOCH}.0"`, q: '?archive=1' })).status).toBe(412);
        expect([...store.rows.keys()]).toEqual(['p1/doc']);
        expect((await errOf(await put('ops.rooms', { fmt: 1, body: [] }, { q: '?archive=1' }))).code).toBe('archive_only_doc');
    });
});

describe('GET — 조각 전부 · ?known= 바뀐 것만 · ops.aux 가림', () => {
    beforeEach(async () => {
        await put('doc', { fmt: 1, body: 'D' });
        await put('ops.rooms', { fmt: 1, body: ['R'] });
        await put('ops.aux', { fmt: 1, body: { a: 1 } }, { who: 'aux' });
        await put('doc', { fmt: 1, body: 'D2' }, { ifMatch: `"${EPOCH}.1"`, q: '?archive=1' });
    });
    it('복호한 평문 · etag 실림 · 보관 doc@<n> 은 안 내림', async () => {
        const res = await get();
        expect(res.status).toBe(200);
        const j = (await res.json()) as { epoch: string; parts: Record<string, { version: number; etag: string; body: unknown }> };
        expect(j.epoch).toBe(EPOCH);
        expect(Object.keys(j.parts).sort()).toEqual(['doc', 'ops.aux', 'ops.rooms']);
        expect(j.parts.doc).toMatchObject({ version: 2, etag: `"${EPOCH}.2"`, body: 'D2' });
    });
    it('?known= 와 같은 판은 빼고 unchanged 에 이름만', async () => {
        const res = await get('admin', `?known=${encodeURIComponent(`doc:"${EPOCH}.2",ops.rooms:"${EPOCH}.0"`)}`);
        const j = (await res.json()) as { parts: Record<string, unknown>; unchanged: string[] };
        expect(Object.keys(j.parts).sort()).toEqual(['ops.aux', 'ops.rooms']);
        expect(j.unchanged).toEqual(['doc']);
    });
    it('교사에겐 ops.aux 가 안 내려간다 · 비구성원 401/403', async () => {
        const j = (await (await get('teacher')).json()) as { parts: Record<string, unknown> };
        expect(Object.keys(j.parts)).not.toContain('ops.aux');
        expect((await call(new Request(base, { method: 'GET' }))).status).toBe(401);
    });
    it('못 여는 조각은 500 decrypt_failed', async () => {
        const row = store.rows.get('p1/ops.rooms')!;
        store.rows.set('p1/ops.rooms', { ...row, version: 9 });
        const res = await get();
        expect(res.status).toBe(500);
        expect((await errOf(res)).code).toBe('decrypt_failed');
    });
});

describe('access·store 작은 것', () => {
    it('관리자 전부 · 근태담당은 ops.aux 만 · ops.aux 읽기 가림', () => {
        expect(canWritePart(['관리자'], 'ops.aux')).toBe(true);
        expect(canWritePart(['근태담당'], 'ops.rooms')).toBe(false);
        expect(canWritePart(['관리자'], 'doc@3')).toBe(false);
        expect(canReadPart(['교사'], 'ops.aux')).toBe(false);
        expect(canReadPart(['교사'], 'doc')).toBe(true);
    });
    it('bytea hex 왕복', async () => {
        const ct = await sealPart(ring, 'p1', 'doc', 1, { fmt: 1, body: null });
        expect(hexToBytea(byteaToHex(ct))).toEqual(ct);
        expect(() => hexToBytea('abc')).toThrow();
    });
});
