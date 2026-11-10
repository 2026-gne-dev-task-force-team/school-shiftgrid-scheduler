/**
 * 컬렉션 바닥(defineCollection) 증명 — 명단·방 목록이 설정 한 장씩으로 쓰는 다리 전부를 여기서 한 번에 잰다(옛 두 벌 테스트를 합쳤다).
 *   「목록 노드는 탐색기에 보이고 항목(record)은 0줄 · 저장·휴지통은 노드로」 + 값·사용자 칸·붙여 넣기·순서·(트리일 때) 방 안에 방.
 *   노드 스토어(kv)는 메모리 Map 으로 모킹한다. ⛔ 실명 금지(공개 레포) — 지어낸 이름만.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PluginHost, NodeTypeContribution } from '../../pane-ui-system/plugin';

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
import type { CollectionConfig, CollectionKit } from './contracts/collection';
import { defineCollection } from './define';
import { effectiveParentId } from './tree';
import { initRecordNodes, liveRelationTargets } from './nodes';

const BASE: CollectionConfig = {
    listType: 'demo.list', itemType: 'demo.item', viewId: 'demo.sheet', openCommandId: 'demo.openList', viewKey: 'demo.list',
    listLabel: '묶음', listIcon: 'users', unit: '개',
    baseFields: [
        { key: 'name', label: '이름', type: 'text', locked: true },
        { key: 'memo', label: '메모', type: 'text', locked: true },
    ],
    text: { startDescription: '고른다', startHint: '빈 묶음' },
};
const FLAT = BASE;
const TREE: CollectionConfig = { ...BASE, tree: { parentLabel: '부모' } };

function host(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
    } as unknown as PluginHost;
}

const types = (cfg: CollectionConfig): NodeTypeContribution[] => [
    { type: cfg.listType, label: cfg.listLabel, icon: 'users', container: { accepts: [cfg.itemType, 'folder', cfg.listType] }, openable: true },
    { type: cfg.itemType, label: '항목', icon: 'user', record: true },
];

/** 폴더 + 설정의 타입 둘을 꽂은 NodesApi 하나 + kit 연결. */
function wire(cfg: CollectionConfig) {
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
    const api = makeNodesApi('demo');
    for (const nt of types(cfg)) api.registerContributed(nt, { nodeTypes: {} }, host());
    const kit = defineCollection(cfg);
    kit.init(api);
    return { api, kit };
}

let current: CollectionKit | null = null;
beforeEach(async () => {
    kv.store.clear(); kv.nodesWrite.mockClear();
    clearTypes(); clearDerived(); __resetPersistForTest();
    await initStore(host());
});
afterEach(() => { current?.init(null); current = null; __resetPersistForTest(); });

const names = (kit: CollectionKit, listId: string) => kit.itemsIn(listId).map((i) => i.name);

