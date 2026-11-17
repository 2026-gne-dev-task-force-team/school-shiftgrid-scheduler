/**
 * 방 목록 노드 증명 — 「목록(rooms.list)은 탐색기에 보이고, 방(rooms.room)은 record 라 0줄. 저장·휴지통은 노드로」.
 *   다리 조작(더하기·휴지통·순서·붙여 넣기·방 안에 방)의 본체는 컬렉션 바닥이라 collection/define.test 가 잰다 — 여기는
 *   ① 방 목록이 꽂는 실제 타입 둘·impl ② rooms 모듈 표면(이름·메모·부모 ↔ 칸 값) ③ 설정(config)이 바닥에 제대로 얹히는지만 본다.
 *   ⛔ 실명 금지(공개 레포) — 지어낸 방 이름만.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PluginHost } from '../../pane-ui-system/plugin';

const kv = vi.hoisted(() => {
    const store = new Map<string, Record<string, unknown>>();
    const nodesGetAll = vi.fn(async (): Promise<unknown[] | null> => [...store.values()]);
    const nodesWrite = vi.fn(async (batch: { put?: Record<string, unknown>[]; del?: string[]; clear?: boolean }): Promise<boolean> => {
        if (batch.clear) store.clear();
        for (const v of batch.put ?? []) store.set(v.id as string, v);
        for (const id of batch.del ?? []) store.delete(id);
        return true;
    });
    return { store, nodesGetAll, nodesWrite };
});
vi.mock('../../pane-ui-system/kv', () => ({ nodesGetAll: kv.nodesGetAll, nodesWrite: kv.nodesWrite }));

import { initStore, getState } from '../../pane-ui-system/core/node-store/store';
import { __resetPersistForTest } from '../../pane-ui-system/core/node-store/persist';
import { makeNodesApi } from '../../pane-ui-system/core/node-frame/api';
import { registerType, clearTypes, isRecordType, isContainerType } from '../../pane-ui-system/core/nodes/model/types';
import { clearDerived } from '../../pane-ui-system/core/nodes/model/derive';
import { flatten } from '../../pane-ui-system/core/nodes/model/tree';
import { buildMainRows } from '../../pane-ui-system/core/explorer/views/rows';
import { defineCollection } from '../collection/define';
import { roomsNodeTypes, roomsNodeTypeImpl, LIST_TYPE, ROOM_TYPE, getKit, setKit, setNodes } from './nodes';
import { ROOM_CONFIG } from './config';
import { roomsApi } from './api';

function host(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
    } as unknown as PluginHost;
}

/** 폴더 + rooms 타입 둘을 꽂은 NodesApi 하나 + 컬렉션 kit 연결(활성이 하는 일을 직접). */
function wire() {
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
    const api = makeNodesApi('rooms');
    for (const nt of roomsNodeTypes) api.registerContributed(nt, { nodeTypes: roomsNodeTypeImpl }, host());
    setKit(defineCollection(ROOM_CONFIG));
    getKit()!.init(api);
    setNodes(api);
    return api;
}

beforeEach(async () => {
    kv.store.clear(); kv.nodesWrite.mockClear();
    clearTypes(); clearDerived(); __resetPersistForTest();
    await initStore(host());
});
afterEach(() => { getKit()?.init(null); setKit(null); setNodes(null); __resetPersistForTest(); });

describe('타입 둘 — 목록은 보이고 방(record)은 탐색기 0줄', () => {
    it('접두사 rooms. · 목록은 flatten 에 · 방은 안 보이고 byType·children 엔 있다', () => {
        const api = wire();
        expect(LIST_TYPE.startsWith('rooms.')).toBe(true);
        expect(ROOM_TYPE.startsWith('rooms.')).toBe(true);

        const root = api.roots.main;
        const lid = api.create(root, { type: LIST_TYPE, name: '본관 방들' });
        const rid = api.create(lid, { type: ROOM_TYPE, name: '1층 복도 끝 방', data: { values: { memo: '창고' } } });
        expect(lid).not.toBe('');
        expect(rid).not.toBe('');

        const tree = getState().tree;
        const flatIds = flatten(tree, root, isContainerType, { isRecord: isRecordType }).map((r) => r.id);
        expect(flatIds).toContain(lid);
        expect(flatIds).not.toContain(rid);
        expect(buildMainRows(tree, root, isRecordType).map((r) => r.id)).not.toContain(rid);

        expect(api.byType(ROOM_TYPE).map((n) => n.id)).toEqual([rid]);
        expect(api.byType(LIST_TYPE).map((n) => n.id)).toEqual([lid]);
        expect(api.children(lid).map((n) => n.id)).toContain(rid);
    });

    it('목록 안에 목록 — 목록은 목록·폴더·방을 받는다(달력 저장소와 같다)', () => {
        const api = wire();
        const lid = api.create(api.roots.main, { type: LIST_TYPE, name: '전체' });
        const sub = api.create(lid, { type: LIST_TYPE, name: '별관' });
        const fid = api.create(api.roots.main, { type: 'folder', name: '폴더' });
        api.move(fid, lid);
        const rid = api.create(lid, { type: ROOM_TYPE, name: '지하 방' });
        expect(api.parent(sub)).toBe(lid);
        expect(api.parent(fid)).toBe(lid);
        expect(api.children(lid).map((n) => n.id)).toEqual(expect.arrayContaining([sub, fid, rid]));
    });

    it('우클릭 메뉴(impl)는 kit 를 거친다 — 「방 목록 열기」 명령 하나', () => {
        const api = wire();
        const lid = api.create(api.roots.main, { type: LIST_TYPE, name: '목록' });
        expect(roomsNodeTypeImpl.list.menu(host(), lid)).toEqual([{ label: '방 목록 열기', icon: 'door', commandId: 'rooms.openList', commandArg: { nodeId: lid } }]);
    });
});

