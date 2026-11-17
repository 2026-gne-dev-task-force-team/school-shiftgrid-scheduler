// ④ 3-2 예약 행 저장 — body_ct 봉투 열고 닫기 + 유일 제약 위반(23505)을 제약 이름으로 가르기(E7).
// DB 접근은 좁은 RoomDb 로 주입받는다(index.ts 가 supabase-js 를 여기 꼴로 감싼다) — 시험은 Postgres 를 흉내 내는 가짜를 넘긴다.

import type { Reservation } from '../../../shared/room-rules.ts';
import { assertMayOpen } from '../_shared/crypto-scope.ts';
import { aadRoom } from '../_shared/crypto/aad.ts';
import { open, seal, type Bytes, type KeyRing } from '../_shared/crypto/envelope.ts';

/** 평문 열(DB 행) + 암호문 한 칸 */
export interface RoomRow {
    id: string;
    project_id: string;
    room_id: string;
    date: string;
    start_min: number;
    end_min: number;
    slot_no: number;
    track_name: string;
    body_ct: Bytes;
}

/** PostgREST 오류 꼴 일부 */
export interface DbError {
    code?: string;
    message?: string;
    details?: string | null;
}

export interface RoomDb {
    /** 날짜 범위(from..to 둘 다 포함, to 없으면 끝없이) 행 — project 한정 */
    select(projectId: string, q: { from?: string; to?: string; id?: string }): Promise<{ data: RoomRow[] | null; error: DbError | null }>;
    insert(row: RoomRow): Promise<{ error: DbError | null }>;
    /** 지운 줄 수 */
    delete(projectId: string, id: string): Promise<{ count: number; error: DbError | null }>;
}

export type InsertResult =
    | { ok: true }
    | { ok: false; conflict: 'rr_slot_uq' | 'rr_track_uq' };

export interface RoomStore {
    listRange(projectId: string, from: string, to: string): Promise<Reservation[]>;
    listFrom(projectId: string, from: string): Promise<Reservation[]>;
    get(projectId: string, id: string): Promise<Reservation | null>;
    insert(projectId: string, r: Reservation): Promise<InsertResult>;
    /** 지웠으면 true */
    remove(projectId: string, id: string): Promise<boolean>;
}

/** 유일 위반이 아니면 null. 제약 이름이 둘 중 하나가 아니면 던진다(모르는 위반을 「다음 자리」로 삼키지 않는다). */
export function classifyInsertError(e: DbError | null): 'rr_slot_uq' | 'rr_track_uq' | null {
    if (!e) return null;
    if (e.code !== '23505') throw new Error('room_reservation insert 실패');
    const text = `${e.message ?? ''} ${e.details ?? ''}`;
    if (text.includes('rr_track_uq')) return 'rr_track_uq';
    if (text.includes('rr_slot_uq')) return 'rr_slot_uq';
    throw new Error('알 수 없는 유일 제약 위반');
}

/**
 * 그 프로젝트에서 주어진 방 중 예약 행이 하나라도 남은 방의 id — parts 함수의 방 삭제 409(check.ts `reservedRooms`)용.
 * 평문 열 `room_id` 만 본다(봉투는 열지 않는다 — parts 함수의 여는 범위에 예약 행은 없다). 지난 예약도 센다(행이 남은 한 방을 지우지 못한다).
 */
export async function reservedRoomIds(db: Pick<RoomDb, 'select'>, projectId: string, roomIds: readonly string[]): Promise<Set<string>> {
    if (roomIds.length === 0) return new Set();
    const { data, error } = await db.select(projectId, {});
    if (error) throw new Error('room_reservation 읽기 실패');
    const want = new Set(roomIds);
    return new Set((data ?? []).filter((r) => r.project_id === projectId && want.has(r.room_id)).map((r) => r.room_id));
}

// ── supabase-js → RoomDb(rooms·parts 진입점이 같이 쓴다) ──────────

