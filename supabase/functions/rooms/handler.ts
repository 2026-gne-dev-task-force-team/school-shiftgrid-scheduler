// ③ 11-4 특별실 행 API — 읽기 5(요약·times·week·free·mine) + reserve + 취소. 순수 — 저장소·맥락·감사·시계는 주입.
// 경로(🙋 B3 이 「P 를 경로에 두나」를 안 정했다): `/rooms/projects/<pid>/<route>` — 마운트 규칙 `P = /projects/:pid` 를 그대로 따른다.
//   GET  …/                    ?date        그날 요약(방마다 칸)
//   GET  …/times                            칸 머리(시각·교시 이름)
//   GET  …/<roomId>/week        ?date        그 주 월~금
//   GET  …/free                 ?date&startMin  그 시각 빈 방
//   GET  …/mine                             오늘부터 내 예약
//   POST …/<roomId>/reserve     {date,startMin,trackName,note?} → 201 {id, slotNo}
//   DELETE …/reservations/<rid>             본인·교무·교감·관리자, 지난 것 ✗ → audit 에 행 통째 → 행 삭제
// 판정은 shared/room-rules.ts 한 벌. 여기는 순서 · 제약 이름 가르기 · 오류 꼴 매핑만 한다.

import {
    addDays, dayIndexOf, decideCancel, decideReserve, freeRooms, mondayOf, myReservations, overlapWarnings, roomDay,
    type Cell, type Reservation, type ResourceCell, type Room, type RoomBlock, type RoomDay, type RoomDayInput, type RoomFixed, type TimeSpan,
} from '../../../shared/room-rules.ts';
import { can } from '../../../shared/roles.ts';
import { requireProjectMember, type AuthClient, type Member } from '../_shared/auth.ts';
import { seoulToday, type Clock } from '../_shared/clock.ts';
import { errors, HttpError, jsonResponse } from '../_shared/errors.ts';
import { handle, subPath } from '../_shared/http.ts';
import type { RoomStore } from './store.ts';

export interface RoomsData {
    rooms: Room[];
    fixed: RoomFixed[];
    blocks: RoomBlock[];
}
export interface DayFacts {
    schoolDay: boolean;
    offReason?: string;
    /** 그날 수업 시각 합집합 */
    times: TimeSpan[];
    resourceCells: ResourceCell[];
}
/** 조각(`ops.rooms`)·`doc` 에서 오는 것 — 복호는 이 밖의 몫 */
export interface RoomsContext {
    data(projectId: string): Promise<RoomsData>;
    day(projectId: string, date: string): Promise<DayFacts>;
    timeLabels(projectId: string): Promise<{ startMin: number; endMin: number; labels: string[] }[]>;
    /** 예약에 적을 표시 이름(구성원 표시명) */
    userName(projectId: string, userId: string): Promise<string>;
}
export interface AuditEntry {
    projectId: string;
    module: 'room';
    action: 'cancel';
    target: string;
    actorUserId: string;
    /** 행 통째 */
    before: Reservation;
}

