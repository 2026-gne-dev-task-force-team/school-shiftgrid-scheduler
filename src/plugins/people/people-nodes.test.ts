/**
 * 사람 명단 노드 증명 — 「명단(people.list)은 탐색기에 보이고, 사람(people.person)은 record 라 0줄. 저장·휴지통은 노드로」.
 *   달력 calendar-nodes.test 꼴: 노드 스토어(kv)를 메모리 Map 으로 모킹하고 탐색기 스토어를 세운 뒤,
 *   people 이 꽂는 타입 둘로 명단·사람을 만들어 본다. 다리(nodes.ts) 조작(더하기·휴지통·순서·붙여 넣기)도 여기서 잰다.
 *   ⛔ 실명 금지(공개 레포) — 지어낸 이름만.
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

import { initStore, getState } from '../explorer/store';
import { __resetPersistForTest } from '../explorer/persist';
import { makeNodesApi } from '../explorer/api';
import { registerType, clearTypes, isRecordType, isContainerType } from '../explorer/model/types';
import { clearDerived } from '../explorer/model/derive';
import { flatten } from '../explorer/model/tree';
import { buildMainRows } from '../explorer/views/rows';
import {
    peopleNodeTypes, peopleNodeTypeImpl, LIST_TYPE, PERSON_TYPE,
    initPeopleNodes, peopleIn, addPerson, removePerson, nudgePerson, pastePeople, listsOf, inTrash,
} from './nodes';
import { peopleApi } from './api';

function host(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
    } as unknown as PluginHost;
}

/** 폴더 + people 타입 둘을 꽂은 NodesApi 하나 + 다리 연결. */
function wire() {
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
    const api = makeNodesApi('people');
    for (const nt of peopleNodeTypes) api.registerContributed(nt, { nodeTypes: peopleNodeTypeImpl }, host());
    initPeopleNodes(api);
    return api;
}

beforeEach(async () => {
    kv.store.clear(); kv.nodesWrite.mockClear();
    clearTypes(); clearDerived(); __resetPersistForTest();
    await initStore(host());
});
afterEach(() => { initPeopleNodes(null); __resetPersistForTest(); });

describe('타입 둘 — 명단은 보이고 사람(record)은 탐색기 0줄', () => {
    it('접두사 people. · 명단은 flatten 에 · 사람은 안 보이고 byType·children 엔 있다', () => {
        const api = wire();
        expect(LIST_TYPE.startsWith('people.')).toBe(true);
        expect(PERSON_TYPE.startsWith('people.')).toBe(true);

        const root = api.roots.main;
        const lid = api.create(root, { type: LIST_TYPE, name: '우리 반' });
        const pid = api.create(lid, { type: PERSON_TYPE, name: '김하나', data: { memo: '반장' } });
        expect(lid).not.toBe('');
        expect(pid).not.toBe('');

        const tree = getState().tree;
        const flatIds = flatten(tree, root, isContainerType, { isRecord: isRecordType }).map((r) => r.id);
        expect(flatIds).toContain(lid);          // 명단은 탐색기에
        expect(flatIds).not.toContain(pid);      // 사람은 어디에도 안 보인다
        expect(buildMainRows(tree, root, isRecordType).map((r) => r.id)).not.toContain(pid);

        // API 론 보인다
        expect(api.byType(PERSON_TYPE).map((n) => n.id)).toEqual([pid]);
        expect(api.byType(LIST_TYPE).map((n) => n.id)).toEqual([lid]);
        expect(api.children(lid).map((n) => n.id)).toContain(pid);
    });

    it('명단 안에 명단 — 명단은 명단·폴더·사람을 받는다(달력 저장소와 같다)', () => {
        const api = wire();
        const lid = api.create(api.roots.main, { type: LIST_TYPE, name: '전교' });
        const sub = api.create(lid, { type: LIST_TYPE, name: '1학년' });     // 명단 안 명단
        const fid = api.create(api.roots.main, { type: 'folder', name: '폴더' });
        api.move(fid, lid);                                                   // 폴더도 든다
        const pid = api.create(lid, { type: PERSON_TYPE, name: '이둘' });      // 사람도 든다
        expect(api.parent(sub)).toBe(lid);
        expect(api.parent(fid)).toBe(lid);
        expect(api.children(lid).map((n) => n.id)).toEqual(expect.arrayContaining([sub, fid, pid]));
    });
});

