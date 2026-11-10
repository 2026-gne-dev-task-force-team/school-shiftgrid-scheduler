/**
 * 선택 알림 증명 — ① 탐색기에서 하나 고르면 { 노드 타입, id } 가 알려지고, 여럿·없음이면 null
 *   ② 속성 패널(PropertiesView)이 그 알림을 들어 그 종류의 칸을 그린다.
 */
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PluginHost, PropertiesPaneProps } from '../../plugin';
import { definePlugin, activateAll, disposeOwner } from '../../plugin';

const kv = vi.hoisted(() => ({
    nodesGetAll: vi.fn(async (): Promise<unknown[] | null> => []),
    nodesWrite: vi.fn(async (): Promise<boolean> => true),
}));
vi.mock('../../kv', () => ({ nodesGetAll: kv.nodesGetAll, nodesWrite: kv.nodesWrite }));

import { initStore, select, clickSelect, getState } from '../node-store/store';
import { __resetPersistForTest } from '../node-store/persist';
import { makeNodesApi } from '../node-frame/api';
import { registerType, clearTypes } from '../nodes/model/types';
import { attachSelection } from '../explorer';
import { PropertiesView } from '../../../plugins/properties/views/PropertiesPanel';
import { selectionApi } from './index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function host(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
        commands: { run: () => {} },
    } as unknown as PluginHost;
}

let a = '', b = '';
beforeEach(async () => {
    clearTypes(); __resetPersistForTest();
    await initStore(host());
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true, create: { label: '폴더' } });
    registerType({ type: 'tfake.thing', label: '것', icon: 'file' });
    const api = makeNodesApi('tfake');
    a = api.create(api.roots.main, { type: 'tfake.thing', name: '가' });
    b = api.create(api.roots.main, { type: 'tfake.thing', name: '나' });
    select(null);
    attachSelection(selectionApi);
});
afterEach(() => { select(null); });

describe('탐색기 → 선택 알림', () => {
    it('하나 고르면 { 노드 타입, id }, 풀면 null', () => {
        select(a);
        expect(selectionApi.get()).toEqual({ type: 'tfake.thing', id: a });
        select(null);
        expect(selectionApi.get()).toBeNull();
    });
    it('여럿 고르면 null(속성은 하나일 때만)', () => {
        select(a);
        clickSelect(b, [a, b], { ctrl: true });
        expect(getState().selectedIds.length).toBe(2);
        expect(selectionApi.get()).toBeNull();
    });
});

describe('선택 알림 → 속성 패널', () => {
    const Pane = ({ target }: PropertiesPaneProps) => createElement('p', null, `칸:${target.id}`);
    const fake = definePlugin({
        manifest: {
            id: 'tfake', name: 'T Fake', version: '0.1.0', minHostVersion: '0.1.0',
            contributes: { properties: [{ target: 'tfake.thing', id: 'p', title: '것', pane: 'Pane' }] },
        },
        panes: { Pane },
    });
    afterEach(() => { disposeOwner('tfake'); });

    it('고르면 그 종류의 칸이 뜨고, 풀면 사라진다', () => {
        activateAll([fake]);
        const h = { modules: { use: () => selectionApi } } as unknown as PluginHost;
        const el = document.createElement('div');
        const root = createRoot(el);
        act(() => root.render(createElement(PropertiesView, { host: h })));
        expect(el.textContent).toContain('고른 것이 없습니다');
        act(() => select(a));
        expect(el.textContent).toContain(`칸:${a}`);
        act(() => select(null));
        expect(el.textContent).toContain('고른 것이 없습니다');
        act(() => root.unmount());
    });
});
