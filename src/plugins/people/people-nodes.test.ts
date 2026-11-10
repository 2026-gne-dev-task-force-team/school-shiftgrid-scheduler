/**
 * 사람 명단 노드 증명 — 「명단(people.list)은 탐색기에 보이고, 사람(people.person)은 record 라 0줄. 저장·휴지통은 노드로」.
 *   다리 조작(더하기·휴지통·순서·붙여 넣기)의 본체는 컬렉션 바닥이라 collection/define.test 가 잰다 — 여기는
 *   ① 명단이 꽂는 실제 타입 둘·impl ② people 모듈 표면(이름·메모 ↔ 칸 값) ③ 설정(config)이 바닥에 제대로 얹히는지만 본다.
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

import { initStore, getState } from '../../pane-ui-system/core/node-store/store';
import { __resetPersistForTest } from '../../pane-ui-system/core/node-store/persist';
import { makeNodesApi } from '../../pane-ui-system/core/node-frame/api';
import { registerType, clearTypes, isRecordType, isContainerType } from '../../pane-ui-system/core/nodes/model/types';
import { clearDerived } from '../../pane-ui-system/core/nodes/model/derive';
import { flatten } from '../../pane-ui-system/core/nodes/model/tree';
import { buildMainRows } from '../../pane-ui-system/core/explorer/views/rows';
import { defineCollection } from '../collection/define';
import { peopleNodeTypes, peopleNodeTypeImpl, LIST_TYPE, PERSON_TYPE, getKit, setKit } from './nodes';
import { PERSON_CONFIG } from './config';
import { peopleApi } from './api';

function host(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
    } as unknown as PluginHost;
}

/** 폴더 + people 타입 둘을 꽂은 NodesApi 하나 + 컬렉션 kit 연결(활성이 하는 일을 직접). */
function wire() {
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
    const api = makeNodesApi('people');
    for (const nt of peopleNodeTypes) api.registerContributed(nt, { nodeTypes: peopleNodeTypeImpl }, host());
    setKit(defineCollection(PERSON_CONFIG));
    getKit()!.init(api);
    return api;
}

beforeEach(async () => {
    kv.store.clear(); kv.nodesWrite.mockClear();
    clearTypes(); clearDerived(); __resetPersistForTest();
    await initStore(host());
});
afterEach(() => { getKit()?.init(null); setKit(null); __resetPersistForTest(); });

describe('타입 둘 — 명단은 보이고 사람(record)은 탐색기 0줄', () => {
    it('접두사 people. · 명단은 flatten 에 · 사람은 안 보이고 byType·children 엔 있다', () => {
        const api = wire();
        expect(LIST_TYPE.startsWith('people.')).toBe(true);
        expect(PERSON_TYPE.startsWith('people.')).toBe(true);

        const root = api.roots.main;
        const lid = api.create(root, { type: LIST_TYPE, name: '우리 반' });
        const pid = api.create(lid, { type: PERSON_TYPE, name: '김하나', data: { values: { memo: '반장' } } });
        expect(lid).not.toBe('');
        expect(pid).not.toBe('');

        const tree = getState().tree;
        const flatIds = flatten(tree, root, isContainerType, { isRecord: isRecordType }).map((r) => r.id);
        expect(flatIds).toContain(lid);          // 명단은 탐색기에
        expect(flatIds).not.toContain(pid);      // 사람은 어디에도 안 보인다
        expect(buildMainRows(tree, root, isRecordType).map((r) => r.id)).not.toContain(pid);

        expect(api.byType(PERSON_TYPE).map((n) => n.id)).toEqual([pid]);
        expect(api.byType(LIST_TYPE).map((n) => n.id)).toEqual([lid]);
        expect(api.children(lid).map((n) => n.id)).toContain(pid);
    });

    it('명단 안에 명단 — 명단은 명단·폴더·사람을 받는다(달력 저장소와 같다)', () => {
        const api = wire();
        const lid = api.create(api.roots.main, { type: LIST_TYPE, name: '전교' });
        const sub = api.create(lid, { type: LIST_TYPE, name: '1학년' });
        const fid = api.create(api.roots.main, { type: 'folder', name: '폴더' });
        api.move(fid, lid);
        const pid = api.create(lid, { type: PERSON_TYPE, name: '이둘' });
        expect(api.parent(sub)).toBe(lid);
        expect(api.parent(fid)).toBe(lid);
        expect(api.children(lid).map((n) => n.id)).toEqual(expect.arrayContaining([sub, fid, pid]));
    });

    it('우클릭 메뉴(impl)는 kit 를 거친다 — 「명단 열기」 명령 하나', () => {
        const api = wire();
        const lid = api.create(api.roots.main, { type: LIST_TYPE, name: '명단' });
        expect(peopleNodeTypeImpl.list.menu(host(), lid)).toEqual([{ label: '명단 열기', icon: 'users', commandId: 'people.openList', commandArg: { nodeId: lid } }]);
    });
});

describe('people 모듈 표면 — 이름·메모 ↔ 칸 값', () => {
    it('addPerson·peopleIn·updatePerson·movePerson·pastePeople 가 같은 값을 준다', () => {
        const api = wire();
        const lid = api.create(api.roots.main, { type: LIST_TYPE, name: '표면명단' });
        const a = peopleApi.addPerson(lid, { name: '표면이', memo: '첫째' });
        peopleApi.addPerson(lid, { name: '둘째' });
        expect(peopleApi.version).toBe(1);
        expect(peopleApi.lists().map((l) => l.name)).toContain('표면명단');
        const rows = peopleApi.peopleIn(lid);
        expect(rows.map((p) => [p.name, p.memo])).toEqual([['표면이', '첫째'], ['둘째', undefined]]);
        expect(rows.every((p) => p.listId === lid)).toBe(true);

        peopleApi.updatePerson(a, { name: '바뀐이', memo: '' });
        expect(peopleApi.person(a)).toEqual({ id: a, listId: lid, name: '바뀐이' });   // 빈 메모는 안 싣는다

        const ids = peopleApi.pastePeople(lid, '셋째\t메모3\n\n넷째');
        expect(ids).toHaveLength(2);
        expect(peopleApi.peopleIn(lid).map((p) => p.name)).toEqual(['바뀐이', '둘째', '셋째', '넷째']);

        const l2 = api.create(api.roots.main, { type: LIST_TYPE, name: '다른 명단' });
        peopleApi.movePerson(a, l2);
        expect(peopleApi.peopleIn(l2).map((p) => p.id)).toEqual([a]);
        peopleApi.removePerson(a);
        expect(peopleApi.peopleIn(l2)).toEqual([]);
    });

    it('onChange 는 노드 변경마다 깨우고 dispose 로 멈춘다', () => {
        const api = wire();
        const lid = api.create(api.roots.main, { type: LIST_TYPE, name: '명단' });
        let n = 0;
        const sub = peopleApi.onChange(() => { n++; });
        peopleApi.addPerson(lid, { name: '하나' });
        expect(n).toBeGreaterThan(0);
        sub.dispose();
        const before = n;
        peopleApi.addPerson(lid, { name: '둘' });
        expect(n).toBe(before);
    });
});

describe('설정 — 기본 칸은 이름·메모, 트리 없음', () => {
    it('baseFields 는 이름·메모 둘뿐이고 전부 locked(지우기·타입 바꾸기 금지)', () => {
        expect(PERSON_CONFIG.baseFields.map((f) => f.key)).toEqual(['name', 'memo']);
        expect(PERSON_CONFIG.baseFields.every((f) => f.locked)).toBe(true);
        expect(PERSON_CONFIG.tree).toBeUndefined();
    });
});
