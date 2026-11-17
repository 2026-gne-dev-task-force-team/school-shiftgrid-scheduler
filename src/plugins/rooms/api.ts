/**
 * 🔴 rooms 인터페이스 모듈 — manifest.provides.rooms 와 짝. host.modules.use<Rooms>('rooms') 가 이걸 받는다.
 *   속은 컬렉션 kit(nodes.ts 가 쥔 것)로만 — 항목(칸 값) ↔ 약속의 Room(이름·메모·부모) 변환만 여기서 한다.
 *   ⛔ 호출자별 팩토리 아님 — 목록·방은 누가 봐도 같다(저장·휴지통 주인은 노드 시스템이 쥔다).
 */
import type { CollectionItem } from '../collection/contracts/collection';
import type { Rooms, Room, RoomProps, RoomPropsPatch } from './contracts/rooms';
import type { Disposable } from '../../pane-ui-system/plugin';
import { getKit, getNodes } from './nodes';
import { ROOM_TYPE } from './config';

/** 방 속성이 사는 ext 이름공간 — 플러그인 id(방 예약)와 같다. */
export const ROOM_PROPS_KEY = 'room-booking';

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? v as Record<string, unknown> : {});
const isMin = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1440;
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** 고정 사용 목록 값 꼴 검사 + 정규화 — 한 줄이라도 틀리면 null(전체 거절). */
function cleanFixed(v: unknown): Record<string, unknown>[] | null {
    if (!Array.isArray(v)) return null;
    const out: Record<string, unknown>[] = [];
    for (const x of v) {
        const f = rec(x);
        if (!(typeof f.dayIndex === 'number' && Number.isInteger(f.dayIndex) && f.dayIndex >= 0 && f.dayIndex <= 6)) return null;
        if (!isMin(f.startMin) || !isMin(f.endMin) || f.startMin >= f.endMin) return null;
        if (f.label !== undefined && typeof f.label !== 'string') return null;
        out.push({ dayIndex: f.dayIndex, startMin: f.startMin, endMin: f.endMin, label: f.label ?? '' });
    }
    return out;
}

/** 차단 시간 목록 값 꼴 검사 + 정규화 — 한 줄이라도 틀리면 null. 시각은 둘 다 있거나(from<to) 둘 다 없음(종일). */
function cleanBlocks(v: unknown): Record<string, unknown>[] | null {
    if (!Array.isArray(v)) return null;
    const out: Record<string, unknown>[] = [];
    for (const x of v) {
        const b = rec(x);
        if (!isDate(b.startDate) || !isDate(b.endDate) || b.startDate > b.endDate) return null;
        const from = b.fromMin ?? null;
        const to = b.toMin ?? null;
        if ((from === null) !== (to === null)) return null;
        if (from !== null && to !== null && (!isMin(from) || !isMin(to) || from >= to)) return null;
        if (b.reason !== undefined && typeof b.reason !== 'string') return null;
        out.push({ startDate: b.startDate, endDate: b.endDate, fromMin: from, toMin: to, reason: b.reason ?? '' });
    }
    return out;
}

function readProps(raw: unknown): RoomProps {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const p: RoomProps = { active: typeof r.active === 'boolean' ? r.active : true };
    if (isCount(r.capacity)) p.capacity = r.capacity;
    if (typeof r.resourceKey === 'string' && r.resourceKey !== '') p.resourceKey = r.resourceKey;
    if (isNum(r.sort)) p.sort = r.sort;
    return p;
}

function setProps(id: string, patch: RoomPropsPatch): void {
    const nodes = getNodes();
    const n = nodes?.get(id);
    if (!nodes || !n || n.type !== ROOM_TYPE) return;
    const data = (n.data && typeof n.data === 'object' ? n.data : {}) as Record<string, unknown>;
    const ext = (data.ext && typeof data.ext === 'object' ? data.ext : {}) as Record<string, unknown>;
    const mine = { ...((ext[ROOM_PROPS_KEY] && typeof ext[ROOM_PROPS_KEY] === 'object' ? ext[ROOM_PROPS_KEY] : {}) as Record<string, unknown>) };
    const apply = (key: string, v: unknown, ok: (x: unknown) => boolean): void => {
        if (v === null) delete mine[key];
        else if (v !== undefined && ok(v)) mine[key] = v;
    };
    apply('capacity', patch.capacity, isCount);
    apply('resourceKey', patch.resourceKey, (x) => typeof x === 'string' && x !== '');
    apply('active', patch.active, (x) => typeof x === 'boolean');
    apply('sort', patch.sort, isNum);
    for (const [key, clean] of [['fixed', cleanFixed], ['blocks', cleanBlocks]] as const) {
        const v = patch[key];
        if (v === null) delete mine[key];
        else if (v !== undefined) { const c = clean(v); if (c) mine[key] = c; }
    }
    nodes.setData(id, { ...data, ext: { ...ext, [ROOM_PROPS_KEY]: mine } });
}

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
    roomProps: (id) => readProps(getKit()?.itemOf(id)?.ext?.[ROOM_PROPS_KEY]),
    setRoomProps: setProps,
    onChange: (listener): Disposable => getKit()?.onChange(listener) ?? { dispose() { /* kit 없음 */ } },
};
