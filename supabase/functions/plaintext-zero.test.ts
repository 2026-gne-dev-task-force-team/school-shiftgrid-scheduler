// 평문 0 시험 — ④ 10절 · ① 16절 D6. 지어낸 「심은 이름」을 넣은 가짜 자료로 parts·sub·rooms 의 실패·성공 경로를 돌려,
// ① console.* 출력 ② 오류 응답(4xx·5xx) 본문 ③ 감사 행·저장 행(평문 열·암호문 바이트) 어디에도 그 이름이 안 나오는지 훑는다.
// 성공 응답 본문은 훑지 않는다 — 권한 있는 사용자에게 평문을 돌려주는 것이 그 응답의 일이다.
// ⛔ 실명 — 가짜 이름만 · 시험 키는 시험 안에서 만든다.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sealAudit, type DbAudit } from './_shared/audit.ts';
import type { AuthClient } from './_shared/auth.ts';
import { findPlanted } from './_shared/crypto-scope.ts';
import type { KeyRing } from './_shared/crypto/envelope.ts';
import { buildKeyRing, parseKeys } from './_shared/crypto/keys.ts';
import { partsHandler, type PartsDeps } from './parts/handler.ts';
import type { PartRow, PartsStore } from './parts/store.ts';
import { roomsHandler, type AuditEntry as RoomAudit, type RoomsContext, type RoomsData } from './rooms/handler.ts';
import { createRoomStore, type RoomDb, type RoomRow } from './rooms/store.ts';
import { subHandler, type DayResult, type SubDeps, type SubStore } from './sub/handler.ts';
import type { DbSlot } from './sub/rows.ts';

const ORIGIN = 'https://tt.example.org';
/** 심은 이름 — 이 낱말이 평문으로 어디선가 보이면 샌 것이다 */
const NAME = '심은이름-쿠키토끼';
const PLANTED = [NAME, '쿠키토끼'];

let ring: KeyRing;
beforeAll(async () => {
    ring = await buildKeyRing(parseKeys(`k1:${btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))}`));
});

// ── 훑는 장치 ────────────────────────────────────────────────

const consoleLines: string[] = [];
const errorBodies: string[] = [];
beforeEach(() => {
    consoleLines.length = 0;
    errorBodies.length = 0;
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
        vi.spyOn(console, m).mockImplementation((...a: unknown[]) => {
            consoleLines.push(a.map((x) => (x instanceof Error ? `${x.name}: ${x.message}\n${x.stack}` : typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
        });
    }
});
afterEach(() => vi.restoreAllMocks());

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
/** 바이트 열 안에 글자가 그대로 있나(암호문이 평문을 품으면 안 된다) */
const bytesHave = (b: Uint8Array, s: string) => Buffer.from(b).includes(Buffer.from(s, 'utf8'));

/** 응답을 받아 오류면 본문을 모아 둔다 */
async function seen(res: Response): Promise<{ status: number; json: any }> {
    const text = await res.text();
    if (res.status >= 400) errorBodies.push(text);
    return { status: res.status, json: text ? JSON.parse(text) : null };
}

/** 마지막 훑기 — console·오류 응답·저장 행·감사 행 */
function expectNoPlain(extra: { rows?: unknown[]; audits?: DbAudit[]; byteCols?: Uint8Array[] } = {}) {
    expect(findPlanted(consoleLines.join('\n'), PLANTED), 'console 출력').toEqual([]);
    expect(findPlanted(errorBodies.join('\n'), PLANTED), '오류 응답 본문').toEqual([]);
    for (const r of extra.rows ?? []) {
        expect(findPlanted(JSON.stringify(r, (_k, v) => (v instanceof Uint8Array ? hex(v) : v)), PLANTED), '저장 행 평문 열').toEqual([]);
    }
    for (const a of extra.audits ?? []) {
        expect(findPlanted(JSON.stringify({ ...a, body_ct: undefined }), PLANTED), '감사 평문 열').toEqual([]);
        expect(PLANTED.some((p) => bytesHave(a.body_ct, p)), '감사 암호문 바이트').toBe(false);
    }
    for (const b of extra.byteCols ?? []) expect(PLANTED.some((p) => bytesHave(b, p)), '암호문 바이트').toBe(false);
}

// ── parts ────────────────────────────────────────────────────

const EPOCH = 'ab12cd34';
function memPartsStore(): PartsStore & { rows: Map<string, PartRow> } {
    const rows = new Map<string, PartRow>();
    const k = (pid: string, part: string) => `${pid}/${part}`;
    return {
        rows,
        epoch: async () => EPOCH,
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

const partsAuth = (): AuthClient => ({
    auth: { getUser: async (jwt) => (jwt === 'admin' ? { data: { user: { id: 'u-admin' } }, error: null } : { data: { user: null }, error: { status: 401 } }) },
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { roles: ['관리자'], active: true }, error: null }) }) }) }) }),
});

