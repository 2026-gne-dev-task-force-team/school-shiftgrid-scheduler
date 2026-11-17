// T-10e0: 그날 입력 연결 — 가짜 supabase(parts 표) + 실제 봉투로 싼 작은 doc 픽스처 → loadDay·loadJudge → claim.
// ⛔ 실명 — 가짜 이름만.
import { beforeAll, describe, expect, it } from 'vitest';
import type { AuthClient } from '../_shared/auth.ts';
import { byteaToHex, openPartBody, sealPart, type PartsReadDb } from '../_shared/doc.ts';
import type { Bytes, KeyRing } from '../_shared/crypto/envelope.ts';
import { buildKeyRing, parseKeys } from '../_shared/crypto/keys.ts';
import { auxOn, calendarOn, dayIndexOf, dayLoader, gridDay, SIDE_PARTS } from './day.ts';
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

type CtRow = { version: number; ct: Bytes };
/** 가짜 supabase — `from('parts').select().eq().eq().maybeSingle()` 만. 연 횟수를 센다(전체 `reads` · 조각별 `by`). */
function fakeDb(row: CtRow | null, side: Record<string, CtRow> = {}): PartsReadDb & { reads: number; by: Record<string, number> } {
    const db = {
        reads: 0,
        by: {} as Record<string, number>,
        from(table: string) {
            if (table !== 'parts') throw new Error(table);
            db.reads++;
            const f: Record<string, string> = {};
            const q = {
                select: () => q,
                eq: (c: string, v: string) => ((f[c] = v), q),
                maybeSingle: async () => {
                    db.by[f.part] = (db.by[f.part] ?? 0) + 1;
                    const r = f.project_id !== PID ? null : f.part === 'doc' ? row : side[f.part] ?? null;
                    return { data: r ? { part: f.part, version: r.version, size_plain: 0, ct: byteaToHex(r.ct) } : null, error: null };
                },
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

/** index.ts 와 같은 묶음 — 요청마다 새 dayLoader(openPartBody) */
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
    const h = (req: Request) => subHandler({ ...base, ...dayLoader((pid, part) => openPartBody('sub', ring, db, pid, part)) })(req);
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
        expect(db.reads).toBe(1 + SIDE_PARTS.length);
        const ok = await call('tokB', 'POST', `${id}/claim`);
        expect(ok.status).toBe(200);
        expect(ok.json.row).toMatchObject({ status: '확정', take: { takerRef: 'a2' } });
    });
    it('assign 은 loadDay·loadJudge 둘 다 부르지만 doc·곁 조각은 한 요청에 조각마다 한 번만 연다', async () => {
        const db = fakeDb({ version: 3, ct: docCt }, await sealSide({ 'ops.calendar': [], 'ops.changes': [], 'ops.fixed': [], 'ops.classSubjects': [], 'ops.aux': {} }));
        const call = setup(db);
        const id = (await call('tokB', 'POST', 'register', reg)).json.rows[0].id;
        db.reads = 0;
        db.by = {};
        const a = await call('tokM', 'POST', `${id}/assign`, { personId: 'a2', confirm: true });
        expect(a.status).toBe(200);
        expect(db.by).toEqual({ doc: 1, 'ops.calendar': 1, 'ops.changes': 1, 'ops.fixed': 1, 'ops.classSubjects': 1, 'ops.aux': 1 });
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

/** 곁 조각을 실제 봉투로 싼다(판 번호 1) */
async function sealSide(parts: Record<string, unknown>): Promise<Record<string, CtRow>> {
    const out: Record<string, CtRow> = {};
    for (const [part, body] of Object.entries(parts)) out[part] = { version: 1, ct: await sealPart(ring, PID, part, 1, { fmt: 1, body }) };
    return out;
}

describe('T-10e1 곁 조각 — calendar·changes·fixed·classSubjects·aux', () => {
    it('휴일 조각에 그날이 있으면 400 no_school_day · 덮지 않는 날은 그대로', async () => {
        const side = await sealSide({
            'ops.calendar': [{ id: 'e1', startDate: '2026-11-17', endDate: '2026-11-17', kind: '개교기념일', targetKind: 'all', targetValue: '' }],
        });
        const call = setup(fakeDb({ version: 3, ct: docCt }, side));
        const off = await call('tokB', 'GET', 'reg-options?date=2026-11-17');
        expect(off.status).toBe(400);
        expect(off.json.error.code).toBe('no_school_day');
        expect(off.json.error.message).toContain('개교기념일');
        expect((await call('tokB', 'GET', 'reg-options?date=2026-11-18')).status).toBe(200);
    });

    it('changes: 반 전체 없음(period null)이면 그 반 수업이 빠져 claim 판정이 바뀐다', async () => {
        // a1 은 화요일 1-2 1교시(540) 수업 중 → 1-1 1교시 보결 claim 이 why_not. 1-2 가 그날 수업 없음이면 비어 성공.
        const plain = setup(fakeDb({ version: 3, ct: docCt }));
        const id0 = (await plain('tokB', 'POST', 'register', reg)).json.rows[0].id;
        expect((await plain('tokA', 'POST', `${id0}/claim`)).json.error.code).toBe('why_not');

        const side = await sealSide({ 'ops.changes': [{ id: 'c1', date: '2026-11-17', trackName: '1-2', period: null, activityName: '' }] });
        const call = setup(fakeDb({ version: 3, ct: docCt }, side));
        const id = (await call('tokB', 'POST', 'register', reg)).json.rows[0].id;
        const ok = await call('tokA', 'POST', `${id}/claim`);
        expect(ok.status).toBe(200);
        expect(ok.json.row).toMatchObject({ status: '확정', take: { takerRef: 'a1' } });
    });

    it('changes: 교시 과목 변경이 그 반 N교시 과목에 · 다른 날 줄은 무시', async () => {
        const side = await sealSide({
            'ops.changes': [
                { id: 'c1', date: '2026-11-17', trackName: '1-1', period: 2, activityName: '체육' },
                { id: 'c2', date: '2026-11-18', trackName: '1-1', period: 1, activityName: '미술' },
            ],
        });
        const db = fakeDb({ version: 3, ct: docCt }, side);
        const d = await dayLoader((pid, part) => openPartBody('sub', ring, db, pid, part)).loadDay(PID, '2026-11-17');
        expect(d.ok && d.tracks[0].lessons.map((l) => l.subject)).toEqual([null, '체육']);
    });

    it('fixed 조각은 busy 로 · aux 없으면 null(partial) · 있으면 그날 배정', async () => {
        const side = await sealSide({ 'ops.fixed': [{ id: 'f1', personRef: 'a2', dayIndex: 1, startMin: 540, endMin: 580, reason: '회의' }] });
        const db = fakeDb({ version: 3, ct: docCt }, side);
        const j = await dayLoader((pid, part) => openPartBody('sub', ring, db, pid, part)).loadJudge(PID, '2026-11-17', []);
        expect(j.ok && j.input.busy).toEqual([{ personId: 'a2', startMin: 540, endMin: 580, reason: '회의' }]);
        expect(auxOn(null, '2026-11-17', 1)).toBeNull();
        const aux = {
            staff: [{ id: 's1', name: '보조01', active: true }, { id: 's2', name: '보조02', active: true }],
            base: [{ id: 's1:1:540', staffId: 's1', dow: 1, startMin: 540, endMin: 580, classKey: '1-1' }],
            day: [{ id: 'd', staffId: 's2', date: '2026-11-17', startMin: 590, endMin: 630, classKey: '', source: 'none' }],
            exceptions: [],
        };
        expect(auxOn(aux, '2026-11-17', 1)).toEqual([
            { auxId: 's1', name: '보조01', slots: [{ trackName: '1-1', startMin: 540, endMin: 580, status: 'ok' }] },
            { auxId: 's2', name: '보조02', slots: [{ trackName: null, startMin: 590, endMin: 630, status: 'none' }] },
        ]);
        expect(calendarOn([{ id: 'e', date: '2026-11-16', endDate: '2026-11-18', kind: 'all', title: '휴업' }], '2026-11-17')).toEqual([
            { kind: '휴업', targetKind: 'all', targetValue: '' },
        ]);
    });
});

describe('D1 그날 입력 조립 순서 0~⑦ · partial aux (설계 ① 10절)', () => {
    const load = (side: Record<string, CtRow>) => {
        const db = fakeDb({ version: 3, ct: docCt }, side);
        return dayLoader((pid, part) => openPartBody('sub', ring, db, pid, part));
    };
    const slot = { absentId: 'a1', allDay: false, startMin: 590, endMin: 630, status: '확정', takerId: 'a2', trackName: '1-1' } as never;

    it('0 시간표 → ② busy → ③ absent·taken → ④ 반 비움 → ⑤ 빈 과목만 → ⑥ 덮기 → ⑦ 남은 수업에만 보조', async () => {
        const side = await sealSide({
            'ops.fixed': [{ id: 'f1', personRef: 'a2', dayIndex: 1, startMin: 540, endMin: 580, reason: '회의' }],
            'ops.changes': [
                { id: 'c1', date: '2026-11-17', trackName: '1-2', period: null, activityName: '' }, // ④ 1-2 통째 없음
                { id: 'c2', date: '2026-11-17', trackName: '1-1', period: 2, activityName: '체육' }, // ⑥ 음악 → 체육
                { id: 'c3', date: '2026-11-17', trackName: '1-2', period: 1, activityName: '미술' }, // ④ 뒤라 닿을 수업이 없다
            ],
            'ops.classSubjects': [
                { id: 'k1', trackName: '1-1', dayIndex: 1, startMin: 540, subject: '국어' }, // ⑤ 빈 과목 채움
                { id: 'k2', trackName: '1-1', dayIndex: 1, startMin: 590, subject: '수학' }, // ⑤ 이미 과목 있음 → 그대로(⑥ 이 덮음)
            ],
            'ops.aux': {
                staff: [{ id: 's1', name: '보조01', active: true }, { id: 's2', name: '보조02', active: true }],
                base: [
                    { id: 's1:1:540', staffId: 's1', dow: 1, startMin: 540, endMin: 580, classKey: '1-1' },
                    { id: 's2:1:540', staffId: 's2', dow: 1, startMin: 540, endMin: 580, classKey: '1-2' },
                ],
                day: [],
                exceptions: [],
            },
        });
        const j = await load(side).loadJudge(PID, '2026-11-17', [slot]);
        if (!j.ok) throw new Error('거부됨');
        const [t11, t12] = ['1-1', '1-2'].map((n) => j.input.tracks.find((t) => t.name === n)!);
        expect(j.input.busy).toEqual([{ personId: 'a2', startMin: 540, endMin: 580, reason: '회의' }]); // ②
        expect(j.input.absent).toContainEqual({ personId: 'a1', startMin: 590, endMin: 630 }); // ③
        expect(j.input.taken).toEqual([{ personId: 'a2', startMin: 590, endMin: 630, trackName: '1-1' }]); // ③
        expect(t12.lessons).toEqual([]); // ④
        expect(j.input.absent).toContainEqual({ personId: 'homeroom:1-2', startMin: null, endMin: null }); // ④
        expect(t11.lessons.map((l) => l.subject)).toEqual(['국어', '체육']); // ⑤ → ⑥
        expect(t11.lessons.map((l) => l.coIds)).toEqual([['aux:s1'], []]); // ⑦ 1-2 는 비어 붙을 곳이 없다
        expect('partial' in j && j.partial).toEqual([]);
    });

    it('aux 조각이 없으면 빼고 계산하되 loadDay·loadJudge 결과에 partial:["aux"]', async () => {
        const c = load({});
        const d = await c.loadDay(PID, '2026-11-17');
        const j = await c.loadJudge(PID, '2026-11-17', []);
        expect(d.ok && 'partial' in d && d.partial).toEqual(['aux']);
        expect(j.ok && 'partial' in j && j.partial).toEqual(['aux']);
        expect(j.ok && j.input.tracks.flatMap((t) => t.lessons.flatMap((l) => l.coIds))).toEqual([]);
    });

    it('aux 조각이 있으면 partial 은 빈 목록 · 쉬는 날은 partial 자리가 없다', async () => {
        const c = load(await sealSide({ 'ops.aux': { staff: [], base: [], day: [], exceptions: [] } }));
        const d = await c.loadDay(PID, '2026-11-17');
        expect(d.ok && 'partial' in d && d.partial).toEqual([]);
        expect(await c.loadDay(PID, '2026-11-14')).toEqual({ ok: false, offReason: '주말' });
    });
});