describe.each([['평평한 컬렉션', FLAT], ['트리 컬렉션', TREE]])('%s — 다리 조작', (_label, cfg) => {
    it('타입 둘 — 목록은 탐색기에 보이고 항목(record)은 0줄, API 론 보인다', () => {
        const { api, kit } = wire(cfg); current = kit;
        const root = api.roots.main;
        const lid = api.create(root, { type: cfg.listType, name: '우리 묶음' });
        const iid = api.create(lid, { type: cfg.itemType, name: '가가', data: { values: { memo: '첫째' } } });
        const tree = getState().tree;
        const flatIds = flatten(tree, root, isContainerType, { isRecord: isRecordType }).map((r) => r.id);
        expect(flatIds).toContain(lid);
        expect(flatIds).not.toContain(iid);
        expect(buildMainRows(tree, root, isRecordType).map((r) => r.id)).not.toContain(iid);
        expect(api.byType(cfg.itemType).map((n) => n.id)).toEqual([iid]);
        expect(api.children(lid).map((n) => n.id)).toContain(iid);
    });

    it('addItem·itemsIn — 이름은 노드 이름, 나머지는 data.values · 빈 값은 안 담는다', () => {
        const { api, kit } = wire(cfg); current = kit;
        const lid = api.create(api.roots.main, { type: cfg.listType, name: '묶음' });
        const a = kit.addItem(lid, { name: ' 가가 ', memo: ' 첫째 ' });
        kit.addItem(lid, { name: '나나' });
        const rows = kit.itemsIn(lid);
        expect(rows.map((r) => r.name)).toEqual(['가가', '나나']);
        expect(rows[0].values).toEqual({ memo: '첫째' });
        expect(rows[1].values).toEqual({});
        expect(rows.every((r) => r.listId === lid)).toBe(true);
        expect(api.get(a)?.data).toEqual({ values: { memo: '첫째' } });
        expect(kit.itemOf(a)?.name).toBe('가가');
    });

    it('setValue — 제목 칸은 이름 바꾸기 · 문자열은 trim · 빈 값은 지운다 · ext·다른 data 는 그대로', () => {
        const { api, kit } = wire(cfg); current = kit;
        const lid = api.create(api.roots.main, { type: cfg.listType, name: '묶음' });
        const id = api.create(lid, { type: cfg.itemType, name: '하나', data: { values: { memo: 'x' }, ext: { 위층: 1 } } });
        kit.setValue(id, 'name', ' 둘 ');
        expect(api.get(id)?.name).toBe('둘');
        kit.setValue(id, 'f_team', ' 가 ');
        kit.setValue(id, 'memo', '');
        expect(kit.itemOf(id)?.values).toEqual({ f_team: '가' });
        expect(kit.itemOf(id)?.ext).toEqual({ 위층: 1 });
        kit.setValue(id, 'f_team', null);
        expect(kit.itemOf(id)?.values).toEqual({});
    });

    it('지우기 = 휴지통 — itemsIn 에서 빠지지만 노드는 남고 inTrash 가 참 · lists 도 휴지통 목록을 뺀다', () => {
        const { api, kit } = wire(cfg); current = kit;
        const lid = api.create(api.roots.main, { type: cfg.listType, name: '묶음' });
        const a = kit.addItem(lid, { name: '있다가' });
        kit.addItem(lid, { name: '남을이' });
        kit.removeItem(a);
        expect(names(kit, lid)).toEqual(['남을이']);
        expect(api.get(a)).toBeTruthy();
        expect(kit.inTrash(a)).toBe(true);
        expect(kit.lists().map((l) => l.id)).toEqual([lid]);
        api.remove(lid);
        expect(kit.lists()).toEqual([]);
    });

    it('순서 바꾸기 — reorderItem(id, beforeId) 로 그 앞에 · null 이면 맨 끝', () => {
        const { api, kit } = wire(cfg); current = kit;
        const lid = api.create(api.roots.main, { type: cfg.listType, name: '묶음' });
        const a = kit.addItem(lid, { name: '하나' });
        const b = kit.addItem(lid, { name: '둘' });
        const c = kit.addItem(lid, { name: '셋' });
        kit.reorderItem(a, null);                 // 하나를 맨 끝으로
        expect(names(kit, lid)).toEqual(['둘', '셋', '하나']);
        kit.reorderItem(c, b);                    // 셋을 둘 앞으로
        expect(names(kit, lid)).toEqual(['셋', '둘', '하나']);
        kit.reorderItem(b, b);                    // 제자리 — 무변경
        expect(names(kit, lid)).toEqual(['셋', '둘', '하나']);
    });

    it('순서 바꾸기는 사이에 낀 폴더·하위 목록을 건드리지 않고 항목 순서만 바꾼다', () => {
        const { api, kit } = wire(cfg); current = kit;
        const lid = api.create(api.roots.main, { type: cfg.listType, name: '묶음' });
        const a = kit.addItem(lid, { name: '하나' });
        api.create(lid, { type: cfg.listType, name: '하위 목록' });
        const b = kit.addItem(lid, { name: '둘' });
        kit.reorderItem(b, a);
        expect(names(kit, lid)).toEqual(['둘', '하나']);
    });

    it('붙여 넣기 — 탭·줄바꿈 텍스트가 항목 여럿이 되고(열 = 기본 칸 순서) 빈 줄은 무시 · 한 묶음', () => {
        const { api, kit } = wire(cfg); current = kit;
        const lid = api.create(api.roots.main, { type: cfg.listType, name: '묶음' });
        const ids = kit.pasteItems(lid, '첫째\t메모1\r\n\n둘째\t메모2\n셋째');
        expect(ids.length).toBe(3);
        const rows = kit.itemsIn(lid);
        expect(rows.map((r) => r.name)).toEqual(['첫째', '둘째', '셋째']);
        expect(rows.map((r) => r.values.memo ?? '')).toEqual(['메모1', '메모2', '']);
    });

    it('같은 이름을 두 목록에 — 그냥 다른 두 줄이다(연결 없음)', () => {
        const { api, kit } = wire(cfg); current = kit;
        const l1 = api.create(api.roots.main, { type: cfg.listType, name: 'A' });
        const l2 = api.create(api.roots.main, { type: cfg.listType, name: 'B' });
        const p1 = kit.addItem(l1, { name: '같은이름' });
        const p2 = kit.addItem(l2, { name: '같은이름' });
        expect(p1).not.toBe(p2);
        expect(kit.itemsIn(l1).map((p) => p.id)).toEqual([p1]);
        expect(kit.itemsIn(l2).map((p) => p.id)).toEqual([p2]);
    });

    it('사용자 칸 정의 — 목록 노드 data.fields 로 왕복 · 다른 목록 data 는 그대로', () => {
        const { api, kit } = wire(cfg); current = kit;
        const lid = api.create(api.roots.main, { type: cfg.listType, name: '묶음', data: { 다른: 1 } });
        expect(kit.userFieldsOf(lid)).toEqual([]);
        kit.setUserFields(lid, [{ key: 'f_team', label: '모둠', type: 'select', options: [{ value: 'a', label: '가' }] }]);
        expect(kit.userFieldsOf(lid).map((f) => f.key)).toEqual(['f_team']);
        expect(api.get(lid)?.data).toMatchObject({ 다른: 1 });
    });

    it('createList — 이름이 겹치면 「묶음 2」 · 보고 있는 목록은 열 때 정해진다(저장 안 함)', () => {
        const { kit } = wire(cfg); current = kit;
        const l1 = kit.createList();
        const l2 = kit.createList();
        expect(kit.lists().map((l) => l.name)).toEqual(['묶음', '묶음 2']);
        expect(kit.active()).toBeNull();
        kit.open({ workspace: { open: () => 'x' } } as unknown as PluginHost, l2!);
        expect(kit.active()).toBe(l2);
        expect(l1).not.toBe(l2);
    });

    it('목록 우클릭 메뉴 — 명령만 싣고, 부른 목록을 명령 대상으로 잡는다', () => {
        const { api, kit } = wire(cfg); current = kit;
        const lid = api.create(api.roots.main, { type: cfg.listType, name: '묶음' });
        expect(kit.menu(lid)).toEqual([{ label: '묶음 열기', icon: 'users', commandId: 'demo.openList', commandArg: { nodeId: lid } }]);
        const opened: string[] = [];
        (api as unknown as { open: (id: string) => void }).open = (id) => { opened.push(id); };
        kit.openList(lid);
        expect(opened).toEqual([lid]);
    });
});

