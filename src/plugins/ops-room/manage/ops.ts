/**
 * 방 관리·불러오기 ↔ rooms 약속 다리 — 🔴 자료는 rooms(방 목록)의 방과 ext['room-booking'] 에만 있다(읽기 roomProps · 쓰기 addRoom·updateRoom·setRoomProps).
 *   ⛔ 여기엔 저장소가 없다. 화면은 읽은 값을 옛 꼴(CsvRoom·shared Room·RoomFixed)로 바꿔 규칙 코드에 넘기고, 결과를 약속 호출로 되돌려 쓴다.
 */
import type { Room as RoomNode, Rooms, RoomFixedItem } from '../../rooms/contracts/rooms';
import type { Room, RoomFixed } from '../../../../shared/room-rules.ts';
import type { CsvRoom } from './csv';

/** 방 속성이 사는 ext 이름공간(방 예약 플러그인 id). */
const EXT = 'room-booking';

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** 살아 있는 방 전부(목록 순서대로). */
export function allRooms(rooms: Rooms): RoomNode[] { return rooms.lists().flatMap((l) => rooms.roomsIn(l.id)); }

/** 방 하나의 고정 사용(ext 에서 읽음 — 꼴이 틀린 줄은 건너뛴다). */
export function fixedOf(r: RoomNode): RoomFixedItem[] {
    const mine = r.ext?.[EXT];
    const list = mine && typeof mine === 'object' ? (mine as { fixed?: unknown }).fixed : undefined;
    const out: RoomFixedItem[] = [];
    for (const x of Array.isArray(list) ? list : []) {
        const f = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
        if (isInt(f.dayIndex) && isInt(f.startMin) && isInt(f.endMin) && f.startMin < f.endMin) out.push({ dayIndex: f.dayIndex, startMin: f.startMin, endMin: f.endMin, label: typeof f.label === 'string' ? f.label : '' });
    }
    return out;
}

/** CSV 로 내보낼 줄들. */
export function csvRoomsOf(rooms: Rooms): CsvRoom[] {
    return allRooms(rooms).map((r) => {
        const p = rooms.roomProps(r.id);
        return { id: r.id, name: r.name, capacity: p.capacity ?? null, resourceKey: p.resourceKey || null, active: p.active, sort: p.sort ?? 0, note: r.memo ?? '' };
    });
}

export interface CsvPlan { adds: CsvRoom[]; sets: { id: string; room: CsvRoom }[]; same: number }

const sameCsv = (a: CsvRoom, b: CsvRoom) => a.name === b.name && a.capacity === b.capacity && a.resourceKey === b.resourceKey && a.active === b.active && a.sort === b.sort && a.note === b.note;

/** CSV 로 읽은 방들 → 할 일. id 가 같은 방, 없으면 이름이 같은 방을 고치고(같은 값이면 건너뜀), 둘 다 없으면 더한다. */
export function planCsv(current: CsvRoom[], incoming: CsvRoom[]): CsvPlan {
    const plan: CsvPlan = { adds: [], sets: [], same: 0 };
    for (const r of incoming) {
        const cur = current.find((c) => c.id === r.id) ?? current.find((c) => c.name === r.name);
        if (!cur) plan.adds.push(r);
        else if (sameCsv(cur, r)) plan.same++;
        else plan.sets.push({ id: cur.id, room: r });
    }
    return plan;
}

const writeProps = (rooms: Rooms, id: string, r: CsvRoom) => rooms.setRoomProps(id, { capacity: r.capacity, resourceKey: r.resourceKey, active: r.active, sort: r.sort });

/** 할 일을 rooms 약속으로 쓴다. 더할 방은 listId 목록 끝에. 돌려주는 건 실제로 더한·고친 수. */
export function applyCsvPlan(rooms: Rooms, listId: string, plan: CsvPlan): { added: number; set: number } {
    let added = 0;
    for (const r of plan.adds) {
        const id = rooms.addRoom(listId, { name: r.name, memo: r.note });
        if (!id) continue;
        writeProps(rooms, id, r);
        added++;
    }
    for (const s of plan.sets) {
        rooms.updateRoom(s.id, { name: s.room.name, memo: s.room.note });
        writeProps(rooms, s.id, s.room);
    }
    return { added, set: plan.sets.length };
}

/** 고정 사용 불러오기 규칙 코드(roomImport)가 읽는 옛 꼴 — 방과 고정 사용. 고정 사용 id 는 읽을 때마다 붙이는 임시 번호. */
export function legacyOf(rooms: Rooms): { rooms: Room[]; fixed: RoomFixed[] } {
    const out: { rooms: Room[]; fixed: RoomFixed[] } = { rooms: [], fixed: [] };
    for (const r of allRooms(rooms)) {
        const p = rooms.roomProps(r.id);
        out.rooms.push({ id: r.id, name: r.name, capacity: p.capacity ?? 1, resourceKey: p.resourceKey || null, active: p.active, sort: p.sort ?? 0, note: r.memo ?? '' });
        fixedOf(r).forEach((f, i) => out.fixed.push({ id: `${r.id}#${i}`, roomId: r.id, ...f, label: f.label ?? '' }));
    }
    return out;
}

/**
 * 불러오기 결과(roomImport 의 next)를 rooms 약속으로 쓴다 — 새로 생긴 방은 addRoom, 고른 방의 고정 사용은 setRoomProps 로 통째로 바꾼다.
 *   applied = 반영한 방들(옛 id). 못 더한 방(addRoom 이 빈 id)은 그 방만 건너뛴다.
 */
export function writeImport(rooms: Rooms, listId: string, before: Room[], next: { rooms: Room[]; fixed: RoomFixed[] }, applied: { roomId: string }[]): void {
    const known = new Set(before.map((r) => r.id));
    for (const a of applied) {
        const room = next.rooms.find((r) => r.id === a.roomId);
        if (!room) continue;
        let id = room.id;
        if (!known.has(id)) {
            id = rooms.addRoom(listId, { name: room.name });
            if (!id) continue;
            rooms.setRoomProps(id, { capacity: room.capacity, sort: room.sort });
        }
        rooms.setRoomProps(id, { fixed: next.fixed.filter((f) => f.roomId === a.roomId).map((f) => ({ dayIndex: f.dayIndex, startMin: f.startMin, endMin: f.endMin, label: f.label })) });
    }
}
