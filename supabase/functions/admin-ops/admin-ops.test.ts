import { beforeEach, describe, expect, it } from 'vitest';
import type { AuthClient } from '../_shared/auth.ts';
import { aadAudit, aadPart, aadProject, aadRoom, aadSub, aadUser } from '../_shared/crypto/aad.ts';
import { openText, readKid, sealText, type AadFor, type Bytes, type KeyRing } from '../_shared/crypto/envelope.ts';
import { buildKeyRing, parseKeys } from '../_shared/crypto/keys.ts';
import { partsHandler } from '../parts/handler.ts';
import type { PartRow, PartsStore } from '../parts/store.ts';
import { adminHandler, type AdminDeps } from './handler.ts';
import { decodeCursor, encodeCursor, REWRAP_MAX_ROWS } from './rewrap.ts';
import { TARGETS, type AdminStore, type CtItem, type Target } from './store.ts';

const ORIGIN = 'https://tt.example.org';
const b64 = (n: number) => btoa(String.fromCharCode(...new Uint8Array(32).fill(n)));
const K1 = `k1:${b64(7)}`;
const K2 = `k2:${b64(9)}`;
const TEXT1 = K1;
const TEXT12 = `${K1}\n${K2}`;
const TEXT2_ONLY = K2;

interface MemRow {
    ct: Bytes;
    aadFor: AadFor;
    plain: string;
    version?: number;
}

/** 메모리 저장소 — key 순 훑기·조건부 교체 뜻을 그대로 흉내 */
function memAdmin(admins: string[]) {
    const tables = new Map<Target, Map<string, MemRow>>(TARGETS.map((t) => [t, new Map()]));
    const epochs = new Map<string, string>([['p1', 'ab12cd34'], ['p2', 'ef56ef56']]);
    const state = { kids: [] as string[], swaps: 0, beforeSwap: null as null | (() => void) };
    const store: AdminStore = {
        async page(t, after, limit) {
            const keys = [...tables.get(t)!.keys()].sort().filter((k) => after === null || k > after).slice(0, limit);
            return keys.map((key): CtItem => ({ key, ct: tables.get(t)!.get(key)!.ct, aadFor: tables.get(t)!.get(key)!.aadFor }));
        },
        async swap(t, key, oldCt, newCt) {
            state.beforeSwap?.();
            const row = tables.get(t)!.get(key);
            if (!row || row.ct.length !== oldCt.length || row.ct.some((b, i) => b !== oldCt[i])) return false;
            row.ct = newCt;
            state.swaps += 1;
            return true;
        },
        async sample() {
            const first = [...tables.get('parts')!.values()][0];
            return first ? { envelope: first.ct, aadFor: first.aadFor } : null;
        },
        kidsInUse: async () => state.kids,
        setKidsInUse: async (k) => { state.kids = k; },
        projectIds: async () => [...epochs.keys()],
        setEpoch: async (id, e) => { epochs.set(id, e); },
        isAdmin: async (uid) => admins.includes(uid),
    };
    return { store, tables, epochs, state };
}

async function fill(m: ReturnType<typeof memAdmin>, ring: KeyRing) {
    const put = async (t: Target, key: string, plain: string, aad: (kid: string) => string, version?: number) => {
        const ct = await sealText(ring, plain, aad);
        m.tables.get(t)!.set(key, { ct, aadFor: aad, plain, version });
    };
    await put('parts', 'p1/doc', '{"fmt":1}', (k) => aadPart('p1', 'doc', 4, k), 4);
    await put('parts', 'p1/ops.rooms', '{"fmt":1,"r":2}', (k) => aadPart('p1', 'ops.rooms', 2, k), 2);
    await put('parts', 'p2/doc', '둘째 학교', (k) => aadPart('p2', 'doc', 1, k), 1);
    await put('sub_slot.body', 's1', '결근 본문', (k) => aadSub('p1', 's1', '2026-11-17', '3-1', 540, k, 'body'));
    await put('sub_slot.take', 's1', '맡은 이', (k) => aadSub('p1', 's1', '2026-11-17', '3-1', 540, k, 'take'));
    await put('room_reservation', 'r1', '예약 메모', (k) => aadRoom('p1', 'r1', 'room-a', '2026-11-17', 540, 1, '3-1', k));
    await put('audit_log', 'a1', '감사 한 줄', (k) => aadAudit('p1', 'a1', '2026-11-17T01:00:00+00:00', k));
    await put('audit_log', 'a2', '감사 두 줄', (k) => aadAudit('p1', 'a2', '2026-11-17T01:00:01+00:00', k));
    await put('projects', 'p1', '○○초', (k) => aadProject('p1', k));
    await put('project_members', 'p1/u1', '김교사', (k) => aadUser('u1', k));
}

