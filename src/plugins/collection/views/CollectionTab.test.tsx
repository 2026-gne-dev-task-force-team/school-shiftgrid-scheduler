// @vitest-environment jsdom
/**
 * 컬렉션 화면 검산 — ① 항목 인스펙터(ItemProps): 사용자 칸이 보이고, 고르기 칸도 인스펙터에서 고쳐져 표(값)에 반영된다.
 *   ② ⭐ 「빈 컬렉션으로도 똑같이 만들 수 있다」(R5): 명단 프리셋과, 같은 칸을 손으로 적은 빈 설정이 **같은 화면**을 낸다 — 프리셋은 설정 한 장일 뿐이다.
 *   노드 저장은 define.test 와 같은 메모리 kv 모킹. 지어낸 이름만.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PluginHost } from '../../../pane-ui-system/plugin';

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
vi.mock('../../../pane-ui-system/kv', () => ({ nodesGetAll: kv.nodesGetAll, nodesWrite: kv.nodesWrite }));

import { initStore, undoAction, undoAllowed } from '../../../pane-ui-system/core/node-store/store';
import { __resetPersistForTest } from '../../../pane-ui-system/core/node-store/persist';
import { makeNodesApi } from '../../../pane-ui-system/core/node-frame/api';
import { registerType, clearTypes } from '../../../pane-ui-system/core/nodes/model/types';
import { clearDerived } from '../../../pane-ui-system/core/nodes/model/derive';
import { defineCollection } from '../define';
import { pasteToTsv, deleteWithUndo } from './CollectionTab';
import type { CollectionConfig, CollectionKit } from '../contracts/collection';
import { peopleNodeTypes, peopleNodeTypeImpl } from '../../people/nodes';
import { PERSON_CONFIG } from '../../people/config';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const host = {
    storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
    store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
    modules: { use: () => null },
    workspace: { open: () => 'x' },
} as unknown as PluginHost;

let roots: Root[] = [];
let kits: CollectionKit[] = [];
beforeEach(async () => {
    kv.store.clear();
    clearTypes(); clearDerived(); __resetPersistForTest(); localStorage.clear();
    await initStore(host);
});
afterEach(() => {
    act(() => { roots.forEach((r) => r.unmount()); });
    roots = []; document.body.innerHTML = '';
    kits.forEach((k) => k.init(null)); kits = [];
    __resetPersistForTest();
});

function mount(ui: React.ReactElement): HTMLDivElement {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const r = createRoot(el);
    roots.push(r);
    act(() => { r.render(ui); });
    return el;
}
const click = (el: Element | null) => act(() => { (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });

/** 명단 프리셋 — 실제 people 타입 둘 + PERSON_CONFIG. */
function presetKit() {
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
    const api = makeNodesApi('people');
    for (const nt of peopleNodeTypes) api.registerContributed(nt, { nodeTypes: peopleNodeTypeImpl }, host);
    const kit = defineCollection(PERSON_CONFIG);
    kit.init(api); kits.push(kit);
    return { api, kit, listType: PERSON_CONFIG.listType };
}

describe('ItemProps — 목록의 사용자 칸이 인스펙터에 보이고 고쳐진다', () => {
    it('고르기 칸: 라벨이 보이고 · 고르면 값에 들어간다 · 기본 칸 둘이 있다', () => {
        const { api, kit, listType } = presetKit();
        const lid = api.create(api.roots.main, { type: listType, name: '우리 반' });
        const pid = kit.addItem(lid, { name: '김하나' });
        kit.setUserFields(lid, [{ key: 'f_team', label: '모둠', type: 'select', options: [{ value: 'a', label: '가' }, { value: 'b', label: '나' }] }]);

        mount(createElement(kit.Props, { host, target: { type: PERSON_CONFIG.itemType, id: pid } }));
        expect(document.querySelector('[data-rv-prop="f_team"]')?.textContent).toContain('모둠');
        expect(document.querySelector('[data-rv-prop="name"]')).toBeTruthy();
        expect(document.querySelector('[data-rv-prop="_list"]')).toBeTruthy();
        expect(document.querySelector('[data-rv-prop="_parent"]')).toBeNull();   // 트리가 아니면 부모 칸이 없다
        click(document.querySelector('[data-rv-prop="f_team"] [data-rv-cell="f_team"]'));
        click(document.querySelector('[data-rv-opt="b"]'));
        expect(kit.itemOf(pid)?.values).toEqual({ f_team: 'b' });
        expect(kit.itemOf(pid)?.name).toBe('김하나');
    });

    it('트리 컬렉션이면 「부모」 칸이 보기 전용으로 뜬다', () => {
        const cfg: CollectionConfig = { ...PERSON_CONFIG, tree: { parentLabel: '부모 방' } };
        const api = makeNodesApi('people');
        registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
        for (const nt of peopleNodeTypes) api.registerContributed(nt, { nodeTypes: peopleNodeTypeImpl }, host);
        const kit = defineCollection(cfg); kit.init(api); kits.push(kit);
        const lid = api.create(api.roots.main, { type: cfg.listType, name: '목록' });
        const a = kit.addItem(lid, { name: '건물' });
        const b = kit.addItem(lid, { name: '층' });
        kit.setParent(b, a);
        mount(createElement(kit.Props, { host, target: { type: cfg.itemType, id: b } }));
        expect(document.querySelector('[data-rv-prop="_parent"]')?.textContent).toContain('부모 방');
        expect(document.querySelector('[data-rv-prop="_parent"]')?.textContent).toContain('건물');
    });
});