const toHex = (b: Bytes) => '\\x' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
function fromPg(v: unknown): Bytes {
    const s = String(v);
    if (!s.startsWith('\\x')) throw new Error('bytea 꼴이 아닙니다');
    const out = new Uint8Array(new ArrayBuffer((s.length - 2) / 2));
    for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(2 + i * 2, 4 + i * 2), 16);
    return out;
}

const COLS = 'id, project_id, room_id, date, start_min, end_min, slot_no, track_name, body_ct';

/** supabase-js 클라이언트를 RoomDb 꼴로 감싼다(체인 꼴은 넓어 여기서만 느슨하게 받는다) */
// oxlint-disable-next-line typescript/no-explicit-any
export function supabaseRoomDb(sb: any): RoomDb {
    return {
        async select(projectId, q) {
            let b = sb.from('room_reservation').select(COLS).eq('project_id', projectId);
            if (q.id !== undefined) b = b.eq('id', q.id);
            if (q.from !== undefined) b = b.gte('date', q.from);
            if (q.to !== undefined) b = b.lte('date', q.to);
            const { data, error } = await b;
            const rows = (data as Record<string, unknown>[] | null)?.map((r) => ({ ...r, body_ct: fromPg(r.body_ct) }) as RoomRow) ?? null;
            return { data: rows, error: error as DbError | null };
        },
        async insert(row) {
            const { error } = await sb.from('room_reservation').insert({ ...row, body_ct: toHex(row.body_ct) });
            return { error: error as DbError | null };
        },
        async delete(projectId, id) {
            const { count, error } = await sb.from('room_reservation').delete({ count: 'exact' }).eq('project_id', projectId).eq('id', id);
            return { count: count ?? 0, error: error as DbError | null };
        },
    };
}

const enc = new TextEncoder();
const dec = new TextDecoder();

interface Body {
    userId: string;
    userName: string;
    note: string;
}

export function createRoomStore(db: RoomDb, ring: KeyRing): RoomStore {
    const aad = (row: Omit<RoomRow, 'body_ct'>) => (kid: string) =>
        aadRoom(row.project_id, row.id, row.room_id, row.date, row.start_min, row.slot_no, row.track_name, kid);

    async function toReservation(row: RoomRow): Promise<Reservation> {
        assertMayOpen('rooms', 'room');
        const bytes = await open(ring, row.body_ct, aad(row));
        const b = JSON.parse(dec.decode(bytes)) as Body;
        return {
            id: row.id, roomId: row.room_id, date: row.date, startMin: row.start_min, endMin: row.end_min,
            slotNo: row.slot_no, trackName: row.track_name, userId: b.userId, userName: b.userName, note: b.note ?? '',
        };
    }
    async function read(projectId: string, q: { from?: string; to?: string; id?: string }): Promise<Reservation[]> {
        const { data, error } = await db.select(projectId, q);
        if (error) throw new Error('room_reservation 읽기 실패');
        return Promise.all((data ?? []).map(toReservation));
    }

    return {
        listRange: (p, from, to) => read(p, { from, to }),
        listFrom: (p, from) => read(p, { from }),
        async get(p, id) {
            return (await read(p, { id }))[0] ?? null;
        },
        async insert(p, r) {
            const base = { id: r.id, project_id: p, room_id: r.roomId, date: r.date, start_min: r.startMin, end_min: r.endMin, slot_no: r.slotNo, track_name: r.trackName };
            const body: Body = { userId: r.userId, userName: r.userName, note: r.note };
            const body_ct = await seal(ring, new Uint8Array(enc.encode(JSON.stringify(body))), aad(base));
            const { error } = await db.insert({ ...base, body_ct });
            const c = classifyInsertError(error);
            return c ? { ok: false, conflict: c } : { ok: true };
        },
        async remove(p, id) {
            const { count, error } = await db.delete(p, id);
            if (error) throw new Error('room_reservation 삭제 실패');
            return count > 0;
        },
    };
}