describe('rooms 모듈 표면 — 이름·메모·부모 ↔ 칸 값', () => {
    it('addRoom·roomsIn·updateRoom·setParentRoom·pasteRooms·moveRoom 이 같은 값을 준다', () => {
        const api = wire();
        const lid = api.create(api.roots.main, { type: LIST_TYPE, name: '표면 목록' });
        const a = roomsApi.addRoom(lid, { name: '건물 방', memo: '본관' });
        const b = roomsApi.addRoom(lid, { name: '층 방' });
        expect(roomsApi.version).toBe(1);
        expect(roomsApi.lists().map((l) => l.name)).toContain('표면 목록');
        expect(roomsApi.roomsIn(lid).map((r) => [r.name, r.memo])).toEqual([['건물 방', '본관'], ['층 방', undefined]]);

        roomsApi.setParentRoom(b, a);
        expect(roomsApi.room(b)?.parentId).toBe(a);
        roomsApi.updateRoom(b, { name: '2층 방', memo: '메모' });
        expect(roomsApi.room(b)).toEqual({ id: b, listId: lid, name: '2층 방', memo: '메모', parentId: a });   // 이름·메모를 고쳐도 부모는 그대로
        roomsApi.setParentRoom(b, null);
        expect(roomsApi.room(b)?.parentId).toBeUndefined();

        expect(roomsApi.pasteRooms(lid, '지하\t창고\n\n옥상')).toHaveLength(2);
        const l2 = api.create(api.roots.main, { type: LIST_TYPE, name: '다른 목록' });
        roomsApi.moveRoom(a, l2);
        expect(roomsApi.roomsIn(l2).map((r) => r.id)).toEqual([a]);
        roomsApi.removeRoom(a);
        expect(roomsApi.roomsIn(l2)).toEqual([]);
    });
});

describe('설정 — 기본 칸은 이름·메모, 트리(방 안에 방) 켜짐', () => {
    it('baseFields 는 이름·메모 둘뿐이고 전부 locked · tree 가 켜져 있다', () => {
        expect(ROOM_CONFIG.baseFields.map((f) => f.key)).toEqual(['name', 'memo']);
        expect(ROOM_CONFIG.baseFields.every((f) => f.locked)).toBe(true);
        expect(ROOM_CONFIG.tree).toEqual({ parentLabel: '부모 방' });
    });
});

describe("방 속성 — ext['room-booking'] 읽기·쓰기", () => {
    it('ext 없는 방은 기본값({active:true}) · 쓰기→읽기 왕복 · 이름·메모·부모·다른 ext 키는 그대로', () => {
        const api = wire();
        const lid = api.create(api.roots.main, { type: LIST_TYPE, name: '속성 목록' });
        const a = roomsApi.addRoom(lid, { name: '큰 방', memo: '메모' });
        const other = api.create(lid, { type: ROOM_TYPE, name: '남의 칸 방', data: { values: {}, ext: { other: { x: 1 } } } });
        expect(roomsApi.roomProps(a)).toEqual({ active: true });
        expect(roomsApi.roomProps('없는 방')).toEqual({ active: true });

        roomsApi.setRoomProps(a, { capacity: 30, resourceKey: 'room-big', active: false, sort: 2 });
        expect(roomsApi.roomProps(a)).toEqual({ capacity: 30, resourceKey: 'room-big', active: false, sort: 2 });
        expect(roomsApi.room(a)).toMatchObject({ name: '큰 방', memo: '메모' });

        // 부분 고치기 — 생략은 그대로 · null 은 지우기(active 는 기본값 복귀) · 잘못된 값은 그 칸만 무시
        roomsApi.setRoomProps(a, { capacity: 40, resourceKey: null, active: null, sort: Number.NaN });
        expect(roomsApi.roomProps(a)).toEqual({ capacity: 40, active: true, sort: 2 });
        roomsApi.setRoomProps(a, { capacity: -1 });
        expect(roomsApi.roomProps(a).capacity).toBe(40);

        // 다른 위층 키(ext['other'])·같은 ext 의 다른 키를 안 건드린다
        roomsApi.setRoomProps(other, { capacity: 5 });
        expect(roomsApi.room(other)?.ext).toEqual({ other: { x: 1 }, 'room-booking': { capacity: 5 } });
        // 이름 고치기·부모 정하기도 속성을 안 지운다
        roomsApi.updateRoom(a, { name: '큰 방 2' });
        roomsApi.setParentRoom(a, other);
        expect(roomsApi.roomProps(a).capacity).toBe(40);
        expect(roomsApi.room(a)?.parentId).toBe(other);
        // 방이 아닌 노드(목록)에는 쓰지 않는다
        roomsApi.setRoomProps(lid, { capacity: 9 });
        expect((api.get(lid)?.data as { ext?: unknown } | undefined)?.ext).toBeUndefined();
    });
});
