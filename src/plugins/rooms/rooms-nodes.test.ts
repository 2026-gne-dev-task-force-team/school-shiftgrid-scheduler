/**
 * 방 목록 노드 증명 — 「목록(rooms.list)은 탐색기에 보이고, 방(rooms.room)은 record 라 0줄. 저장·휴지통은 노드로」.
 *   달력·people 꼴: 노드 스토어(kv)를 메모리 Map 으로 모킹하고 탐색기 스토어를 세운 뒤,
 *   rooms 가 꽂는 타입 둘로 목록·방을 만들어 본다. 다리(nodes.ts) 조작(더하기·휴지통·순서·방 안에 방·붙여 넣기)도 여기서 잰다.
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

import { initStore, getState } from '../project-explorer/store';
import { __resetPersistForTest } from '../project-explorer/persist';
import { makeNodesApi } from '../project-explorer/api';
import { registerType, clearTypes, isRecordType, isContainerType } from '../project-explorer/model/types';
import { clearDerived } from '../project-explorer/model/derive';
import { flatten } from '../project-explorer/model/tree';
import { buildMainRows } from '../project-explorer/views/rows';
import {
    roomsNodeTypes, roomsNodeTypeImpl, LIST_TYPE, ROOM_TYPE,
    initRoomsNodes, roomsIn, roomOf, addRoom, removeRoom, nudgeRoom,
    setParentRoom, indentRoom, outdentRoom, pasteRooms, listsOf, inTrash,
} from './nodes';
import { buildRoomTree } from './tree';
import { roomsApi } from './api';

function host(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
    } as unknown as PluginHost;
}

/** 폴더 + rooms 타입 둘을 꽂은 NodesApi 하나 + 다리 연결. */
function wire() {
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
    const api = makeNodesApi('rooms');
    for (const nt of roomsNodeTypes) api.registerContributed(nt, { nodeTypes: roomsNodeTypeImpl }, host());
    initRoomsNodes(api);
    return api;
}

beforeEach(async () => {
    kv.store.clear(); kv.nodesWrite.mockClear();
    clearTypes(); clearDerived(); __resetPersistForTest();
    await initStore(host());
});
afterEach(() => { initRoomsNodes(null); __resetPersistForTest(); });

describe('타입 둘 — 목록은 보이고 방(record)은 탐색기 0줄', () => {
    it('접두사 rooms. · 목록은 flatten 에 · 방은 안 보이고 byType·children 엔 있다', () => {
        const api = wire();
        expect(LIST_TYPE.startsWith('rooms.')).toBe(true);
        expect(ROOM_TYPE.startsWith('rooms.')).toBe(true);

        const root = api.roots.main;
        const lid = api.create(root, { type: LIST_TYPE, name: '본관 방들' });
        const rid = api.create(lid, { type: ROOM_TYPE, name: '1층 복도 끝 방', data: { memo: '창고' } });
        expect(lid).not.toBe('');
        expect(rid).not.toBe('');

        const tree = getState().tree;
        const flatIds = flatten(tree, root, isContainerType, { isRecord: isRecordType }).map((r) => r.id);
        expect(flatIds).toContain(lid);          // 목록은 탐색기에
        expect(flatIds).not.toContain(rid);      // 방은 어디에도 안 보인다
        expect(buildMainRows(tree, root, isRecordType).map((r) => r.id)).not.toContain(rid);

        // API 론 보인다
        expect(api.byType(ROOM_TYPE).map((n) => n.id)).toEqual([rid]);
        expect(api.byType(LIST_TYPE).map((n) => n.id)).toEqual([lid]);
        expect(api.children(lid).map((n) => n.id)).toContain(rid);
    });

    it('목록 안에 목록 — 목록은 목록·폴더·방을 받는다(달력 저장소와 같다)', () => {
        const api = wire();
        const lid = api.create(api.roots.main, { type: LIST_TYPE, name: '전체' });
        const sub = api.create(lid, { type: LIST_TYPE, name: '별관' });     // 목록 안 목록
        const fid = api.create(api.roots.main, { type: 'folder', name: '폴더' });
        api.move(fid, lid);                                                  // 폴더도 든다
        const rid = api.create(lid, { type: ROOM_TYPE, name: '지하 방' });     // 방도 든다
        expect(api.parent(sub)).toBe(lid);
        expect(api.parent(fid)).toBe(lid);
        expect(api.children(lid).map((n) => n.id)).toEqual(expect.arrayContaining([sub, fid, rid]));
    });
});

