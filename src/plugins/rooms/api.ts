/**
 * 🔴 rooms 인터페이스 모듈 — manifest.provides.rooms 와 짝. host.modules.use<Rooms>('rooms') 가 이걸 받는다.
 *   속은 컬렉션 kit(nodes.ts 가 쥔 것)로만 — 항목(칸 값) ↔ 약속의 Room(이름·메모·부모) 변환만 여기서 한다.
 *   ⛔ 호출자별 팩토리 아님 — 목록·방은 누가 봐도 같다(저장·휴지통 주인은 노드 시스템이 쥔다).
 */
import type { CollectionItem } from '../collection/contracts/collection';
import type { Rooms, Room } from './contracts/rooms';
import type { Disposable } from '../../pane-ui-system/plugin';
import { getKit } from './nodes';

function toRoom(it: CollectionItem): Room {
    const r: Room = { id: it.id, listId: it.listId, name: it.name };
    if (typeof it.values.memo === 'string' && it.values.memo !== '') r.memo = it.values.memo;
    if (it.parentId) r.parentId = it.parentId;
    if (it.ext) r.ext = it.ext;
    return r;
}

export const roomsApi: Rooms = {
    version: 1,
    lists: () => getKit()?.lists() ?? [],
    roomsIn: (listId) => getKit()?.itemsIn(listId).map(toRoom) ?? [],
    room: (id) => { const it = getKit()?.itemOf(id); return it ? toRoom(it) : undefined; },
    addRoom: (listId, input) => getKit()?.addItem(listId, { name: input.name, memo: input.memo ?? '' }) ?? '',
    updateRoom: (id, patch) => {
        const k = getKit();
        if (patch.name !== undefined) k?.setValue(id, 'name', patch.name);
        if (patch.memo !== undefined) k?.setValue(id, 'memo', patch.memo);
    },
    removeRoom: (id) => getKit()?.removeItem(id),
    moveRoom: (id, listId, index) => getKit()?.moveItem(id, listId, index),
    setParentRoom: (id, parentId) => getKit()?.setParent(id, parentId),
    pasteRooms: (listId, text) => getKit()?.pasteItems(listId, text) ?? [],
    onChange: (listener): Disposable => getKit()?.onChange(listener) ?? { dispose() { /* kit 없음 */ } },
};
