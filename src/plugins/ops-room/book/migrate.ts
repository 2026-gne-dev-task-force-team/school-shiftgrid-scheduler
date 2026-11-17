/**
 * 옛 예약(localStorage) → 달력 일정 이사(R9 · T-10f4) — 한 번 돌고, 다시 돌려도 같은 결과.
 *   🔴 옛 localStorage 값은 지우지 않는다 — 「옮김」 표시 키(`<키>.moved`)만 더한다. 표시를 지우면 다시 옮긴다(옛 값은 그대로라 되돌릴 수 있다).
 *   🔴 칸 꼴은 room-booking 이 읽는 그대로: 저장소 data.preset · 일정 values.when / f_room(방 id 배열) / f_booker. 남의 조각 값 import 금지라 글자로만 안다.
 *   🔴 같은 방·시각이 겹치면 건너뛴다(「n건 건너뜀」) — 옛 자리 번호(slotNo) 여럿은 한 칸에 하나만 옮겨진다. 방을 못 찾아도 건너뛴다.
 *   ⛔ 값은 약속(Calendar·Rooms·NodesApi)으로만 읽고 쓴다.
 */
import type { NodesApi } from '../../../pane-ui-system/core/nodes/contracts/nodes';
import type { Calendar } from '../../calendar/contracts/calendar';
import type { Room, Rooms } from '../../rooms/contracts/rooms';
import type { ReservationRow, RoomsPart } from './types';

export const LS_KEY = 'plugin.ops-room.part';
/** 옮김 표시 키 — 값은 `{moved,skipped}` 글자. */
export const movedKeyOf = (key: string = LS_KEY): string => `${key}.moved`;

const STORE_TYPE = 'calendar.store';
const EVENT_TYPE = 'calendar.event';
const PRESET_ID = 'room-booking.default';
const ROOM_FIELD = 'f_room';
const BOOKER_FIELD = 'f_booker';

export interface MoveDeps { calendar: Calendar; nodes: NodesApi; rooms: Rooms }
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
export interface MoveResult { moved: number; skipped: number; /** 이미 옮겨 둔 뒤라 아무것도 안 했다 */ done: boolean }

const hhmm = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const valuesOf = (nodes: NodesApi, id: string): Record<string, unknown> => ((nodes.get(id)?.data as { values?: Record<string, unknown> } | undefined)?.values) ?? {};
const roomOfValues = (v: Record<string, unknown>): string => { const r = Array.isArray(v[ROOM_FIELD]) ? v[ROOM_FIELD][0] : v[ROOM_FIELD]; return typeof r === 'string' ? r : ''; };

/** 이미 옮겨 뒀나 — 표시 키가 있으면 참. */
export function isMoved(storage: StorageLike, key: string = LS_KEY): boolean {
    try { return storage.getItem(movedKeyOf(key)) !== null; } catch { return false; }
}

/** 옛 저장 값에서 예약 행들 — 없거나 깨졌으면 null(옮길 것 없음). */
function readOld(storage: StorageLike, key: string): { part: RoomsPart | null; rows: ReservationRow[] } | null {
    try {
        const raw = storage.getItem(key);
        if (!raw) return null;
        const p = JSON.parse(raw) as { part?: RoomsPart; rows?: ReservationRow[] };
        if (!p || !Array.isArray(p.rows)) return null;
        return { part: p.part && Array.isArray(p.part.rooms) ? p.part : null, rows: p.rows };
    } catch { return null; }
}

/**
 * 옛 예약을 달력 일정으로 옮긴다. 방은 같은 id 로 먼저, 없으면 옛 방 이름이 같은 방으로 잇는다.
 *   표시 키는 일이 끝난 뒤(옮길 게 없어도) 쓴다 — 다음부터는 `done` 으로 바로 돌아온다.
 */
export function moveLocalReservations(deps: MoveDeps, storage: StorageLike, key: string = LS_KEY): MoveResult {
    if (isMoved(storage, key)) return { moved: 0, skipped: 0, done: true };
    const old = readOld(storage, key);
    const rooms: Room[] = deps.rooms.lists().flatMap((l) => deps.rooms.roomsIn(l.id));
    const target = (r: ReservationRow): string => {
        if (deps.rooms.room(r.roomId)) return r.roomId;
        const name = old?.part?.rooms.find((x) => x.id === r.roomId)?.name;
        return (name && rooms.find((x) => x.name === name)?.id) || '';
    };
    const stores = () => deps.nodes.liveByType(STORE_TYPE).filter((n) => (n.data as { preset?: unknown } | undefined)?.preset === PRESET_ID).map((n) => n.id);
    let moved = 0;
    let skipped = 0;
    const rows = [...(old?.rows ?? [])].sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin || a.id.localeCompare(b.id));
    deps.nodes.batch(() => {
        for (const r of rows) {
            const roomId = target(r);
            const start = `${r.date}T${hhmm(r.startMin)}`;
            const end = `${r.date}T${hhmm(r.endMin)}`;
            if (!roomId || !(r.startMin < r.endMin)) { skipped++; continue; }
            const next = new Date(`${r.date}T00:00:00Z`);
            next.setUTCDate(next.getUTCDate() + 1);
            const to = `${next.toISOString().slice(0, 10)}T00:00`;
            const clash = stores().some((s) => deps.calendar.occurrences(s, `${r.date}T00:00`, to).some((o) => o.start < end && start < o.end && roomOfValues(valuesOf(deps.nodes, o.eventId)) === roomId));
            if (clash) { skipped++; continue; }
            const storeId = stores()[0] || deps.calendar.newPresetStore(PRESET_ID);
            const name = [r.trackName, r.body?.note].filter((x) => typeof x === 'string' && x.trim()).join(' ');
            const id = storeId ? deps.nodes.create(storeId, { type: EVENT_TYPE, name, data: { values: { when: { start, end }, [ROOM_FIELD]: [roomId], [BOOKER_FIELD]: r.body?.userName ?? '' } } }) : '';
            if (id) moved++; else skipped++;
        }
    });
    try { storage.setItem(movedKeyOf(key), JSON.stringify({ moved, skipped })); } catch { /* 표시를 못 써도 겹침 검사가 두 번째 이사를 막는다 */ }
    return { moved, skipped, done: false };
}

/** 선생님 말 한 줄 — 「n건 옮김 · n건 건너뜀」. */
export const moveSummary = (r: MoveResult): string => (r.done ? '이미 옮겼습니다.' : `${r.moved}건 옮김 · ${r.skipped}건 건너뜀`);
