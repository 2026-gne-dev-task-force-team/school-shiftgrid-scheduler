/**
 * 「방 예약」 플러그인 — 딱 둘을 엮는다: 달력(calendar 0.2 프리셋 한 장) + 방 목록(rooms). 화면·노드 타입은 없다(둘의 것을 그대로 쓴다).
 *   🔴 「방」 관계 칸이 방 목록 플러그인의 목록 노드(rooms.list)를 kind:'db' 로 가리킨다(설계 4-2). 값 import 없이 타입 문자열만(구조 검사 ⑨).
 *   방 목록은 같이 쓴다 — 살아 있는 방 목록이 있으면 그걸, 없으면 저장소 옆에 새로(쥔님 11-10 14:00 「같이 쓰기, 일단」).
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { Disposable, PluginHost } from '../../pane-ui-system/plugin';
import type { Calendar, CalendarPreset } from '../calendar/contracts/calendar';
import type { Rooms } from '../rooms/contracts/rooms';
import type { NodesApi } from '../../pane-ui-system/core/nodes/contracts/nodes';
import { manifest } from './manifest';
import { BOOKER_FIELD, HEADCOUNT_FIELD, PRESET_ID, ROOM_FIELD, judgeBooking, roomIdOf } from './rules';
import { RoomPropsView } from './RoomPropsView';
import { RoomBookingView } from './RoomBookingView';

const ROOM_LIST_TYPE = 'rooms.list';
const STORE_TYPE = 'calendar.store';

// 저장 전 규칙이 쓰는 손잡이 — 활성 때 꽂고 끌 때 뺀다(프리셋은 모듈 상수라 호스트를 직접 못 든다).
let rooms: Rooms | null = null;

/** 저장 전 규칙 — 방 칸이 비었거나 방을 못 읽으면 통과(판단할 게 없다). 거절 사유의 토스트는 달력이 띄운다(여기서 또 띄우지 않는다). */
export const roomBookingBeforeSave: NonNullable<CalendarPreset['beforeSave']> = (draft) => {
    const id = roomIdOf(draft.values);
    const room = id ? rooms?.room(id) : undefined;
    if (!rooms || !room) return { ok: true };
    const reason = judgeBooking(room, rooms.roomProps(id), draft);
    if (!reason) return { ok: true };
    return { ok: false, reason };
};

export const ROOM_BOOKING_PRESET: CalendarPreset = {
    id: PRESET_ID,
    label: '방 예약',
    icon: 'doorClock',
    words: { store: '예약 목록', event: '예약', newEvent: '새 예약', unit: '건' },
    defaultView: 'week',
    baseFields: (store) => [{
        key: ROOM_FIELD, label: '방', type: 'relation',
        config: { target: { kind: 'db', nodeId: store.data.roomListId }, many: false },
    }, {
        key: HEADCOUNT_FIELD, label: '인원', type: 'number',
    }, {
        key: BOOKER_FIELD, label: '예약자', type: 'text',
    }],
    beforeSave: (draft, ctx) => roomBookingBeforeSave(draft, ctx),
    // 있는 방 목록(첫 것)을 가리키고, 없으면 저장소 옆(같은 부모)에 만든다 — 부모가 못 받으면 루트에.
    onCreateStore({ storeId, nodes, setStoreData }) {
        const existing = nodes.liveByType(ROOM_LIST_TYPE)[0]?.id;
        const parent = nodes.parent(storeId) ?? nodes.roots.main;
        const roomListId = existing
            || nodes.create(parent, { type: ROOM_LIST_TYPE, name: '방 목록' })
            || nodes.create(nodes.roots.main, { type: ROOM_LIST_TYPE, name: '방 목록' });
        if (roomListId) setStoreData({ roomListId });
    },
};

let reg: Disposable | null = null;

export const roomBookingPlugin = definePlugin({
    // 팔레트 「새 방 예약」 — 탐색기 + 메뉴는 등록 타입만 돌아 프리셋을 모른다(저장소 우클릭에만 있던 입구를 하나 더). 루트에 만든다.
    manifest: {
        ...manifest,
        contributes: {
            commands: [
                { id: 'room-booking.open', title: '방 예약 열기', icon: 'doorClock' },
                { id: 'room-booking.new', title: '새 방 예약', icon: 'doorClock' },
                { id: 'room-booking.props', title: '방 속성 열기', icon: 'doorClock' },
                { id: 'room-booking.book', title: '방 예약하기 열기', icon: 'doorClock' },
            ],
            // 리본 「방 예약」 — 누를 때마다 새로 만들지 않는다: 있으면 첫 예약 목록을 열고, 없을 때만 만든다(쥔님 11-10 15:13)
            ribbon: [{ commandId: 'room-booking.open', icon: 'doorClock', order: 5 }],
            // 방마다 정원·쓰는 방·고정 사용·차단 시간을 보는 화면 — 값은 rooms 의 ext 에만 둔다(방은 속성 패널 없이 「열기」 페이지로 여는 판정이라 화면을 따로 둔다).
            views: [{
                id: 'room-props', title: '방 속성', icon: 'doorClock', defaultArea: 'center',
                placement: { areas: ['center'], singleton: true },
                layout: { minWidth: 280, squeeze: 'scroll' },
                component: 'RoomProps',
            }, {
                // 예약하기 · 빈 방 찾기 · 내 예약 — 자료는 달력 일정(예약 목록)과 rooms 약속뿐, 여기엔 저장소가 없다.
                id: 'book', title: '방 예약하기', icon: 'doorClock', defaultArea: 'center',
                placement: { areas: ['center'], singleton: true },
                layout: { minWidth: 280, squeeze: 'scroll' },
                component: 'Book',
            }],
        },
    },
    components: {
        RoomProps: ({ host }: { host: PluginHost }) => createElement(RoomPropsView, { host }),
        Book: ({ host }: { host: PluginHost }) => createElement(RoomBookingView, { host }),
    },
    commands: {
        'room-booking.open': (host: PluginHost) => {
            const nodes = host.modules.use<NodesApi>('nodes');
            const mine = nodes?.liveByType(STORE_TYPE).find((n) => (n.data as { preset?: unknown } | undefined)?.preset === ROOM_BOOKING_PRESET.id);
            if (mine) nodes!.open(mine.id);
            else host.modules.use<Calendar>('calendar')?.newPresetStore(ROOM_BOOKING_PRESET.id);
        },
        'room-booking.props': (host: PluginHost) => { host.workspace.open('room-booking.room-props', { where: 'center' }); },
        'room-booking.book': (host: PluginHost) => { host.workspace.open('room-booking.book', { where: 'center' }); },
        'room-booking.new': (host: PluginHost) => { host.modules.use<Calendar>('calendar')?.newPresetStore(ROOM_BOOKING_PRESET.id); },
    },
    lifecycle: {
        onActivate(host: PluginHost) {
            rooms = host.modules.use<Rooms>('rooms') ?? null;
            reg = host.modules.use<Calendar>('calendar')?.registerPreset(ROOM_BOOKING_PRESET) ?? null;
        },
    },
    deactivate() { reg?.dispose(); reg = null; rooms = null; },
});

export default roomBookingPlugin;
