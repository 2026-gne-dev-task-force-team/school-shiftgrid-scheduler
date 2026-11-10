/**
 * 보결 명단 증명 — 타입 둘(목록 보임·교직원 record) · 새 명단에 「구분」 칸이 심기고(시작 화면·탐색기 두 길) · 선택지를 고칠 수 있다.
 *   다리 본체는 컬렉션 바닥이라 collection/define.test 가 잰다. ⛔ 실명 금지(공개 레포).
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

import { initStore } from '../../pane-ui-system/core/node-store/store';
import { __resetPersistForTest } from '../../pane-ui-system/core/node-store/persist';
import { makeNodesApi } from '../../pane-ui-system/core/node-frame/api';
import { registerType, clearTypes, isRecordType } from '../../pane-ui-system/core/nodes/model/types';
import { clearDerived } from '../../pane-ui-system/core/nodes/model/derive';
import { defineCollection } from '../collection/define';
import { substituteNodeTypes, substituteNodeTypeImpl, LIST_TYPE, STAFF_TYPE, getKit, setKit } from './nodes';
import { STAFF_CONFIG } from './config';
import { pasteIntoList } from '../collection/views/CollectionTab';

function host(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
    } as unknown as PluginHost;
}

/** 폴더 + substitute 타입 둘을 꽂은 NodesApi 하나 + 컬렉션 kit 연결(활성이 하는 일을 직접). */
function wire() {
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
    const api = makeNodesApi('substitute');
    for (const nt of substituteNodeTypes) api.registerContributed(nt, { nodeTypes: substituteNodeTypeImpl }, host());
    setKit(defineCollection(STAFF_CONFIG));
    getKit()!.init(api);
    return api;
}

beforeEach(async () => {
    kv.store.clear(); kv.nodesWrite.mockClear();
    clearTypes(); clearDerived(); __resetPersistForTest();
    await initStore(host());
});
afterEach(() => { getKit()?.init(null); setKit(null); __resetPersistForTest(); });

const kindOf = (api: ReturnType<typeof wire>, id: string) =>
    ((api.get(id)?.data as { fields?: { key: string; type: string; options?: { value: string; label: string }[] }[] })?.fields ?? []).find((f) => f.key === 'f_kind');

describe('보결 명단 — 구분 칸', () => {
    it('타입 접두사 substitute. · 교직원은 record', () => {
        const api = wire();
        const lid = getKit()!.createList()!;
        const sid = api.create(lid, { type: STAFF_TYPE, name: '가나다' });
        expect(LIST_TYPE.startsWith('substitute.')).toBe(true);
        expect(isRecordType(STAFF_TYPE)).toBe(true);
        expect(api.children(lid).map((n) => n.id)).toContain(sid);
    });

    it('시작 화면 길(createList) — 구분 선택 칸이 기본 선택지 넷으로 심긴다', () => {
        const api = wire();
        const f = kindOf(api, getKit()!.createList()!);
        expect(f?.type).toBe('select');
        expect(f?.options?.map((o) => o.label)).toEqual(['담임', '전담', '비교과', '보조인력']);
    });

    it('탐색기 길(createInit) — 같은 칸을 내고, 부를 때마다 새 객체다', () => {
        const a = substituteNodeTypeImpl.list.createInit();
        const b = substituteNodeTypeImpl.list.createInit();
        expect(a.data.fields[0].key).toBe('f_kind');
        expect(a.data.fields[0]).not.toBe(b.data.fields[0]);
    });

    it('선택지는 고칠 수 있다 — 사용자 칸이라 setUserFields 가 저장하고, 다른 명단은 그대로', () => {
        const api = wire();
        const kit = getKit()!;
        const l1 = kit.createList()!;
        const l2 = kit.createList()!;
        const f = kindOf(api, l1)!;
        kit.setUserFields(l1, [{ ...f, options: [...f.options!, { value: 'admin', label: '교감' }] } as never]);
        expect(kindOf(api, l1)?.options?.map((o) => o.label)).toContain('교감');
        expect(kindOf(api, l2)?.options).toHaveLength(4);
    });

    it('칸은 잠겨 있다(지우기·타입 바꾸기 금지) · 붙여 넣은 「담임」은 저장값 homeroom 으로 — 새 선택지가 안 생긴다', () => {
        const api = wire();
        const kit = getKit()!;
        const lid = kit.createList()!;
        expect((kindOf(api, lid) as { locked?: boolean })?.locked).toBe(true);
        const fields = [...STAFF_CONFIG.baseFields, ...kit.userFieldsOf(lid)];
        pasteIntoList(kit as never, lid, fields, ['name', 'memo'], { keys: ['name', 'f_kind'], rows: [['가나다', '담임'], ['라마바', '보조인력']] });
        const vals = api.children(lid).filter((n) => n.type === STAFF_TYPE).map((n) => (n.data as { values?: Record<string, unknown> }).values?.f_kind);
        expect(vals).toEqual(['homeroom', 'assistant']);
        expect(kindOf(api, lid)?.options).toHaveLength(4);
    });
});
