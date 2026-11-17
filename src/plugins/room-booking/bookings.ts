/**
 * 방 예약 보기의 일 — 예약하기 · 빈 방 찾기 · 내 예약 · 취소. 🔴 자료는 달력 일정(예약 목록 저장소)과 rooms 약속뿐이다.
 *   ⛔ 여기엔 저장소가 없다 · ⛔ 방 속성 복사 없음(정원·고정·차단은 judgeBooking 이 rooms 에서 읽는다).
 *   순수 함수 — 노드·달력·방을 손잡이(BookingDeps)로 받는다(시험하기 쉽게).
 */
import { addDays } from '../../../shared/room-rules.ts';
import type { NodesApi } from '../../pane-ui-system/core/nodes/contracts/nodes';
import type { Calendar, Occurrence } from '../calendar/contracts/calendar';
import type { Room, Rooms } from '../rooms/contracts/rooms';
import { BOOKER_FIELD, HEADCOUNT_FIELD, PRESET_ID, ROOM_FIELD, judgeBooking, roomIdOf } from './rules';

const STORE_TYPE = 'calendar.store';
const EVENT_TYPE = 'calendar.event';
const NOTE_MAX = 100;

export interface BookingDeps { calendar: Calendar; nodes: NodesApi; rooms: Rooms }

/** 화면에 보이는 예약 한 줄. */
export interface Booking {
    eventId: string; storeId: string; name: string; roomId: string; roomName: string;
    start: string; end: string; headcount: number | null; booker: string; occ: Occurrence;
}
export interface BookInput { roomId: string; date: string; start: string; end: string; name: string; booker: string; headcount: number | null }
export type BookResult = { ok: true; eventId: string } | { ok: false; reason: string };

const hhmm = (s: string): boolean => /^\d{2}:\d{2}$/.test(s) && +s.slice(0, 2) < 24 && +s.slice(3) < 60;
const validDate = (s: string): boolean => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return false;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
};
const overlap = (a: { start: string; end: string }, b: { start: string; end: string }) => a.start < b.end && b.start < a.end;
const valuesOf = (nodes: NodesApi, id: string): Record<string, unknown> => ((nodes.get(id)?.data as { values?: Record<string, unknown> } | undefined)?.values) ?? {};

/** 예약 목록 저장소들(살아 있는 것 중 방 예약 프리셋). */
export function bookingStores(nodes: NodesApi): string[] {
    return nodes.liveByType(STORE_TYPE).filter((n) => (n.data as { preset?: unknown } | undefined)?.preset === PRESET_ID).map((n) => n.id);
}

/** 모든 방(방 목록마다). */
export const allRooms = (rooms: Rooms): Room[] => rooms.lists().flatMap((l) => rooms.roomsIn(l.id));

/** [from,to) 에 걸치는 예약 — 방 칸이 빈 일정은 건너뛴다. 시작순. */
export function listBookings(deps: BookingDeps, from: string, to: string): Booking[] {
    const out: Booking[] = [];
    for (const storeId of bookingStores(deps.nodes)) {
        for (const occ of deps.calendar.occurrences(storeId, from, to)) {
            const v = valuesOf(deps.nodes, occ.eventId);
            const roomId = roomIdOf(v);
            const room = roomId ? deps.rooms.room(roomId) : undefined;
            if (!room) continue;
            const head = v[HEADCOUNT_FIELD];
            out.push({
                eventId: occ.eventId, storeId, name: deps.nodes.get(occ.eventId)?.name ?? '', roomId, roomName: room.name,
                start: occ.start, end: occ.end, headcount: typeof head === 'number' ? head : null,
                booker: typeof v[BOOKER_FIELD] === 'string' ? v[BOOKER_FIELD] as string : '', occ,
            });
        }
    }
    return out.sort((a, b) => a.start.localeCompare(b.start));
}

/** 그날 하루의 예약. */
export const bookingsOn = (deps: BookingDeps, date: string): Booking[] => listBookings(deps, `${date}T00:00`, `${addDays(date, 1)}T00:00`);

/** 내 예약 — 오늘부터 days 일 안에서 예약자가 나인 것. */
export const myBookings = (deps: BookingDeps, me: string, today: string, days = 90): Booking[] =>
    me.trim() ? listBookings(deps, `${today}T00:00`, `${addDays(today, days)}T00:00`).filter((b) => b.booker === me.trim()) : [];