describe('빈 컬렉션 = 프리셋 — 같은 칸을 손으로 적으면 같은 화면', () => {
    it('명단 프리셋과 손으로 적은 빈 컬렉션이 같은 머리·같은 줄·같은 글을 그린다', () => {
        const { api: pApi, kit: pKit } = presetKit();

        // 손으로 — 프리셋 상수를 안 쓰고 칸·이름표를 직접 적은 별개 설정(타입 접두사만 다르다)
        const hand: CollectionConfig = {
            listType: 'demo.list', itemType: 'demo.item', viewId: 'demo.sheet', openCommandId: 'demo.openList', viewKey: 'demo.list',
            listLabel: '명단', listIcon: 'users', unit: '명',
            baseFields: [
                { key: 'name', label: '이름', type: 'text', locked: true },
                { key: 'memo', label: '메모', type: 'text', locked: true },
            ],
            text: { startDescription: '새로 만들거나, 만들어 둔 명단을 고른다.', startHint: '빈 명단이 바로 열린다' },
        };
        const hApi = makeNodesApi('demo');
        hApi.registerContributed({ type: 'demo.list', label: '명단', icon: 'users', container: { accepts: ['demo.item', 'folder', 'demo.list'] }, openable: true }, { nodeTypes: {} }, host);
        hApi.registerContributed({ type: 'demo.item', label: '사람', icon: 'user', record: true }, { nodeTypes: {} }, host);
        const hKit = defineCollection(hand); hKit.init(hApi); kits.push(hKit);

        const fill = (api: typeof pApi, kit: CollectionKit, listType: string) => {
            const lid = api.create(api.roots.main, { type: listType, name: '우리 반' });
            kit.addItem(lid, { name: '김하나', memo: '반장' });
            kit.addItem(lid, { name: '이둘' });
            kit.setUserFields(lid, [{ key: 'f_team', label: '모둠', type: 'text' }]);
            act(() => { kit.setActive(lid); });
        };
        fill(pApi, pKit, PERSON_CONFIG.listType);
        fill(hApi, hKit, hand.listType);

        const a = mount(createElement(pKit.Tab, {}));
        const b = mount(createElement(hKit.Tab, {}));
        const heads = (el: HTMLElement) => [...el.querySelectorAll('[data-rv-head]')].map((h) => h.getAttribute('data-rv-head'));
        expect(heads(a)).toEqual(['name', 'memo', 'f_team']);
        expect(heads(b)).toEqual(heads(a));
        expect(a.querySelectorAll('[data-rv-row]').length).toBe(2);
        expect(b.querySelectorAll('[data-rv-row]').length).toBe(2);
        expect(b.textContent).toBe(a.textContent);
        expect(a.textContent).toContain('2명');
    });

    it('보고 있는 목록이 없으면 시작 화면 — 새 목록 만들기 + 만들어 둔 목록', () => {
        const { api, kit, listType } = presetKit();
        api.create(api.roots.main, { type: listType, name: '만들어 둔 명단' });
        const el = mount(createElement(kit.Tab, {}));
        expect(el.textContent).toContain('새 명단');
        expect(el.textContent).toContain('만들어 둔 명단');
    });
});

describe('pasteToTsv — 레코드 뷰 붙여넣기를 기본 칸 순서 TSV 로', () => {
    it('보이는 칸 순서가 달라도 기본 칸 순서로 · 없는 칸은 빈 글자', () => {
        expect(pasteToTsv({ keys: ['memo', 'name'], rows: [['m1', 'n1'], ['', 'n2']] }, ['name', 'memo'])).toBe('n1\tm1\nn2\t');
        expect(pasteToTsv({ keys: ['name', null], rows: [['n', 'x']] }, ['name', 'memo'])).toBe('n\t');
    });
});

describe('deleteWithUndo — 컬렉션 행·속성 삭제도 알림 + 되돌리기(R3-S)', () => {
    it('행 둘을 지우면 알림이 뜨고, 알림의 되돌리기 명령 인자로 한 번에 되살아난다', () => {
        const { api, kit, listType } = presetKit();
        const lid = api.create(api.roots.main, { type: listType, name: '우리 반' });
        const a = kit.addItem(lid, { name: '김하나' });
        const b = kit.addItem(lid, { name: '이둘' });
        const notify = vi.fn();
        deleteWithUndo(kit, { notify } as unknown as PluginHost, '행 2개를 휴지통으로 옮겼습니다', () => { kit.removeItem(a); kit.removeItem(b); });
        expect(kit.itemsIn(lid)).toHaveLength(0);
        const n = notify.mock.calls.at(-1)![0];
        expect(n.title).toBe('행 2개를 휴지통으로 옮겼습니다');
        expect(n.action.label).toBe('되돌리기');
        expect(n.action.commandId).toBe(api.cmd.undo);
        expect(n.action.args.undoTop).toBe(api.undoToken());
        expect(typeof n.action.args.undoTop).toBe('number');
        expect(undoAllowed(n.action.args)).toBe(true);
        undoAction();   // 알림의 되돌리기 단추가 부르는 그 함수
        expect(kit.itemsIn(lid).map((i) => i.name).sort()).toEqual(['이둘', '김하나'].sort());
    });
    it('host 가 없어도 지우기는 일어난다(알림만 생략)', () => {
        const { api, kit, listType } = presetKit();
        const lid = api.create(api.roots.main, { type: listType, name: '우리 반' });
        const a = kit.addItem(lid, { name: '김하나' });
        deleteWithUndo(kit, undefined, 't', () => kit.removeItem(a));
        expect(kit.itemsIn(lid)).toHaveLength(0);
    });
});