export interface RoomsDeps {
    allowedOrigin: string | undefined;
    auth: AuthClient;
    store: RoomStore;
    context: RoomsContext;
    /** audit.append 몫(B10) — 던지면 삭제하지 않는다 */
    audit(entry: AuditEntry): Promise<void>;
    clock: Clock;
    newId(): string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (d: unknown): d is string => typeof d === 'string' && DATE_RE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
const validMin = (m: unknown): m is number => typeof m === 'number' && Number.isInteger(m) && m >= 0 && m <= 1439;

const bad = (message: string) => new HttpError(400, 'bad_request', message);

function queryDate(url: URL, today: string): string {
    const d = url.searchParams.get('date') ?? today;
    if (!validDate(d)) throw bad('date 는 YYYY-MM-DD 여야 합니다');
    return d;
}

/** 누른 계정 id·메모는 교감·교무(관리자 포함)와 본인에게만(`room.seeDetail`). 이름은 모두에게 보인다. */
function maskCell(c: Cell, see: boolean): Cell {
    if (see) return c;
    return { ...c, reservations: c.reservations.map((r) => (r.mine ? r : { ...r, userId: '', note: '' })) };
}
const maskDay = (d: RoomDay, see: boolean): RoomDay => ({ ...d, cells: d.cells.map((c) => maskCell(c, see)) });

/** decideReserve 의 실패 글 → 안정 코드. 글이 바뀌면 시험이 빨개진다(rooms.test.ts). */
export function reserveFailureCode(status: number, error: string): string {
    if (status === 404) return 'not_found';
    if (error.startsWith('지나간')) return 'past_date';
    if (error.startsWith('그날은 수업이')) return 'not_school_day';
    if (error.includes('수업 시각이 아닙니다')) return 'bad_time';
    if (error.startsWith('그 시각은 막혀')) return 'blocked';
    if (error.startsWith('고정 수업')) return 'fixed_class';
    if (error.includes('이미 이 칸을 예약')) return 'track_dup';
    if (error.includes('자리가 없습니다')) return 'full';
    return 'conflict';
}

interface Ctx {
    deps: RoomsDeps;
    pid: string;
    member: Member;
    today: string;
    see: boolean;
}

async function dayInput(c: Ctx, data: RoomsData, date: string, reservations: Reservation[]): Promise<Omit<RoomDayInput, 'room'>> {
    const f = await c.deps.context.day(c.pid, date);
    return {
        date, dayIndex: dayIndexOf(date), schoolDay: f.schoolDay, offReason: f.offReason, times: f.times,
        resourceCells: f.resourceCells, fixed: data.fixed, blocks: data.blocks, reservations, me: c.member.userId, today: c.today,
    };
}
const activeRooms = (data: RoomsData) => data.rooms.filter((r) => r.active).sort((a, b) => a.sort - b.sort);

async function summary(c: Ctx, url: URL): Promise<Response> {
    const date = queryDate(url, c.today);
    const data = await c.deps.context.data(c.pid);
    const base = await dayInput(c, data, date, await c.deps.store.listRange(c.pid, date, date));
    const rooms = activeRooms(data).map((room) => ({ room, ...maskDay(roomDay({ ...base, room }), c.see) }));
    return jsonResponse({ date, schoolDay: base.schoolDay, offReason: base.offReason, rooms });
}

async function week(c: Ctx, roomId: string, url: URL): Promise<Response> {
    const monday = mondayOf(queryDate(url, c.today));
    const data = await c.deps.context.data(c.pid);
    const room = data.rooms.find((r) => r.id === roomId);
    if (!room) throw errors.notFound();
    const resv = (await c.deps.store.listRange(c.pid, monday, addDays(monday, 4))).filter((r) => r.roomId === roomId);
    const days = [];
    for (let i = 0; i < 5; i++) {
        const date = addDays(monday, i);
        const d = maskDay(roomDay({ ...(await dayInput(c, data, date, resv)), room }), c.see);
        days.push({ date, ...d, warnings: overlapWarnings(d.cells) });
    }
    return jsonResponse({ room, monday, days });
}

async function free(c: Ctx, url: URL): Promise<Response> {
    const date = queryDate(url, c.today);
    const raw = url.searchParams.get('startMin');
    const startMin = raw === null || raw.trim() === '' ? NaN : Number(raw);
    if (!validMin(startMin)) throw bad('startMin 은 분 정수여야 합니다');
    const data = await c.deps.context.data(c.pid);
    const base = await dayInput(c, data, date, await c.deps.store.listRange(c.pid, date, date));
    const out = freeRooms(activeRooms(data), date, startMin, () => base);
    return jsonResponse({
        date, startMin, schoolDay: out.schoolDay, offReason: out.offReason,
        rooms: out.rooms.filter((x) => x.cell.free > 0).map((x) => ({ room: x.room, cell: maskCell(x.cell, c.see) })),
    });
}

async function mine(c: Ctx): Promise<Response> {
    const all = await c.deps.store.listFrom(c.pid, c.today);
    return jsonResponse({ reservations: myReservations(all, c.member.userId, c.today) });
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
    let v: unknown;
    try {
        v = await req.json();
    } catch {
        throw bad('본문이 JSON 이 아닙니다');
    }
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw bad('본문이 객체가 아닙니다');
    return v as Record<string, unknown>;
}

async function reserve(c: Ctx, roomId: string, req: Request): Promise<Response> {
    const b = await readBody(req);
    const { date, startMin, trackName } = b;
    const note = b.note === undefined ? '' : b.note;
    if (!validDate(date)) throw bad('date 는 YYYY-MM-DD 여야 합니다');
    if (!validMin(startMin)) throw bad('startMin 은 분 정수여야 합니다');
    if (typeof trackName !== 'string' || trackName.trim() === '' || trackName.length > 50) throw bad('trackName(반)이 필요합니다');
    if (typeof note !== 'string' || note.length > 200) throw bad('note 는 200자 이하 글이어야 합니다');

    const data = await c.deps.context.data(c.pid);
    const room = data.rooms.find((r) => r.id === roomId) ?? null;
    const resv = (await c.deps.store.listRange(c.pid, date, date)).filter((r) => r.roomId === roomId);
    const { date: _date, ...rest } = await dayInput(c, data, date, resv);
    const verdict = decideReserve({ ...rest, room }, { date, startMin, trackName, note });
    if (!verdict.ok) throw new HttpError(verdict.status, reserveFailureCode(verdict.status, verdict.error), verdict.error);

    const userName = await c.deps.context.userName(c.pid, c.member.userId);
    const id = c.deps.newId();
    // 자리 잡기(④ 3-2): 후보를 차례로 INSERT — rr_track_uq 면 즉시 track_dup, rr_slot_uq 면 다음 자리
    for (const slotNo of verdict.slotNos) {
        const r = await c.deps.store.insert(c.pid, {
            id, roomId, date, startMin, endMin: verdict.endMin, slotNo, trackName, userId: c.member.userId, userName, note,
        });
        if (r.ok) return jsonResponse({ id, slotNo }, 201);
        if (r.conflict === 'rr_track_uq') throw new HttpError(409, 'track_dup', `${trackName} 은 이미 이 칸을 예약했습니다`);
    }
    throw new HttpError(409, 'full', '그 시각 자리가 없습니다');
}

async function cancel(c: Ctx, rid: string): Promise<Response> {
    const row = await c.deps.store.get(c.pid, rid);
    const v = decideCancel(row, { id: c.member.userId, roles: c.member.roles }, c.today);
    if (!v.ok) throw new HttpError(v.status, v.status === 403 ? 'forbidden' : v.status === 400 ? 'past_date' : 'not_found', v.error);
    if (!row) throw new HttpError(404, 'not_found', '없는 예약입니다');
    // 감사 먼저 — 실패하면 지우지 않는다(되살릴 자리가 여기뿐: ④ 4절)
    await c.deps.audit({ projectId: c.pid, module: 'room', action: 'cancel', target: rid, actorUserId: c.member.userId, before: row });
    if (!(await c.deps.store.remove(c.pid, rid))) throw new HttpError(404, 'not_found', '없는 예약입니다');
    return jsonResponse({ ok: true });
}

type Route =
    | { kind: 'summary' | 'times' | 'free' | 'mine' }
    | { kind: 'week' | 'reserve'; roomId: string }
    | { kind: 'cancel'; rid: string };

/** 경로 → (종류, 허용 방식). 주소는 맞는데 방식이 틀리면 405, 주소가 없으면 404. */
function route(rest: string[], method: string): Route {
    let r: Route | null = null;
    let allowed = '';
    if (rest.length === 0) [r, allowed] = [{ kind: 'summary' }, 'GET'];
    else if (rest.length === 1 && ['times', 'free', 'mine'].includes(rest[0])) [r, allowed] = [{ kind: rest[0] as 'times' }, 'GET'];
    else if (rest.length === 2 && rest[1] === 'week') [r, allowed] = [{ kind: 'week', roomId: rest[0] }, 'GET'];
    else if (rest.length === 2 && rest[1] === 'reserve') [r, allowed] = [{ kind: 'reserve', roomId: rest[0] }, 'POST'];
    else if (rest.length === 2 && rest[0] === 'reservations') [r, allowed] = [{ kind: 'cancel', rid: rest[1] }, 'DELETE'];
    if (!r) throw errors.notFound();
    if (method !== allowed) throw errors.methodNotAllowed();
    return r;
}

export function roomsHandler(deps: RoomsDeps): (req: Request) => Promise<Response> {
    return (req) =>
        handle(req, deps.allowedOrigin, async (r) => {
            const path = subPath(r.url, 'rooms');
            if (path[0] !== 'projects' || !path[1]) throw errors.notFound();
            const pid = path[1];
            const rt = route(path.slice(2), r.method.toUpperCase());
            const member = await requireProjectMember(deps.auth, r.headers.get('Authorization'), pid);
            const c: Ctx = { deps, pid, member, today: seoulToday(deps.clock), see: can(member.roles, 'room.seeDetail') };
            const url = new URL(r.url);
            switch (rt.kind) {
                case 'summary': return summary(c, url);
                case 'times': return jsonResponse({ times: await deps.context.timeLabels(pid) });
                case 'free': return free(c, url);
                case 'mine': return mine(c);
                case 'week': return week(c, rt.roomId, url);
                case 'reserve': return reserve(c, rt.roomId, r);
                case 'cancel': return cancel(c, rt.rid);
            }
        });
}