describe('트리 컬렉션 — 방 안에 방(parentId · 순환 막기 · 부모 지울 때)', () => {
    it('setParent 로 항목을 다른 항목 밑에 — itemOf.parentId 로 읽는다', () => {
        const { api, kit } = wire(TREE); current = kit;
        const lid = api.create(api.roots.main, { type: TREE.listType, name: '묶음' });
        const a = kit.addItem(lid, { name: '건물' });
        const b = kit.addItem(lid, { name: '층' });
        kit.setParent(b, a);
        expect(kit.itemOf(b)?.parentId).toBe(a);
        expect(kit.itemOf(a)?.parentId).toBeUndefined();
    });

    it('🔴 순환 막기 — 자기 자손·자기 자신을 부모로 두려 하면 조용히 거절', () => {
        const { api, kit } = wire(TREE); current = kit;
        const lid = api.create(api.roots.main, { type: TREE.listType, name: '묶음' });
        const a = kit.addItem(lid, { name: 'a' });
        const b = kit.addItem(lid, { name: 'b' });
        kit.setParent(b, a);
        kit.setParent(a, b);
        expect(kit.itemOf(a)?.parentId).toBeUndefined();
        expect(kit.itemOf(b)?.parentId).toBe(a);
        kit.setParent(a, a);
        expect(kit.itemOf(a)?.parentId).toBeUndefined();
    });

    it('다른 목록의 항목을 부모로 두려 하면 거절', () => {
        const { api, kit } = wire(TREE); current = kit;
        const l1 = api.create(api.roots.main, { type: TREE.listType, name: '목록1' });
        const l2 = api.create(api.roots.main, { type: TREE.listType, name: '목록2' });
        const a = kit.addItem(l1, { name: 'a' });
        const other = kit.addItem(l2, { name: '남 목록' });
        kit.setParent(a, other);
        expect(kit.itemOf(a)?.parentId).toBeUndefined();
    });

    it('🔴 부모를 지우면 자식은 최상위로 올라온다(effectiveParentId 가 null)', () => {
        const { api, kit } = wire(TREE); current = kit;
        const lid = api.create(api.roots.main, { type: TREE.listType, name: '묶음' });
        const parent = kit.addItem(lid, { name: '부모' });
        const child = kit.addItem(lid, { name: '자식' });
        kit.setParent(child, parent);
        expect(effectiveParentId(kit.itemsIn(lid), child)).toBe(parent);
        kit.removeItem(parent);
        expect(effectiveParentId(kit.itemsIn(lid), child)).toBeNull();
    });

    it('들여/내어쓰기 — 들여쓰기는 앞 형제를 부모로(맨 앞은 무시) · 내어쓰기는 부모의 부모로', () => {
        const { api, kit } = wire(TREE); current = kit;
        const lid = api.create(api.roots.main, { type: TREE.listType, name: '묶음' });
        const a = kit.addItem(lid, { name: 'a' });
        const b = kit.addItem(lid, { name: 'b' });
        kit.indent(b);
        expect(kit.itemOf(b)?.parentId).toBe(a);
        kit.indent(a);                                   // 맨 앞 형제 — 대상 없음
        expect(kit.itemOf(a)?.parentId).toBeUndefined();
        kit.outdent(b);
        expect(kit.itemOf(b)?.parentId).toBeUndefined();
    });

    it('수동 순서로 끌어 놓으면 그 앞 항목의 부모로 재부모화된다', () => {
        const { api, kit } = wire(TREE); current = kit;
        const lid = api.create(api.roots.main, { type: TREE.listType, name: '묶음' });
        const p = kit.addItem(lid, { name: '부모' });
        const c1 = kit.addItem(lid, { name: '자식1' });
        const x = kit.addItem(lid, { name: '밖' });
        kit.setParent(c1, p);
        kit.reorderItem(x, c1);                          // 밖 을 자식1 앞으로 → 부모 밑으로 들어온다
        expect(kit.itemOf(x)?.parentId).toBe(p);
        expect(names(kit, lid)).toEqual(['부모', '밖', '자식1']);
        kit.reorderItem(x, null);                        // 맨 끝 → 최상위로
        expect(kit.itemOf(x)?.parentId).toBeUndefined();
    });
});