const total = (m: ReturnType<typeof memAdmin>) => [...m.tables.values()].reduce((n, t) => n + t.size, 0);
const kidCounts = (m: ReturnType<typeof memAdmin>) => {
    const c: Record<string, number> = {};
    for (const t of m.tables.values()) for (const r of t.values()) c[readKid(r.ct)] = (c[readKid(r.ct)] ?? 0) + 1;
    return c;
};

const base = 'https://ref.supabase.co/functions/v1/admin-ops';
let m: ReturnType<typeof memAdmin>;
let keyText: string | undefined;
let clock: number;
let deps: AdminDeps;
let call: (req: Request) => Promise<Response>;

const auth = {
    auth: {
        getUser: async (jwt: string) =>
            ['admin', 'teacher'].includes(jwt) ? { data: { user: { id: `u-${jwt}` } }, error: null } : { data: { user: null }, error: { status: 401 } },
    },
} as unknown as AuthClient;

const req = (path: string, method = 'POST', who: string | null = 'admin') =>
    call(new Request(`${base}/${path}`, {
        method,
        headers: { Origin: ORIGIN, ...(who ? { Authorization: `Bearer ${who}` } : {}) },
    }));
const json = async (res: Response) => (await res.json()) as Record<string, any>;

beforeEach(async () => {
    m = memAdmin(['u-admin']);
    keyText = TEXT1;
    clock = 0;
    await fill(m, await buildKeyRing(parseKeys(TEXT1)));
    m.state.kids = ['k1'];
    deps = {
        auth, store: m.store, keyText: () => keyText, allowedOrigin: ORIGIN,
        newEpoch: (() => { let n = 0; return () => `new${(n += 1)}`; })(),
        budget: { now: () => clock },
    };
    call = adminHandler(deps);
});

/** after 를 이어 부르며 끝까지 — 토막 목록을 돌려준다 */
async function rewrapAll(maxCalls = 50) {
    const slices: Record<string, any>[] = [];
    let after: string | null = null;
    for (let i = 0; i < maxCalls; i++) {
        const res = await req(`rewrap?confirm=rewrap${after ? `&after=${encodeURIComponent(after)}` : ''}`);
        expect(res.status).toBe(200);
        const s = await json(res);
        slices.push(s);
        if (s.next === null) return slices;
        after = s.next;
    }
    throw new Error('끝나지 않음');
}

describe('관리자만 · 확인 글', () => {
    it('토큰 없음 401 · 교사 403 not_admin · 모르는 길 404 · 방식 틀림 405', async () => {
        expect((await req('verify', 'GET', null)).status).toBe(401);
        const r = await req('verify', 'GET', 'teacher');
        expect(r.status).toBe(403);
        expect((await json(r)).error.code).toBe('not_admin');
        expect((await req('nope', 'GET')).status).toBe(404);
        expect((await req('rewrap', 'GET')).status).toBe(405);
    });
    it('상태를 바꾸는 길은 confirm 이 없으면 400 · 아무것도 안 바뀜', async () => {
        keyText = TEXT12;
        const r = await req('rewrap');
        expect(r.status).toBe(400);
        expect((await json(r)).error.code).toBe('confirm_required');
        expect((await req('bump-epoch?confirm=rewrap')).status).toBe(400);
        expect(m.epochs.get('p1')).toBe('ab12cd34');
        expect(m.state.swaps).toBe(0);
    });
    it('Origin 이 다르면 POST 403', async () => {
        const res = await call(new Request(`${base}/bump-epoch?confirm=bump-epoch`, { method: 'POST', headers: { Origin: 'https://evil', Authorization: 'Bearer admin' } }));
        expect(res.status).toBe(403);
    });
});

