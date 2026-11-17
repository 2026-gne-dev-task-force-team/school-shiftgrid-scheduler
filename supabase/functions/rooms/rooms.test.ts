import { beforeAll, describe, expect, it } from 'vitest';
import type { Reservation, Room } from '../../../shared/room-rules.ts';
import type { AuthClient } from '../_shared/auth.ts';
import { buildKeyRing, parseKeys } from '../_shared/crypto/keys.ts';
import type { KeyRing } from '../_shared/crypto/envelope.ts';
import { reserveFailureCode, roomsHandler, type AuditEntry, type RoomsContext, type RoomsData } from './handler.ts';
import { classifyInsertError, createRoomStore, type DbError, type RoomDb, type RoomRow } from './store.ts';

const ORIGIN = 'https://tt.example.org';
const PID = 'p1';
const NOW = new Date('2026-11-17T01:00:00Z'); // 서울 2026-11-17(화) 10:00
const TODAY = '2026-11-17';
const TOMORROW = '2026-11-18';

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
let ring: KeyRing;
beforeAll(async () => {
    ring = await buildKeyRing(parseKeys(`k1:${b64(crypto.getRandomValues(new Uint8Array(32)))}`));
});

/** Postgres 흉내 — 유일 제약 둘을 지키고 위반이면 23505 + 제약 이름 */
function fakeDb(): RoomDb & { rows: RoomRow[]; inserts: number } {
    const rows: RoomRow[] = [];
    const db = {
        rows,
        inserts: 0,
        async select(projectId: string, q: { from?: string; to?: string; id?: string }) {
            const data = rows.filter((r) => r.project_id === projectId && (q.id === undefined || r.id === q.id)
                && (q.from === undefined || r.date >= q.from) && (q.to === undefined || r.date <= q.to));
            return { data: data.map((r) => ({ ...r })), error: null };
        },
        async insert(row: RoomRow) {
            db.inserts++;
            const same = (r: RoomRow) => r.project_id === row.project_id && r.room_id === row.room_id && r.date === row.date && r.start_min === row.start_min;
            const err = (name: string): { error: DbError } => ({
                error: { code: '23505', message: `duplicate key value violates unique constraint "${name}"`, details: null },
            });
            if (rows.some((r) => same(r) && r.track_name === row.track_name)) return err('rr_track_uq');
            if (rows.some((r) => same(r) && r.slot_no === row.slot_no)) return err('rr_slot_uq');
            rows.push({ ...row });
            return { error: null };
        },
        async delete(projectId: string, id: string) {
            const i = rows.findIndex((r) => r.project_id === projectId && r.id === id);
            if (i >= 0) rows.splice(i, 1);
            return { count: i >= 0 ? 1 : 0, error: null };
        },
    };
    return db;
}

const room = (id: string, capacity: number, extra: Partial<Room> = {}): Room => ({ id, name: id, capacity, resourceKey: null, active: true, sort: 0, note: '', ...extra });
const TIMES = [{ startMin: 540, endMin: 590 }, { startMin: 600, endMin: 650 }];

function setup(opts: { data?: Partial<RoomsData>; school?: boolean; auditFails?: boolean } = {}) {
    const db = fakeDb();
    const store = createRoomStore(db, ring);
    const data: RoomsData = { rooms: [room('r1', 2), room('r2', 1)], fixed: [], blocks: [], ...opts.data };
    const audits: AuditEntry[] = [];
    let n = 0;
    const context: RoomsContext = {
        data: async () => data,
        day: async () => ({ schoolDay: opts.school ?? true, offReason: opts.school === false ? '주말' : undefined, times: TIMES, resourceCells: [] }),
        timeLabels: async () => [{ startMin: 540, endMin: 590, labels: ['1교시'] }],
        userName: async (_p, uid) => `이름-${uid}`,
    };
    const auth: AuthClient = {
        auth: { getUser: async (jwt) => (jwt.startsWith('jwt-') ? { data: { user: { id: jwt.slice(4) } }, error: null } : { data: { user: null }, error: {} }) },
        from: () => ({
            select: () => ({
                eq: (_c, _pid) => ({
                    eq: (_c2, uid) => ({
                        maybeSingle: async () => ({ data: ROLES[uid] ? { roles: ROLES[uid], active: true } : null, error: null }),
                    }),
                }),
            }),
        }),
    };
    const handler = roomsHandler({
        allowedOrigin: ORIGIN, auth, store, context, clock: () => NOW, newId: () => `id${++n}`,
        audit: async (e) => {
            if (opts.auditFails) throw new Error('audit down');
            audits.push(e);
        },
    });
    return { db, store, handler, audits };
}
const ROLES: Record<string, string[]> = { ua: ['교사'], ub: ['교사'], uc: ['교무'], uadmin: ['관리자'], uout: [] };

