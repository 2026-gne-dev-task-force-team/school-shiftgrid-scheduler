// T-10e0: 그날 입력 연결 — 가짜 supabase(parts 표) + 실제 봉투로 싼 작은 doc 픽스처 → loadDay·loadJudge → claim.
// ⛔ 실명 — 가짜 이름만.
import { beforeAll, describe, expect, it } from 'vitest';
import type { AuthClient } from '../_shared/auth.ts';
import { byteaToHex, openDocBody, sealPart, type PartsReadDb } from '../_shared/doc.ts';
import type { Bytes, KeyRing } from '../_shared/crypto/envelope.ts';
import { buildKeyRing, parseKeys } from '../_shared/crypto/keys.ts';
import { dayIndexOf, dayLoader, gridDay } from './day.ts';
import { subHandler, type SubDeps, type SubStore } from './handler.ts';
import type { DbSlot } from './rows.ts';

const ORIGIN = 'https://tt.example.org';
const PID = 'p1';
const CLOCK = () => new Date('2026-11-16T23:59:00Z'); // 서울 2026-11-17(화)

const MEMBERS: Record<string, { roles: string[]; personRef: string | null; name: string }> = {
    tokA: { roles: ['교사'], personRef: 'a1', name: '가전담' },
    tokB: { roles: ['교사'], personRef: 'a2', name: '나전담' },
    tokM: { roles: ['교무'], personRef: null, name: '다교무' },
};
const uid = (t: string) => `u-${t}`;

/** 시간표 v3 꼴 — 1-1·1-2(같은 틀) · a1 은 화요일 1-1 2교시·1-2 1교시 전담 · a2 는 화요일 수업 없음 */
const DOC = {
    meta: { schemaVersion: 3 },
    agents: [{ id: 'a1', name: '가전담', role: '전담' }, { id: 'a2', name: '나전담', role: '전담' }, { id: 'n1', name: '라사서', role: '비교과' }],
    activities: [{ id: 'm', name: '음악' }],
    specs: [{ id: 's1', slots: [
        { index: 0, label: '1교시', start: '09:00', end: '09:40', assignable: true, kind: 'lesson' },
        { index: 1, label: '2교시', start: '09:50', end: '10:30', assignable: true, kind: 'lesson' },
        { index: 2, label: '점심', start: '12:10', end: '13:00', assignable: false, kind: 'lunch' },
    ] }],
    tracks: [{ id: 't1', name: '1-1', specId: 's1', grade: 1 }, { id: 't2', name: '1-2', specId: 's1', grade: 1 }],
    assignments: [
        { trackId: 't1', dayIndex: 1, slotIndex: 1, agentId: 'a1', activityId: 'm' },
        { trackId: 't2', dayIndex: 1, slotIndex: 0, agentId: 'a1', activityId: 'm' },
    ],
    weeklyBlocks: [],
};

let ring: KeyRing;
let docCt: Bytes;
beforeAll(async () => {
    const raw = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
    ring = await buildKeyRing(parseKeys(`k1:${raw}`));
    docCt = await sealPart(ring, PID, 'doc', 3, { fmt: 1, body: DOC });
});

/** 가짜 supabase — `from('parts').select().eq().eq().maybeSingle()` 만. 연 횟수를 센다. */
function fakeDb(row: { version: number; ct: Bytes } | null): PartsReadDb & { reads: number } {
    const db = {
        reads: 0,
        from(table: string) {
            if (table !== 'parts') throw new Error(table);
            db.reads++;
            const f: Record<string, string> = {};
            const q = {
                select: () => q,
                eq: (c: string, v: string) => ((f[c] = v), q),
                maybeSingle: async () => ({
                    data: row && f.project_id === PID && f.part === 'doc' ? { part: 'doc', version: row.version, size_plain: 0, ct: byteaToHex(row.ct) } : null,
                    error: null,
                }),
            };
            return q;
        },
    };
    return db;
}

function fakeAuth(): AuthClient {
    return {
        auth: { getUser: async (jwt) => ({ data: { user: MEMBERS[jwt] ? { id: uid(jwt) } : null }, error: null }) },
        from: () => ({
            select: () => ({
                eq: (_c: string, pid: string) => ({
                    eq: (_c2: string, u: string) => ({
                        maybeSingle: async () => {
                            const tok = Object.keys(MEMBERS).find((t) => uid(t) === u);
                            return { data: pid === PID && tok ? { roles: MEMBERS[tok].roles, active: true } : null, error: null };
                        },
                    }),
                }),
            }),
        }),
    };
}

function fakeStore(): SubStore {
    const rows: DbSlot[] = [];
    return {
        listRange: async (pid, from, to) => rows.filter((r) => r.project_id === pid && r.date >= from && r.date <= to).sort((a, b) => a.start_min - b.start_min),
        async register(add) {
            rows.push(...add);
            return 'ok';
        },
        get: async (pid, id) => rows.find((r) => r.project_id === pid && r.id === id) ?? null,
        async update(next, expect) {
            const i = rows.findIndex((x) => x.id === next.id && x.updated_at === expect.updatedAt && x.status === expect.status);
            if (i < 0) return 'conflict';
            rows[i] = { ...rows[i], status: next.status, take_ct: next.take_ct, updated_at: next.updated_at };
            return 'ok';
        },
        remove: async () => 'ok',
    };
}