describe('다리 조작 — 더하기·휴지통·순서·붙여 넣기', () => {
    it('roomsIn 은 그 목록의 살아 있는 방만, 이름·메모를 읽는다', () => {
        const api = wire();
        const lid = api.create(api.roots.main, { type: LIST_TYPE, name: '목록' });
        addRoom(lid, { name: '가 방', memo: '첫째' });
        addRoom(lid, { name: '나 방' });
        const rows = roomsIn(lid);
        expect(rows.map((r) => r.name)).toEqual(['가 방', '나 방']);
        expect(rows[0].memo).toBe('첫째');
        expect(rows[1].memo).toBeUndefined();
        expect(rows.every((r) => r.listId === lid)).toBe(true);
    });

    it('지우기 = 휴지통 — roomsIn 에서 빠지지만 노드는 남고 inTrash 가 참', () => {
        const api = wire();
        const lid = api.create(api.roots.main, { type: LIST_TYPE, name: '목록' });
        const a = addRoom(lid, { name: '있다가 방' });
        addRoom(lid, { name: '남을 방' });
        removeRoom(a);
        expect(roomsIn(lid).map((r) => r.name)).toEqual(['남을 방']);     // 목록에서 빠진다
        expect(api.get(a)).toBeTruthy();                                  // 노드는 영구 삭제가 아니다
        expect(inTrash(a)).toBe(true);                                    // 휴지통에 있다
    });

    it('순서 바꾸기 — nudge 로 위·아래 한 칸(같은 형제 안)', () => {
        const api = wire();
        const lid = api.create(api.roots.main, { type: LIST_TYPE, name: '목록' });
        const a = addRoom(lid, { name: '하나 방' });
        addRoom(lid, { name: '둘 방' });
        addRoom(lid, { name: '셋 방' });
        nudgeRoom(a, 1);                                                  // 하나를 아래로
        expect(roomsIn(lid).map((r) => r.name)).toEqual(['둘 방', '하나 방', '셋 방']);
        nudgeRoom(a, -1);                                                 // 다시 위로
        expect(roomsIn(lid).map((r) => r.name)).toEqual(['하나 방', '둘 방', '셋 방']);
    });

    it('붙여 넣기 — 탭·줄바꿈 텍스트가 방 여럿이 되고 빈 줄은 무시', () => {
        const api = wire();
        const lid = api.create(api.roots.main, { type: LIST_TYPE, name: '목록' });
        const ids = pasteRooms(lid, '첫 방\t메모1\r\n\n둘째 방\t메모2\n셋째 방');
        expect(ids.length).toBe(3);
        const rows = roomsIn(lid);
        expect(rows.map((r) => r.name)).toEqual(['첫 방', '둘째 방', '셋째 방']);
        expect(rows.map((r) => r.memo ?? '')).toEqual(['메모1', '메모2', '']);
    });

    it('rooms 모듈 표면(roomsApi) 도 다리로 같은 값을 준다', () => {
        const api = wire();
        const lid = api.create(api.roots.main, { type: LIST_TYPE, name: '표면 목록' });
        roomsApi.addRoom(lid, { name: '표면 방' });
        expect(roomsApi.version).toBe(1);
        expect(roomsApi.lists().map((l) => l.name)).toContain('표면 목록');
        expect(roomsApi.roomsIn(lid).map((r) => r.name)).toEqual(['표면 방']);
        // listsOf 직통도 같다
        expect(listsOf().map((l) => l.id)).toContain(lid);
    });
});

