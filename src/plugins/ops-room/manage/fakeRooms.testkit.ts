/** 시험 전용 — rooms 약속을 메모리로 흉내(방 목록 하나 · ext['room-booking'] 병합 · 지어낸 이름만). 구현 규칙은 rooms 쪽 시험이 맡는다. */
import type { Room, Rooms, RoomProps, RoomPropsPatch } from '../../rooms/contracts/rooms';

export function fakeRooms(seed: { id: string; name: string; props?: RoomPropsPatch }[] = [], withList = true): Rooms & { snapshot(): Room[] } {
    let n = 0;
    let list: Room[] = [];
    const subs = new Set<() => void>();
    const emit = () => subs.forEach((f) => f());
    const get = (id: string) => list.find((r) => r.id === id);
    const setProps = (id: string, p: RoomPropsPatch) => {
        const r = get(id);
        if (!r) return;
        const mine = { ...((r.ext?.['room-booking'] as Record<string, unknown> | undefined) ?? {}) };
        for (const [k, v] of Object.entries(p)) { if (v === null) delete mine[k]; else if (v !== undefined) mine[k] = v; }
        r.ext = { ...r.ext, 'room-booking': mine };
        emit();
    };
    const api: Rooms & { snapshot(): Room[] } = {
        version: 1,
        lists: () => (withList ? [{ id: 'L1', name: '가상 목록' }] : []),
        roomsIn: () => list,
        room: get,
        addRoom: (listId, input) => { if (!withList) return ''; const id = `fr${++n}`; list = [...list, { id, listId, name: input.name, memo: input.memo }]; emit(); return id; },
        updateRoom: (id, patch) => { const r = get(id); if (r) { if (patch.name !== undefined) r.name = patch.name; if (patch.memo !== undefined) r.memo = patch.memo; emit(); } },
        removeRoom: (id) => { list = list.filter((r) => r.id !== id); emit(); },
        moveRoom: () => undefined, setParentRoom: () => undefined, pasteRooms: () => [],
        roomProps: (id): RoomProps => {
            const m = (get(id)?.ext?.['room-booking'] ?? {}) as Partial<RoomProps>;
            return { active: m.active ?? true, capacity: m.capacity, resourceKey: m.resourceKey, sort: m.sort };
        },
        setRoomProps: setProps,
        onChange: (f) => { subs.add(f); return { dispose: () => { subs.delete(f); } }; },
        snapshot: () => list,
    };
    if (withList) for (const s of seed) { list.push({ id: s.id, listId: 'L1', name: s.name }); if (s.props) setProps(s.id, s.props); }
    return api;
}