describe('다리 조작 — 더하기·휴지통·순서·붙여 넣기', () => {
    it('peopleIn 은 그 명단의 살아 있는 사람만, 이름·메모를 읽는다', () => {
        const api = wire();
        const lid = api.create(api.roots.main, { type: LIST_TYPE, name: '명단' });
        addPerson(lid, { name: '가가', memo: '첫째' });
        addPerson(lid, { name: '나나' });
        const rows = peopleIn(lid);
        expect(rows.map((p) => p.name)).toEqual(['가가', '나나']);
        expect(rows[0].memo).toBe('첫째');
        expect(rows[1].memo).toBeUndefined();
        expect(rows.every((p) => p.listId === lid)).toBe(true);
    });

    it('지우기 = 휴지통 — peopleIn 에서 빠지지만 노드는 남고 inTrash 가 참', () => {
        const api = wire();
        const lid = api.create(api.roots.main, { type: LIST_TYPE, name: '명단' });
        const a = addPerson(lid, { name: '있다가' });
        addPerson(lid, { name: '남을이' });
        removePerson(a);
        expect(peopleIn(lid).map((p) => p.name)).toEqual(['남을이']);   // 목록에서 빠진다
        expect(api.get(a)).toBeTruthy();                                  // 노드는 영구 삭제가 아니다
        expect(inTrash(a)).toBe(true);                                    // 휴지통에 있다
    });

    it('순서 바꾸기 — nudge 로 위·아래 한 칸', () => {
        const api = wire();
        const lid = api.create(api.roots.main, { type: LIST_TYPE, name: '명단' });
        const a = addPerson(lid, { name: '하나' });
        addPerson(lid, { name: '둘' });
        addPerson(lid, { name: '셋' });
        nudgePerson(a, 1);                                               // 하나를 아래로
        expect(peopleIn(lid).map((p) => p.name)).toEqual(['둘', '하나', '셋']);
        nudgePerson(a, -1);                                              // 다시 위로
        expect(peopleIn(lid).map((p) => p.name)).toEqual(['하나', '둘', '셋']);
    });

    it('붙여 넣기 — 탭·줄바꿈 텍스트가 사람 여럿이 되고 빈 줄은 무시', () => {
        const api = wire();
        const lid = api.create(api.roots.main, { type: LIST_TYPE, name: '명단' });
        const ids = pastePeople(lid, '첫째\t메모1\r\n\n둘째\t메모2\n셋째');
        expect(ids.length).toBe(3);
        const rows = peopleIn(lid);
        expect(rows.map((p) => p.name)).toEqual(['첫째', '둘째', '셋째']);
        expect(rows.map((p) => p.memo ?? '')).toEqual(['메모1', '메모2', '']);
    });

    it('같은 사람을 두 명단에 — 그냥 다른 두 줄이다(연결 없음)', () => {
        const api = wire();
        const l1 = api.create(api.roots.main, { type: LIST_TYPE, name: '명단A' });
        const l2 = api.create(api.roots.main, { type: LIST_TYPE, name: '명단B' });
        const p1 = addPerson(l1, { name: '같은이름' });
        const p2 = addPerson(l2, { name: '같은이름' });
        expect(p1).not.toBe(p2);                                         // 노드 id 가 다르다
        expect(peopleIn(l1).map((p) => p.id)).toEqual([p1]);
        expect(peopleIn(l2).map((p) => p.id)).toEqual([p2]);
    });

    it('people 모듈 표면(peopleApi) 도 다리로 같은 값을 준다', () => {
        const api = wire();
        const lid = api.create(api.roots.main, { type: LIST_TYPE, name: '표면명단' });
        peopleApi.addPerson(lid, { name: '표면이' });
        expect(peopleApi.version).toBe(1);
        expect(peopleApi.lists().map((l) => l.name)).toContain('표면명단');
        expect(peopleApi.peopleIn(lid).map((p) => p.name)).toEqual(['표면이']);
        // listsOf 직통도 같다
        expect(listsOf().map((l) => l.id)).toContain(lid);
    });
});