describe('방 안에 방 — parentId·순환 막기·부모 지울 때', () => {
    it('setParentRoom 으로 방을 다른 방 밑에 — roomOf.parentId 로 읽고 트리로 들여쓴다', () => {
        const api = wire();
        const lid = api.create(api.roots.main, { type: LIST_TYPE, name: '목록' });
        const a = addRoom(lid, { name: '건물 방' });
        const b = addRoom(lid, { name: '층 방' });
        setParentRoom(b, a);                                             // b 를 a 밑으로
        expect(roomOf(b)?.parentId).toBe(a);
        const tree = buildRoomTree(roomsIn(lid));
        expect(tree.map((x) => [roomOf(x.room.id)?.name, x.depth])).toEqual([
            ['건물 방', 0], ['층 방', 1],
        ]);
    });

    it('🔴 순환 막기 — 자기 자손을 부모로 두려 하면 조용히 거절(parentId 안 바뀐다)', () => {
        const api = wire();
        const lid = api.create(api.roots.main, { type: LIST_TYPE, name: '목록' });
        const a = addRoom(lid, { name: 'a 방' });
        const b = addRoom(lid, { name: 'b 방' });
        setParentRoom(b, a);                                             // a → b
        setParentRoom(a, b);                                            // a 의 부모를 자손 b 로 → 거절
        expect(roomOf(a)?.parentId).toBeUndefined();                    // 안 바뀌었다
        expect(roomOf(b)?.parentId).toBe(a);
        // 자기 자신을 부모로도 거절
        setParentRoom(a, a);
        expect(roomOf(a)?.parentId).toBeUndefined();
    });

    it('다른 목록의 방을 부모로 두려 하면 거절', () => {
        const api = wire();
        const l1 = api.create(api.roots.main, { type: LIST_TYPE, name: '목록1' });
        const l2 = api.create(api.roots.main, { type: LIST_TYPE, name: '목록2' });
        const a = addRoom(l1, { name: 'a 방' });
        const other = addRoom(l2, { name: '남 목록 방' });
        setParentRoom(a, other);                                        // 다른 목록의 방 → 거절
        expect(roomOf(a)?.parentId).toBeUndefined();
    });

    it('🔴 부모 방을 지우면 자식은 목록 최상위로 올라온다', () => {
        const api = wire();
        const lid = api.create(api.roots.main, { type: LIST_TYPE, name: '목록' });
        const parent = addRoom(lid, { name: '부모 방' });
        const child = addRoom(lid, { name: '자식 방' });
        setParentRoom(child, parent);
        expect(buildRoomTree(roomsIn(lid)).find((x) => x.room.id === child)?.depth).toBe(1);
        removeRoom(parent);                                             // 부모를 휴지통으로
        const tree = buildRoomTree(roomsIn(lid));
        expect(tree.map((x) => x.room.id)).toEqual([child]);           // 부모는 빠지고
        expect(tree[0].depth).toBe(0);                                 // 자식은 최상위로
    });

    it('들여/내어쓰기 — → 는 앞 형제를 부모로, ← 는 부모의 부모로', () => {
        const api = wire();
        const lid = api.create(api.roots.main, { type: LIST_TYPE, name: '목록' });
        const a = addRoom(lid, { name: 'a 방' });
        const b = addRoom(lid, { name: 'b 방' });
        indentRoom(b);                                                  // b 를 앞 형제 a 밑으로
        expect(roomOf(b)?.parentId).toBe(a);
        indentRoom(a);                                                 // a 는 맨 앞 형제 → 대상 없음(무시)
        expect(roomOf(a)?.parentId).toBeUndefined();
        outdentRoom(b);                                                // b 를 최상위로(a 의 부모 = 없음)
        expect(roomOf(b)?.parentId).toBeUndefined();
    });
});