const base = `https://x.supabase.co/functions/v1/rooms/projects/${PID}`;
const call = (h: (r: Request) => Promise<Response>, user: string, method: string, path: string, body?: unknown) =>
    h(new Request(base + path, {
        method,
        headers: { Authorization: `Bearer jwt-${user}`, Origin: ORIGIN, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    }));
const reserve = (h: (r: Request) => Promise<Response>, user: string, roomId: string, over: Record<string, unknown> = {}) =>
    call(h, user, 'POST', `/${roomId}/reserve`, { date: TOMORROW, startMin: 540, trackName: '3-1', ...over });

describe('reserve — 자리 잡기', () => {
    it('빈 칸이면 201 {id, slotNo:1} · 암호문으로 저장(평문 이름이 행에 없다)', async () => {
        const { handler, db } = setup();
        const res = await reserve(handler, 'ua', 'r1', { note: '과학실험' });
        expect(res.status).toBe(201);
        expect(await res.json()).toEqual({ id: 'id1', slotNo: 1 });
        expect(db.rows).toHaveLength(1);
        expect(JSON.stringify(db.rows[0])).not.toContain('이름-ua');
        expect(db.rows[0].body_ct.length).toBeGreaterThan(28);
    });
    it('다른 반이 같은 칸이면 다음 자리(2) · 정원이 차면 409 full', async () => {
        const { handler } = setup();
        expect((await (await reserve(handler, 'ua', 'r1', { trackName: '3-1' })).json()).slotNo).toBe(1);
        expect((await (await reserve(handler, 'ub', 'r1', { trackName: '3-2' })).json()).slotNo).toBe(2);
        const res = await reserve(handler, 'ub', 'r1', { trackName: '3-3' });
        expect(res.status).toBe(409);
        expect(await res.json()).toMatchObject({ error: { code: 'full' } });
    });
    it('rr_slot_uq 위반(동시에 먼저 잡힘) → 다음 자리로 재시도해 성공', async () => {
        const { handler, db, store } = setup();
        // 판정이 읽은 뒤 다른 요청이 1번 자리를 가로챈 것을 흉내: select 는 빈 칸을 보이고 insert 직전에 행이 들어온다
        const realSelect = db.select.bind(db);
        let injected = false;
        db.select = async (p, q) => {
            const out = await realSelect(p, q);
            if (!injected && q.from) {
                injected = true;
                await store.insert(PID, { id: 'x', roomId: 'r1', date: TOMORROW, startMin: 540, endMin: 590, slotNo: 1, trackName: '9-9', userId: 'ub', userName: 'n', note: '' });
            }
            return out;
        };
        const res = await reserve(handler, 'ua', 'r1');
        expect(res.status).toBe(201);
        expect(await res.json()).toMatchObject({ slotNo: 2 });
        expect(db.inserts).toBe(3); // 가로챈 것 1 + 실패 1 + 성공 1
    });
    it('rr_track_uq 위반(판정 뒤 같은 반이 먼저 들어옴) → 다음 자리를 더 시도하지 않고 즉시 409 track_dup', async () => {
        const { handler, db, store } = setup();
        const realSelect = db.select.bind(db);
        let injected = false;
        db.select = async (p, q) => {
            const out = await realSelect(p, q);
            if (!injected && q.from) {
                injected = true;
                await store.insert(PID, { id: 'x', roomId: 'r1', date: TOMORROW, startMin: 540, endMin: 590, slotNo: 2, trackName: '3-1', userId: 'ub', userName: 'n', note: '' });
            }
            return out;
        };
        const res = await reserve(handler, 'ua', 'r1', { trackName: '3-1' });
        expect(res.status).toBe(409);
        expect(await res.json()).toMatchObject({ error: { code: 'track_dup' } });
        expect(db.inserts).toBe(2); // 가로챈 것 1 + 내 시도 1(1번 자리에서 track 위반 → 멈춤)
    });
    it('같은 반이 이미 있으면 판정 단계에서 409 track_dup', async () => {
        const { handler, db } = setup();
        await reserve(handler, 'ua', 'r1');
        const before = db.inserts;
        const res = await reserve(handler, 'ub', 'r1');
        expect(res.status).toBe(409);
        expect(await res.json()).toMatchObject({ error: { code: 'track_dup' } });
        expect(db.inserts).toBe(before);
    });
    it('차단 409 blocked · 고정 수업 409 fixed_class · 쉬는 날 400 · 지난 날 400 past_date · 없는 방 404 · 없는 시각 400', async () => {
        const blocked = setup({ data: { blocks: [{ id: 'b', roomId: 'r1', startDate: TOMORROW, endDate: TOMORROW, fromMin: null, toMin: null, reason: '공사' }] } });
        let res = await reserve(blocked.handler, 'ua', 'r1');
        expect([res.status, (await res.json()).error.code]).toEqual([409, 'blocked']);
        const fixed = setup({ data: { fixed: [{ id: 'f', roomId: 'r1', dayIndex: 2, startMin: 540, endMin: 590, label: '동아리' }] } });
        res = await reserve(fixed.handler, 'ua', 'r1'); // 2026-11-18 = 수 = dayIndex 2
        expect([res.status, (await res.json()).error.code]).toEqual([409, 'fixed_class']);
        const off = setup({ school: false });
        res = await reserve(off.handler, 'ua', 'r1');
        expect([res.status, (await res.json()).error.code]).toEqual([400, 'not_school_day']);
        const s = setup();
        res = await reserve(s.handler, 'ua', 'r1', { date: '2026-11-16' });
        expect([res.status, (await res.json()).error.code]).toEqual([400, 'past_date']);
        res = await reserve(s.handler, 'ua', 'nope');
        expect([res.status, (await res.json()).error.code]).toEqual([404, 'not_found']);
        res = await reserve(s.handler, 'ua', 'r1', { startMin: 555 });
        expect([res.status, (await res.json()).error.code]).toEqual([400, 'bad_time']);
    });
    it('본문 검사 400 bad_request · 구성원 아님 403 · 토큰 없음 401 · Origin 다름 403', async () => {
        const { handler } = setup();
        for (const over of [{ date: '2026/11/18' }, { startMin: '540' }, { trackName: '' }, { note: 'x'.repeat(201) }]) {
            const res = await reserve(handler, 'ua', 'r1', over);
            expect([res.status, (await res.json()).error.code]).toEqual([400, 'bad_request']);
        }
        expect((await reserve(handler, 'uout', 'r1')).status).toBe(403);
        expect((await handler(new Request(base + '/r1/reserve', { method: 'POST', headers: { Origin: ORIGIN }, body: '{}' }))).status).toBe(401);
        expect((await handler(new Request(base + '/r1/reserve', { method: 'POST', headers: { Authorization: 'Bearer jwt-ua', Origin: 'https://evil.example' }, body: '{}' }))).status).toBe(403);
    });
});

describe('제약 이름 가르기', () => {
    it('23505 + 이름으로 가르고 · 모르는 위반·다른 오류는 던진다', () => {
        expect(classifyInsertError(null)).toBeNull();
        expect(classifyInsertError({ code: '23505', message: 'duplicate key ... "rr_track_uq"' })).toBe('rr_track_uq');
        expect(classifyInsertError({ code: '23505', message: 'x', details: 'constraint rr_slot_uq' })).toBe('rr_slot_uq');
        expect(() => classifyInsertError({ code: '23505', message: '"other_uq"' })).toThrow();
        expect(() => classifyInsertError({ code: '42501', message: 'rr_slot_uq' })).toThrow();
    });
    it('reserveFailureCode 는 shared 판정 글과 맞물린다', () => {
        expect(reserveFailureCode(409, '그 시각 방 은 자리가 없습니다')).toBe('full');
        expect(reserveFailureCode(409, '3-1 은 이미 이 칸을 예약했습니다')).toBe('track_dup');
        expect(reserveFailureCode(404, '없는 방입니다')).toBe('not_found');
    });
});

describe('취소', () => {
    async function seeded(opts = {}) {
        const s = setup(opts);
        const id = (await (await reserve(s.handler, 'ua', 'r1')).json()).id as string;
        return { ...s, id };
    }
    it('본인은 지운다 · audit 에 행 통째 · 행 삭제', async () => {
        const { handler, db, audits, id } = await seeded();
        const res = await call(handler, 'ua', 'DELETE', `/reservations/${id}`);
        expect(res.status).toBe(200);
        expect(db.rows).toHaveLength(0);
        expect(audits).toHaveLength(1);
        expect(audits[0]).toMatchObject({ module: 'room', action: 'cancel', target: id, actorUserId: 'ua', before: { id, userId: 'ua', trackName: '3-1', slotNo: 1, date: TOMORROW } });
    });
    it('남의 것은 403 · 교무·관리자는 지운다', async () => {
        for (const [user, status] of [['ub', 403], ['uc', 200], ['uadmin', 200]] as const) {
            const { handler, db, id } = await seeded();
            const res = await call(handler, user, 'DELETE', `/reservations/${id}`);
            expect(res.status).toBe(status);
            expect(db.rows).toHaveLength(status === 200 ? 0 : 1);
        }
    });
    it('없는 예약 404 · 지난 날 400(관리자도) · audit 실패면 지우지 않는다', async () => {
        const { handler, db, store } = await seeded();
        expect((await call(handler, 'ua', 'DELETE', '/reservations/zzz')).status).toBe(404);
        await store.insert(PID, { id: 'old', roomId: 'r2', date: '2026-11-16', startMin: 540, endMin: 590, slotNo: 1, trackName: '1-1', userId: 'ua', userName: 'n', note: '' });
        const res = await call(handler, 'uadmin', 'DELETE', '/reservations/old');
        expect([res.status, (await res.json()).error.code]).toEqual([400, 'past_date']);
        expect(db.rows.some((r) => r.id === 'old')).toBe(true);
        const f = await seeded({ auditFails: true });
        expect((await call(f.handler, 'ua', 'DELETE', `/reservations/${f.id}`)).status).toBe(500);
        expect(f.db.rows).toHaveLength(1);
    });
});

describe('읽기 5', () => {
    it('GET 요약 — 방마다 칸 · 남의 계정 id·메모는 교사에게 가려진다 · 교무에겐 보인다', async () => {
        const { handler } = setup();
        await reserve(handler, 'ua', 'r1', { note: '비밀메모' });
        const asTeacher = await (await call(handler, 'ub', 'GET', `?date=${TOMORROW}`)).json();
        const cell = asTeacher.rooms.find((r: { room: Room }) => r.room.id === 'r1').cells[0];
        expect(cell).toMatchObject({ free: 1, capacity: 2 });
        expect(cell.reservations[0]).toMatchObject({ userName: '이름-ua', userId: '', note: '', mine: false });
        const asMine = await (await call(handler, 'ua', 'GET', `?date=${TOMORROW}`)).json();
        expect(asMine.rooms[0].cells[0].reservations[0]).toMatchObject({ userId: 'ua', note: '비밀메모', mine: true });
        const asOffice = await (await call(handler, 'uc', 'GET', `?date=${TOMORROW}`)).json();
        expect(asOffice.rooms[0].cells[0].reservations[0]).toMatchObject({ userId: 'ua', note: '비밀메모', mine: false });
    });
    it('GET 날짜 꼴 오류 400 · 날짜 생략은 서울 오늘', async () => {
        const { handler } = setup();
        expect((await call(handler, 'ua', 'GET', '?date=abc')).status).toBe(400);
        expect((await (await call(handler, 'ua', 'GET', '')).json()).date).toBe(TODAY);
    });
    it('GET times · week(월~금 5일) · free(빈 방만) · mine(오늘부터)', async () => {
        const { handler } = setup();
        expect((await (await call(handler, 'ua', 'GET', '/times')).json()).times[0].labels).toEqual(['1교시']);
        const w = await (await call(handler, 'ua', 'GET', `/r1/week?date=${TOMORROW}`)).json();
        expect(w.monday).toBe('2026-11-16');
        expect(w.days.map((d: { date: string }) => d.date)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']);
        expect((await call(handler, 'ua', 'GET', '/nope/week')).status).toBe(404);
        await reserve(handler, 'ua', 'r2'); // r2 정원 1 → 가득
        const f = await (await call(handler, 'ub', 'GET', `/free?date=${TOMORROW}&startMin=540`)).json();
        expect(f.rooms.map((x: { room: Room }) => x.room.id)).toEqual(['r1']);
        expect((await call(handler, 'ub', 'GET', `/free?date=${TOMORROW}`)).status).toBe(400);
        await reserve(handler, 'ua', 'r1', { startMin: 600 });
        const m = await (await call(handler, 'ua', 'GET', '/mine')).json();
        expect(m.reservations.map((r: Reservation) => [r.roomId, r.startMin])).toEqual([['r2', 540], ['r1', 600]]);
        expect(m.reservations.every((r: Reservation) => r.userId === 'ua')).toBe(true);
        expect((await call(handler, 'ub', 'GET', '/mine').then((r) => r.json())).reservations).toEqual([]);
    });
    it('경로 · 방식 오류 — 없는 주소 404 · 방식 틀림 405', async () => {
        const { handler } = setup();
        expect((await call(handler, 'ua', 'GET', '/a/b/c')).status).toBe(404);
        expect((await call(handler, 'ua', 'GET', '/r1/reserve')).status).toBe(405);
        expect((await call(handler, 'ua', 'POST', '/times')).status).toBe(405);
        expect((await handler(new Request('https://x.supabase.co/functions/v1/rooms', { headers: { Authorization: 'Bearer jwt-ua' } }))).status).toBe(404);
    });
});