/** index.ts 와 같은 묶음 — 요청마다 새 dayLoader(openDocBody) */
function setup(db: PartsReadDb) {
    let n = 0;
    const base: Omit<SubDeps, 'loadDay' | 'loadJudge'> = {
        auth: fakeAuth(), store: fakeStore(), audit: { append: async () => {} }, ring: async () => ring,
        memberInfo: async (_p, u) => {
            const tok = Object.keys(MEMBERS).find((t) => uid(t) === u) ?? '';
            return { personRef: MEMBERS[tok]?.personRef ?? null, name: MEMBERS[tok]?.name ?? '' };
        },
        clock: CLOCK, newId: () => `s${++n}`, allowedOrigin: ORIGIN,
    };
    const h = (req: Request) => subHandler({ ...base, ...dayLoader((pid) => openDocBody(ring, db, pid)) })(req);
    return async (tok: string, method: string, path: string, body?: unknown) => {
        const res = await h(new Request(`https://ref.supabase.co/functions/v1/sub/projects/${PID}/${path}`, {
            method, headers: { Authorization: `Bearer ${tok}`, Origin: ORIGIN, 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
        }));
        return { status: res.status, json: (await res.json()) as Record<string, any> };
    };
}

const reg = { date: '2026-11-17', absentRef: 'homeroom:1-1', allDay: true, reason: '출장', memo: '' };

describe('그날 입력 — doc → 반·수업', () => {
    it('요일 번호 0=월 · 화요일 1-1 은 담임 1교시 + 음악 2교시(a1)', () => {
        expect(dayIndexOf('2026-11-17')).toBe(1);
        expect(dayIndexOf('2026-11-22')).toBe(6);
        const g = gridDay(DOC, 1);
        expect(g.tracks[0]).toEqual({
            name: '1-1', grade: 1, lunch: { startMin: 730, endMin: 780 },
            lessons: [
                { startMin: 540, endMin: 580, subject: null, teacherIds: [], coIds: [] },
                { startMin: 590, endMin: 630, subject: '음악', teacherIds: ['a1'], coIds: [] },
            ],
        });
        expect(g.people.map((p) => p.kind)).toEqual(['전담', '전담', '비교과']);
    });
});

describe('sub + 실제 doc 봉투', () => {
    it('reg-options·register 가 doc 으로 돈다 · claim: 수업 중이면 400 why_not · 빈 전담은 성공', async () => {
        const db = fakeDb({ version: 3, ct: docCt });
        const call = setup(db);
        const opt = await call('tokB', 'GET', 'reg-options?date=2026-11-17');
        expect(opt.status).toBe(200);
        expect(opt.json.absentees.map((x: any) => x.id)).toEqual(['homeroom:1-1', 'homeroom:1-2', 'a1', 'a2']);
        const r = await call('tokB', 'POST', 'register', reg);
        expect(r.status).toBe(200);
        expect(r.json.rows.map((x: any) => [x.trackName, x.startMin])).toEqual([['1-1', 540]]);
        const id = r.json.rows[0].id;

        db.reads = 0;
        const no = await call('tokA', 'POST', `${id}/claim`);
        expect(no.status).toBe(400);
        expect(no.json.error.code).toBe('why_not');
        expect(db.reads).toBe(1);
        const ok = await call('tokB', 'POST', `${id}/claim`);
        expect(ok.status).toBe(200);
        expect(ok.json.row).toMatchObject({ status: '확정', take: { takerRef: 'a2' } });
    });
    it('assign 은 loadDay·loadJudge 둘 다 부르지만 doc 은 한 요청에 한 번만 연다', async () => {
        const db = fakeDb({ version: 3, ct: docCt });
        const call = setup(db);
        const id = (await call('tokB', 'POST', 'register', reg)).json.rows[0].id;
        db.reads = 0;
        const a = await call('tokM', 'POST', `${id}/assign`, { personId: 'a2', confirm: true });
        expect(a.status).toBe(200);
        expect(db.reads).toBe(1);
    });
    it('주말은 400 no_school_day', async () => {
        const call = setup(fakeDb({ version: 3, ct: docCt }));
        const r = await call('tokB', 'GET', 'reg-options?date=2026-11-21');
        expect(r.status).toBe(400);
        expect(r.json.error.code).toBe('no_school_day');
    });
    it('doc 조각이 없으면 503 day_unavailable 그대로', async () => {
        const call = setup(fakeDb(null));
        const r = await call('tokB', 'GET', 'reg-options?date=2026-11-17');
        expect(r.status).toBe(503);
        expect(r.json.error.code).toBe('day_unavailable');
    });
    it('복호 실패(판 번호가 AAD 와 다름 · 바이트 깨짐)는 500 decrypt_failed', async () => {
        const wrongVer = await setup(fakeDb({ version: 4, ct: docCt }))('tokB', 'GET', 'reg-options?date=2026-11-17');
        expect(wrongVer.status).toBe(500);
        expect(wrongVer.json.error.code).toBe('decrypt_failed');
        const bad = new Uint8Array(docCt);
        bad[bad.length - 1] ^= 1;
        const broken = await setup(fakeDb({ version: 3, ct: bad }))('tokB', 'GET', 'reg-options?date=2026-11-17');
        expect(broken.status).toBe(500);
        expect(broken.json.error.code).toBe('decrypt_failed');
    });
});