describe('평문 0 — parts', () => {
    it('성공·실패 경로 전부(쓰기·읽기·판 충돌·잘못된 본문·검사 걸림·복호 실패)에서 심은 이름이 안 샌다', async () => {
        const store = memPartsStore();
        const audits: DbAudit[] = [];
        const deps: PartsDeps = {
            auth: partsAuth(), store, keys: async () => ring, allowedOrigin: ORIGIN, audit: { append: async (r) => void audits.push(r) },
            check: ({ part }) => (part === 'ops.settings' ? ['rule.x'] : []),
        };
        const call = partsHandler(deps);
        const base = 'https://ref.supabase.co/functions/v1/parts/projects/p1';
        const put = async (part: string, body: unknown, ifMatch = `"${EPOCH}.0"`, q = '') =>
            seen(await call(new Request(`${base}/parts/${encodeURIComponent(part)}${q}`, {
                method: 'PUT', headers: { Authorization: 'Bearer admin', Origin: ORIGIN, 'If-Match': ifMatch, 'Content-Type': 'application/json' },
                body: typeof body === 'string' ? body : JSON.stringify(body),
            })));
        const get = async () => seen(await call(new Request(base, { method: 'GET', headers: { Authorization: 'Bearer admin' } })));

        expect((await put('doc', { fmt: 1, body: { teacher: NAME, reason: NAME } })).status).toBe(200); // 성공
        expect((await put('doc', { fmt: 1, body: { teacher: NAME } }, `"${EPOCH}.0"`)).status).toBe(412); // 판 충돌
        expect((await put('doc', `{"fmt":1,"body":"${NAME}"`, `"${EPOCH}.1"`)).status).toBe(400); // 깨진 JSON(이름이 본문에 있음)
        expect((await put('doc', { fmt: 7, body: NAME }, `"${EPOCH}.1"`)).status).toBe(400); // fmt 불일치
        expect((await put('ops.settings', { fmt: 1, body: NAME })).status).toBe(400); // 검사 걸림
        expect((await put(NAME, { fmt: 1, body: NAME })).status).toBe(404); // 모르는 조각 이름이 주소에
        expect((await put('doc', { fmt: 1, body: NAME }, `"${EPOCH}.1"`, '?archive=1')).status).toBe(200); // 보관 쓰기
        expect((await get()).status).toBe(200); // 읽기 성공
        const doc = store.rows.get('p1/doc')!;
        doc.ct = new Uint8Array(doc.ct.map((x, i) => (i === doc.ct.length - 3 ? x ^ 1 : x))); // 암호문 한 바이트 깨기
        expect((await get()).json.error.code).toBe('decrypt_failed'); // 복호 실패
        expect((await put('doc', { fmt: 1, body: NAME }, `"${EPOCH}.2"`, '?archive=1')).status).toBe(500); // 보관 쓰기 중 옛 판 복호 실패
        expectNoPlain({
            rows: [...store.rows.values()].map((r) => ({ part: r.part, version: r.version, sizePlain: r.sizePlain })),
            byteCols: [...store.rows.values()].map((r) => r.ct),
            audits,
        });
        expect(audits).toHaveLength(2); // 성공한 쓰기 둘(첫 쓰기 · 보관 쓰기)만 감사
    });
});

// ── sub ──────────────────────────────────────────────────────

const DAY: DayResult = {
    ok: true,
    tracks: [{ name: '1-1', grade: 1, lessons: [{ startMin: 540, endMin: 585, subject: '국어', coIds: [] }] }],
    people: [{ id: 'agent:a', name: `${NAME}-전담`, kind: '전담' }],
};

