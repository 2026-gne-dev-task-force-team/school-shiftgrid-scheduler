// @vitest-environment jsdom
/**
 * 명단 인스펙터(PersonProps) — 사용자 칸이 보이고, 고르기 칸도 인스펙터에서 고쳐져 표(colsOf)에 반영된다.
 *   노드 저장은 people-nodes.test 와 같은 메모리 kv 모킹. 지어낸 이름만.
 */
import { act } from 'react';
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

import { initStore } from '../../explorer/store';
import { __resetPersistForTest } from '../../explorer/persist';
import { makeNodesApi } from '../../explorer/api';
import { registerType, clearTypes } from '../../explorer/model/types';
import { clearDerived } from '../../explorer/model/derive';
import { peopleNodeTypes, peopleNodeTypeImpl, LIST_TYPE, PERSON_TYPE, initPeopleNodes, setListFields, colsOf, personOf } from '../nodes';
import { recordViewApi } from '../../collection/api';
import { PersonProps } from './PersonProps';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const host = {
    storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
    store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
    modules: { use: (name: string) => (name === 'collection' ? recordViewApi : null) },
} as unknown as PluginHost;

let root: Root | null = null;
let hostEl: HTMLDivElement | null = null;
beforeEach(async () => {
    kv.store.clear();
    clearTypes(); clearDerived(); __resetPersistForTest();
    await initStore(host);
});
afterEach(() => {
    act(() => { root?.unmount(); }); hostEl?.remove(); root = null; hostEl = null; document.body.innerHTML = '';
    initPeopleNodes(null); __resetPersistForTest();
});

const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const click = (el: Element | null) => act(() => { (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });

describe('PersonProps — 명단의 사용자 칸이 인스펙터에 보이고 고쳐진다', () => {
    it('고르기 칸: 라벨이 보이고 · 고르면 colsOf 에 들어간다 · 기본 칸 둘은 locked', () => {
        registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
        const api = makeNodesApi('people');
        for (const nt of peopleNodeTypes) api.registerContributed(nt, { nodeTypes: peopleNodeTypeImpl }, host);
        initPeopleNodes(api);
        const lid = api.create(api.roots.main, { type: LIST_TYPE, name: '우리 반' });
        const pid = api.create(lid, { type: PERSON_TYPE, name: '김하나', data: {} });
        setListFields(lid, [{ key: 'f_team', label: '모둠', type: 'select', options: [{ value: 'a', label: '가' }, { value: 'b', label: '나' }] }]);

        hostEl = document.createElement('div');
        document.body.appendChild(hostEl);
        root = createRoot(hostEl);
        act(() => { root!.render(<PersonProps host={host} target={{ type: PERSON_TYPE, id: pid }} />); });

        expect(q('[data-rv-prop="f_team"]')?.textContent).toContain('모둠');
        expect(q('[data-rv-prop="name"]')).toBeTruthy();
        click(q('[data-rv-prop="f_team"] [data-rv-cell="f_team"]'));
        click(q('[data-rv-opt="b"]'));
        expect(colsOf(pid)).toEqual({ f_team: 'b' });
        expect(personOf(pid)?.name).toBe('김하나');
    });
});