describe('verify — 6-1 검사 1~4', () => {
    it('통과 — 쓰기 키·키 목록·kids_in_use(값은 없다)', async () => {
        keyText = TEXT12;
        const b = await json(await req('verify', 'GET'));
        expect(b).toEqual({ ok: true, writeKid: 'k2', kids: ['k1', 'k2'], kidsInUse: ['k1'] });
        expect(JSON.stringify(b)).not.toContain(b64(7));
    });
    it('1 비밀 없음 · 2 줄꼴·길이 틀림 · 3 kids_in_use 에 없는 kid · 4 실제 열기 실패', async () => {
        keyText = undefined;
        expect(await json(await req('verify', 'GET'))).toEqual({ ok: false, check: 1 });
        keyText = 'k1:짧음';
        expect(await json(await req('verify', 'GET'))).toEqual({ ok: false, check: 2 });
        keyText = `k1:${btoa('x'.repeat(31))}`;
        expect((await json(await req('verify', 'GET'))).check).toBe(2);
        keyText = TEXT2_ONLY; // k1 줄을 지움 — kids_in_use 에 k1
        expect(await json(await req('verify', 'GET'))).toEqual({ ok: false, check: 3 });
        keyText = `k1:${b64(8)}`; // 같은 이름 다른 값
        expect(await json(await req('verify', 'GET'))).toEqual({ ok: false, check: 4 });
    });
    it('DB 가 비었으면 4 는 건너뛴다', async () => {
        for (const t of m.tables.values()) t.clear();
        expect((await json(await req('verify', 'GET'))).ok).toBe(true);
    });
});

describe('kids — 쓰이는 kid 건수', () => {
    it('끝까지 훑어 건수를 더한다(carry) · 읽기만이라 meta 안 바뀜', async () => {
        deps.budget.maxRows = 4;
        let after: string | null = null;
        let carry = '';
        let last: Record<string, any> = {};
        let calls = 0;
        do {
            last = await json(await req(`kids?${after ? `after=${encodeURIComponent(after)}&` : ''}carry=${carry}`, 'GET'));
            carry = Object.entries(last.counts).map(([k, n]) => `${k}:${n}`).join(',');
            after = last.next;
            calls += 1;
        } while (after !== null && calls < 20);
        expect(calls).toBeGreaterThan(1);
        expect(last.counts).toEqual({ k1: total(m) });
        expect(m.state.kids).toEqual(['k1']);
    });
    it('save=1(POST+confirm) 은 끝 토막에서 meta.kids_in_use 를 건수>0 인 kid 로 채운다', async () => {
        m.state.kids = [];
        const res = await req('kids?save=1&confirm=kids', 'POST');
        const b = await json(res);
        expect(b.next).toBeNull();
        expect(b.saved).toEqual(['k1']);
        expect(m.state.kids).toEqual(['k1']);
        expect((await req('kids?save=1', 'POST')).status).toBe(400);
    });
    it('꼴 틀린 after·carry 는 400', async () => {
        expect((await req('kids?after=zz', 'GET')).status).toBe(400);
        expect((await req('kids?carry=k1=3', 'GET')).status).toBe(400);
    });
});

