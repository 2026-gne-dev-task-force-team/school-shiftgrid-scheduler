/**
 * 🔴 rooms 인터페이스 모듈 — manifest.provides.rooms 와 짝. host.modules.use<Rooms>('rooms') 가 이걸 받는다.
 *   속은 노드 다리(nodes.ts)로만 — 다리가 쥔 NodesApi 를 읽고 쓴다(값은 모듈 전역이라 호출 시점에 산다).
 *   ⛔ 호출자별 팩토리 아님 — 목록·방은 누가 봐도 같다(저장·휴지통 주인은 노드 시스템이 쥔다).
 */
import type { Rooms } from './contracts/rooms';
import type { Disposable } from '../../pane-ui-system/plugin';
import {
    listsOf, roomsIn, roomOf, addRoom, updateRoom, removeRoom, moveRoom, setParentRoom, pasteRooms, onNodesChange,
} from './nodes';

export const roomsApi: Rooms = {
    version: 1,
    lists: () => listsOf(),
    roomsIn: (listId) => roomsIn(listId),
    room: (id) => roomOf(id),
    addRoom: (listId, input) => addRoom(listId, input),
    updateRoom: (id, patch) => updateRoom(id, patch),
    removeRoom: (id) => removeRoom(id),
    moveRoom: (id, listId, index) => moveRoom(id, listId, index),
    setParentRoom: (id, parentId) => setParentRoom(id, parentId),
    pasteRooms: (listId, text) => pasteRooms(listId, text),
    onChange: (listener): Disposable => onNodesChange(listener),
};