function subStore(): SubStore & { rows: DbSlot[] } {
    const rows: DbSlot[] = [];
    return {
        rows,
        listRange: async (pid, from, to) => rows.filter((r) => r.project_id === pid && r.date >= from && r.date <= to),
        register: async (add, replace) => {
            for (const r of replace) {
                const i = rows.findIndex((x) => x.id === r.id && x.updated_at === r.updatedAt);
                if (i < 0) return 'conflict';
                rows.splice(i, 1);
            }
            rows.push(...add);
            return 'ok';
        },
        remove: async (pid, id, expect) => {
            const i = rows.findIndex((x) => x.project_id === pid && x.id === id && x.updated_at === expect.updatedAt);
            if (i < 0) return 'conflict';
            rows.splice(i, 1);
            return 'ok';
        },
        get: async (pid, id) => rows.find((r) => r.project_id === pid && r.id === id) ?? null,
        update: async () => 'conflict',
    };
}

describe('평문 0 — sub', () => {
    it('등록·덮기 거절·삭제(감사)·잘못된 입력·복호 실패에서 심은 이름·사유가 안 샌다', async () => {
        const store = subStore();
        const audits: DbAudit[] = [];
        const auth: AuthClient = {
            auth: { getUser: async (jwt) => ({ data: { user: jwt === 'tokA' ? { id: 'u-a' } : null }, error: null }) },
            from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { roles: ['교사', '관리자'], active: true }, error: null }) }) }) }) }),
        };
        let n = 0;
        const deps: SubDeps = {
            auth, store, audit: { append: async (r) => { audits.push(r); } }, ring: async () => ring,
            loadDay: async () => DAY, loadJudge: async () => ({ ok: false, offReason: '시험' }),
            memberInfo: async () => ({ personRef: null, name: `${NAME}-등록자` }),
            clock: () => new Date('2026-11-16T23:59:00Z'), newId: () => `s${++n}`, allowedOrigin: ORIGIN,
        };
        const h = subHandler(deps);
        const call = async (method: string, path: string, body?: unknown) =>
            seen(await h(new Request(`https://ref.supabase.co/functions/v1/sub/projects/p1/${path}`, {
                method, headers: { Authorization: 'Bearer tokA', Origin: ORIGIN, 'Content-Type': 'application/json' },
                body: body === undefined ? undefined : JSON.stringify(body),
            })));
        const reg = (over: Record<string, unknown> = {}) => ({ date: '2026-11-17', absentRef: 'homeroom:1-1', allDay: true, reason: NAME, memo: NAME, ...over });

        expect((await call('POST', 'register', reg())).status).toBe(200); // 성공(사유·메모에 이름)
        expect((await call('POST', 'register', reg())).status).toBe(409); // 덮기 필요
        expect((await call('POST', 'register', reg({ date: '2026-11-16' }))).status).toBe(400); // 지난 날
        expect((await call('POST', 'register', reg({ reason: NAME + 'x'.repeat(100) }))).status).toBe(400); // 사유 길이
        expect((await call('POST', 'register', reg({ absentRef: NAME }))).status).toBeGreaterThanOrEqual(400); // 모르는 결근자
        expect((await call('GET', `list?from=2026-11-17&to=${encodeURIComponent(NAME)}`)).status).toBe(400); // 잘못된 기간
        expect((await call('GET', 'list?from=2026-11-17&to=2026-11-17')).status).toBe(200); // 읽기 성공
        const rowsBefore = store.rows.map((r) => ({ ...r }));
        store.rows[0] = { ...store.rows[0], body_ct: new Uint8Array(store.rows[0].body_ct.map((x, i) => (i === 20 ? x ^ 1 : x))) };
        expect((await call('GET', 'list?from=2026-11-17&to=2026-11-17')).status).toBe(500); // 복호 실패
        store.rows[0] = rowsBefore[0];
        expect((await call('DELETE', rowsBefore[0].id, { confirm: true })).status).toBe(200); // 삭제 → 감사
        expect(audits).toHaveLength(1);
        expectNoPlain({
            rows: rowsBefore.map(({ body_ct: _b, take_ct: _t, ...plain }) => plain),
            byteCols: rowsBefore.map((r) => r.body_ct),
            audits,
        });
    });
});

// ── rooms ────────────────────────────────────────────────────