describe('평평한 컬렉션 — 트리 조작은 아무 일 없음', () => {
    it('setParent·indent·outdent 가 parentId 를 안 만든다', () => {
        const { api, kit } = wire(FLAT); current = kit;
        const lid = api.create(api.roots.main, { type: FLAT.listType, name: '묶음' });
        const a = kit.addItem(lid, { name: 'a' });
        const b = kit.addItem(lid, { name: 'b' });
        kit.setParent(b, a); kit.indent(b); kit.outdent(b);
        expect(kit.itemOf(b)?.parentId).toBeUndefined();
        expect(api.get(b)?.data).not.toHaveProperty('parentId');
    });
});

describe('관계 칸 대상 — 설정 한 장으로 만든 목록도 「어느 목록을 가리키나」 후보에 뜬다', () => {
    it('defineCollection 이 목록 타입을 등록 → liveRelationTargets 에 그 목록이 「종류 · 이름」으로', () => {
        const { api, kit } = wire(BASE); current = kit;
        const d = initRecordNodes(api);
        const lid = api.create(api.roots.main, { type: BASE.listType, name: '별관' });
        expect(liveRelationTargets()).toContainEqual({ id: lid, label: '묶음 · 별관' });
        d?.dispose(); initRecordNodes(null);
    });
});