const stamp = (date: string, t: string) => `${date}T${t}`;

/** 이 방이 그 시각에 비어 있나 — 거절 사유(선생님 말)를 돌려준다, 통과면 null. 규칙은 judgeBooking(정원·고정·차단·쓰는 방) + 같은 방 겹침. */
export function whyNot(deps: BookingDeps, room: Room, date: string, start: string, end: string, headcount: number | null, same: readonly Booking[]): string | null {
    const draft = { start: stamp(date, start), end: stamp(date, end), allDay: false, values: headcount === null ? {} : { [HEADCOUNT_FIELD]: headcount } };
    const reason = judgeBooking(room, deps.rooms.roomProps(room.id), draft);
    if (reason) return reason;
    const clash = same.find((b) => b.roomId === room.id && overlap(draft, b));
    return clash ? `「${room.name}」은 그 시간에 이미 예약돼 있습니다(${clash.name || '이름 없음'}).` : null;
}

/** 입력 모양 검사 — 틀리면 선생님 말, 맞으면 null. */
export function checkInput(i: Pick<BookInput, 'date' | 'start' | 'end'>, today: string): string | null {
    if (!validDate(i.date)) return '날짜는 2026-11-12 꼴로 적어 주세요.';
    if (!hhmm(i.start) || !hhmm(i.end) || i.end <= i.start) return '시각은 09:40 ~ 10:20 꼴로, 끝이 시작보다 늦게 적어 주세요.';
    if (i.date < today) return '지난 날짜는 예약할 수 없습니다.';
    return null;
}

/** 빈 방 찾기 — 그 날짜·시각에 쓸 수 있는 방(쓰는 방만). */
export function findFreeRooms(deps: BookingDeps, date: string, start: string, end: string, headcount: number | null, today: string): Room[] {
    if (checkInput({ date, start, end }, today)) return [];
    const same = bookingsOn(deps, date);
    return allRooms(deps.rooms).filter((r) => deps.rooms.roomProps(r.id).active && !whyNot(deps, r, date, start, end, headcount, same));
}

/** 예약하기 — 검사 → 예약 목록 저장소(없으면 만든다)에 달력 일정으로 만든다. */
export function bookRoom(deps: BookingDeps, i: BookInput, today: string): BookResult {
    const bad = checkInput(i, today);
    if (bad) return { ok: false, reason: bad };
    if (!i.name.trim()) return { ok: false, reason: '예약 이름(반·용도)을 적어 주세요.' };
    if (i.name.length > NOTE_MAX) return { ok: false, reason: `예약 이름은 ${NOTE_MAX}자까지입니다.` };
    if (!i.booker.trim()) return { ok: false, reason: '예약자 이름을 적어 주세요.' };
    const room = deps.rooms.room(i.roomId);
    if (!room) return { ok: false, reason: '없는 방입니다.' };
    const reason = whyNot(deps, room, i.date, i.start, i.end, i.headcount, bookingsOn(deps, i.date));
    if (reason) return { ok: false, reason };
    const storeId = bookingStores(deps.nodes)[0] || deps.calendar.newPresetStore(PRESET_ID);
    if (!storeId) return { ok: false, reason: '예약 목록을 만들지 못했습니다.' };
    const values: Record<string, unknown> = {
        when: { start: stamp(i.date, i.start), end: stamp(i.date, i.end) },
        [ROOM_FIELD]: [i.roomId], [BOOKER_FIELD]: i.booker.trim(),
    };
    if (i.headcount !== null) values[HEADCOUNT_FIELD] = i.headcount;
    const eventId = deps.nodes.create(storeId, { type: EVENT_TYPE, name: i.name.trim(), data: { values } });
    return eventId ? { ok: true, eventId } : { ok: false, reason: '예약을 저장하지 못했습니다.' };
}

/** 취소 — 지난 예약은 못 지운다. 반복 예약의 한 회차면 그 회차만 빠뜨린다. */
export function cancelBooking(deps: BookingDeps, b: Booking, today: string): { ok: true } | { ok: false; reason: string } {
    if (b.start.slice(0, 10) < today) return { ok: false, reason: '지난 예약은 취소할 수 없습니다.' };
    if (b.occ.virtual) deps.calendar.skip(b.occ); else deps.nodes.remove(b.eventId);
    return { ok: true };
}