describe('rewrap — 분할 · 평문 같음 · 옛 k1 0건', () => {
    it('상한을 작게 하면 여러 호출로 나뉘고 끝나면 k1 0건 · 평문 그대로 · 판 번호 그대로', async () => {
        keyText = TEXT12;
        deps.budget.maxRows = 3;
        deps.budget.page = 2;
        const before = total(m);
        const slices = await rewrapAll();
        expect(slices.length).toBeGreaterThan(1);
        expect(slices.every((s) => s.scanned <= 3)).toBe(true);
        expect(slices.reduce((n, s) => n + s.rewrapped, 0)).toBe(before);
        expect(kidCounts(m)).toEqual({ k2: before });
        // 새 키만 있는 열쇠고리로 전부 열어 평문 대조(옛 키 없이도 열림 = k1 0건)
        const ring2 = await buildKeyRing(parseKeys(TEXT2_ONLY));
        for (const t of m.tables.values()) for (const r of t.values()) expect(await openText(ring2, r.ct, r.aadFor)).toBe(r.plain);
        expect(m.tables.get('parts')!.get('p1/doc')!.version).toBe(4);
        expect(m.state.kids).toEqual(['k1', 'k2']); // 쓰기 키가 meta 에 더해짐
        // 다시 돌리면 할 일 없음
        const again = await rewrapAll();
        expect(again.reduce((n, s) => n + s.rewrapped, 0)).toBe(0);
        expect(again.reduce((n, s) => n + s.already, 0)).toBe(before);
    });
    it('한 호출 상한 상수 안에서 멈추고 next 를 준다', async () => {
        keyText = TEXT12;
        expect(REWRAP_MAX_ROWS).toBeLessThanOrEqual(500);
        deps.budget.maxRows = 2;
        const s = await json(await req('rewrap?confirm=rewrap'));
        expect(s.scanned).toBe(2);
        expect(typeof s.next).toBe('string');
        expect(decodeCursor(s.next)).not.toBeNull();
    });
    it('벽시계 예산을 넘기면 다음 쪽 앞에서 멈춘다', async () => {
        keyText = TEXT12;
        deps.budget = { now: () => (clock += 60_000), budgetMs: 100_000, page: 2 };
        call = adminHandler(deps);
        const s = await json(await req('rewrap?confirm=rewrap'));
        expect(s.scanned).toBeLessThan(total(m));
        expect(s.next).not.toBeNull();
    });
    it('그 사이 다른 쓰기가 있으면 건너뛰고(skipped) 덮지 않는다', async () => {
        keyText = TEXT12;
        m.state.beforeSwap = () => {
            m.state.beforeSwap = null;
            const row = m.tables.get('parts')!.get('p1/doc')!;
            row.ct = new Uint8Array(row.ct) as Bytes;
            row.ct[row.ct.length - 1] ^= 1;
        };
        const slices = await rewrapAll();
        expect(slices.reduce((n, s) => n + s.skipped, 0)).toBe(1);
    });
    it('열리지 않는 칸은 failed 에 이름만 적고 나머지는 계속한다', async () => {
        keyText = TEXT12;
        const row = m.tables.get('audit_log')!.get('a1')!;
        row.ct = new Uint8Array(row.ct) as Bytes;
        row.ct[row.ct.length - 1] ^= 1;
        const slices = await rewrapAll();
        const failed = slices.flatMap((s) => s.failed);
        expect(failed).toEqual(['audit_log/a1']);
        expect(slices.reduce((n, s) => n + s.rewrapped, 0)).toBe(total(m) - 1);
    });
    it('키 검사가 걸리면 503 key_check 로 멈추고 아무것도 안 바뀜', async () => {
        keyText = TEXT2_ONLY; // 검사 3
        const res = await req('rewrap?confirm=rewrap');
        expect(res.status).toBe(503);
        expect(await json(res)).toMatchObject({ error: { code: 'key_check', n: 3 } });
        expect(m.state.swaps).toBe(0);
    });
    it('커서 꼴', () => {
        expect(decodeCursor(null)).toEqual({ idx: 0, after: null });
        expect(decodeCursor(encodeCursor({ idx: 2, after: 'p1/doc' }))).toEqual({ idx: 2, after: 'p1/doc' });
        expect(decodeCursor('99:x')).toBeNull();
        expect(decodeCursor('abc')).toBeNull();
    });
});

describe('bump-epoch — 옛 ETag 는 parts PUT 에서 412', () => {
    function partsOver(epochs: Map<string, string>): PartsStore {
        const rows = new Map<string, PartRow>();
        return {
            epoch: async (pid) => epochs.get(pid) ?? null,
            list: async () => [],
            get: async (pid, part) => rows.get(`${pid}/${part}`) ?? null,
            insertFirst: async (pid, row) => {
                if (rows.has(`${pid}/${row.part}`)) return false;
                rows.set(`${pid}/${row.part}`, { ...row, version: 1 });
                return true;
            },
            update: async () => false,
            putArchive: async () => {},
        };
    }
    it('전 프로젝트 epoch 가 바뀌고 옛 ETag 로 PUT 하면 412 · 새 epoch 로는 통과', async () => {
        const ring = await buildKeyRing(parseKeys(TEXT1));
        const partsAuth = {
            auth: { getUser: async () => ({ data: { user: { id: 'u' } }, error: null }) },
            from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { roles: ['관리자'], active: true }, error: null }) }) }) }) }),
        } as unknown as AuthClient;
        const pcall = partsHandler({ auth: partsAuth, store: partsOver(m.epochs), keys: async () => ring, allowedOrigin: ORIGIN });
        const put = (etag: string) => pcall(new Request('https://ref.supabase.co/functions/v1/parts/projects/p1/parts/doc', {
            method: 'PUT', headers: { Authorization: 'Bearer admin', Origin: ORIGIN, 'If-Match': etag }, body: JSON.stringify({ fmt: 1, body: 1 }),
        }));
        const oldTag = `"${m.epochs.get('p1')}.0"`;
        const res = await req('bump-epoch?confirm=bump-epoch');
        expect(await json(res)).toEqual({ projects: 2 });
        expect(m.epochs.get('p1')).not.toBe('ab12cd34');
        expect(m.epochs.get('p2')).not.toBe('ef56ef56');
        expect(m.epochs.get('p1')).not.toBe(m.epochs.get('p2'));
        expect((await put(oldTag)).status).toBe(412);
        expect((await put(`"${m.epochs.get('p1')}.0"`)).status).toBe(200);
    });
});