describe('평문 0 — rooms', () => {
    it('예약·정원 참·취소(감사)·모르는 방에서 심은 이름·메모가 안 샌다', async () => {
        const rows: RoomRow[] = [];
        const db: RoomDb = {
            async select(pid, q) {
                const data = rows.filter((r) => r.project_id === pid && (q.id === undefined || r.id === q.id)
                    && (q.from === undefined || r.date >= q.from) && (q.to === undefined || r.date <= q.to));
                return { data: data.map((r) => ({ ...r })), error: null };
            },
            async insert(row) {
                const dup = rows.some((r) => r.room_id === row.room_id && r.date === row.date && r.start_min === row.start_min && r.slot_no === row.slot_no);
                if (dup) return { error: { code: '23505', message: 'duplicate key value violates unique constraint "rr_slot_uq"', details: null } };
                rows.push({ ...row });
                return { error: null };
            },
            async delete(pid, id) {
                const i = rows.findIndex((r) => r.project_id === pid && r.id === id);
                if (i >= 0) rows.splice(i, 1);
                return { count: i >= 0 ? 1 : 0, error: null };
            },
        };
        const store = createRoomStore(db, ring);
        const data: RoomsData = { rooms: [{ id: 'r1', name: 'r1', capacity: 1, resourceKey: null, active: true, sort: 0, note: '' }], fixed: [], blocks: [] };
        const context: RoomsContext = {
            data: async () => data,
            day: async () => ({ schoolDay: true, times: [{ startMin: 540, endMin: 590 }], resourceCells: [] }),
            timeLabels: async () => [{ startMin: 540, endMin: 590, labels: ['1교시'] }],
            userName: async () => `${NAME}-예약자`,
        };
        const auth: AuthClient = {
            auth: { getUser: async (jwt) => (jwt.startsWith('jwt-') ? { data: { user: { id: jwt.slice(4) } }, error: null } : { data: { user: null }, error: {} }) },
            from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { roles: ['교사', '관리자'], active: true }, error: null }) }) }) }) }),
        };
        const entries: RoomAudit[] = [];
        let n = 0;
        const h = roomsHandler({
            allowedOrigin: ORIGIN, auth, store, context, clock: () => new Date('2026-11-17T01:00:00Z'), newId: () => `id${++n}`,
            audit: async (e) => { entries.push(e); },
        });
        const call = async (method: string, path: string, body?: unknown) =>
            seen(await h(new Request(`https://x.supabase.co/functions/v1/rooms/projects/p1${path}`, {
                method, headers: { Authorization: 'Bearer jwt-ua', Origin: ORIGIN, 'Content-Type': 'application/json' },
                body: body === undefined ? undefined : JSON.stringify(body),
            })));
        const reserve = (room: string, over: Record<string, unknown> = {}) =>
            call('POST', `/${encodeURIComponent(room)}/reserve`, { date: '2026-11-18', startMin: 540, trackName: '3-1', note: NAME, ...over });

        expect((await reserve('r1')).status).toBe(201); // 성공(메모에 이름)
        expect((await reserve('r1', { trackName: '3-2' })).status).toBe(409); // 정원 참
        expect((await reserve(NAME)).status).toBeGreaterThanOrEqual(400); // 모르는 방(이름이 주소에)
        expect((await reserve('r1', { trackName: NAME.repeat(30) })).status).toBeGreaterThanOrEqual(400); // 이상한 입력
        expect((await call('GET', '/mine')).status).toBe(200); // 읽기 성공
        expect((await call('DELETE', '/reservations/' + encodeURIComponent('zz-' + NAME))).status).toBeGreaterThanOrEqual(400); // 없는 예약
        const rowsBefore = rows.map((r) => ({ ...r }));
        expect((await call('DELETE', '/reservations/id1')).status).toBe(200); // 취소 → 감사
        expect(entries).toHaveLength(1);
        const sealed = await sealAudit(ring, {
            projectId: 'p1', id: 'a1', at: '2026-11-17T01:00:00.000Z', module: entries[0].module, action: entries[0].action,
            target: entries[0].target, body: { actorUserId: entries[0].actorUserId, before: entries[0].before, after: null, note: null },
        });
        expectNoPlain({ rows: rowsBefore.map(({ body_ct: _b, ...plain }) => plain), byteCols: rowsBefore.map((r) => r.body_ct), audits: [sealed] });
    });
});
