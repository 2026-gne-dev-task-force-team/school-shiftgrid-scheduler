/**
 * 「방 예약」 플러그인 — 달력 약속(calendar 0.2)에 프리셋 한 장을 꽂는다. 화면·노드 타입은 없다(달력 것을 그대로 쓴다).
 *   🔴 방 목록은 컬렉션 레코드(collection.db · 칸: 이름) — 「방」 관계 칸이 kind:'db' 로 가리킨다(F1 B). 노드 약속으로 만든다 — 값 import 없이 타입 문자열만.
 */
import { definePlugin } from '../../pane-ui-system/plugin';
import type { Disposable, PluginHost } from '../../pane-ui-system/plugin';
import type { Calendar, CalendarPreset } from '../calendar/contracts/calendar';
import { manifest } from './manifest';

const ROOM_LIST_TYPE = 'collection.db';
/** 방 목록 컬렉션의 처음 꼴 — 제목 칸 「이름」 하나(나머지는 컬렉션 정규화가 채운다) */
const roomListData = () => ({ fields: [{ key: 'f_name', label: '이름', type: 'text' }], titleKey: 'f_name' });

export const ROOM_BOOKING_PRESET: CalendarPreset = {
    id: 'room-booking.default',
    label: '방 예약',
    icon: 'door',
    words: { store: '예약 목록', event: '예약', newEvent: '새 예약', unit: '건' },
    defaultView: 'week',
    baseFields: (store) => [{
        key: 'f_room', label: '방', type: 'relation',
        config: { target: { kind: 'db', nodeId: store.data.roomListId }, many: false },
    }],
    // 저장소 옆(같은 부모)에 「방 목록」을 만들고 그 id 를 저장소 data 에 둔다 — 부모가 못 받으면 루트에.
    onCreateStore({ storeId, nodes, setStoreData }) {
        const parent = nodes.parent(storeId) ?? nodes.roots.main;
        const roomListId = nodes.create(parent, { type: ROOM_LIST_TYPE, name: '방 목록', data: roomListData() }) || nodes.create(nodes.roots.main, { type: ROOM_LIST_TYPE, name: '방 목록', data: roomListData() });
        if (roomListId) setStoreData({ roomListId });
    },
};

let reg: Disposable | null = null;

export const roomBookingPlugin = definePlugin({
    manifest: { ...manifest, contributes: {} },
    lifecycle: {
        onActivate(host: PluginHost) { reg = host.modules.use<Calendar>('calendar')?.registerPreset(ROOM_BOOKING_PRESET) ?? null; },
    },
    deactivate() { reg?.dispose(); reg = null; },
});

export default roomBookingPlugin;
