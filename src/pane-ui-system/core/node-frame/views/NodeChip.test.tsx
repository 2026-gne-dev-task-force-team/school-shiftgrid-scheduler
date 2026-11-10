// @vitest-environment jsdom
/**
 * nodes.Chip — 이름은 id 로 따라가고, 휴지통·없는 노드는 「없는 항목」, 타입이 chip 을 등록하면 그 모습.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PluginHost } from '../../../plugin';
import { initStore, getState, newFolder, apiRename, trashNode } from '../../node-store/store';
import { registerType, clearTypes } from '../../nodes/model/types';
import { clearDerived } from '../../nodes/model/derive';
import { NodeChip } from './NodeChip';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const host = {
    notify: () => "",
    storage: { get: <T,>(_k: string, f: T) => f, set: () => {} },
    store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => false, estimate: async () => null },
} as unknown as PluginHost;

let root: Root; let container: HTMLDivElement;

beforeEach(async () => {
    clearTypes(); clearDerived();
    await initStore(host);
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
    newFolder();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe('nodes.Chip', () => {
    it('이름 변경을 따라가고 휴지통에 가면 「없는 항목」', () => {
        const id = getState().selectedId!;
        act(() => { root.render(<NodeChip nodeId={id} />); });
        act(() => { apiRename(id, '홍반'); });
        expect(container.querySelector(`[data-node-chip="${id}"]`)?.textContent).toBe('홍반');
        act(() => { trashNode(id); });
        const chip = container.querySelector(`[data-node-chip="${id}"]`)!;
        expect(chip.hasAttribute('data-missing')).toBe(true);
        expect(chip.textContent).toBe('없는 항목');
    });

    it('없는 id 도 「없는 항목」', () => {
        act(() => { root.render(<NodeChip nodeId="nope" />); });
        expect(container.textContent).toBe('없는 항목');
    });

    it('타입이 chip 을 등록했으면 그 모습', () => {
        clearTypes();
        registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true, chip: ({ nodeId }) => <b data-custom>{nodeId}</b> });
        const id = getState().selectedId!;
        act(() => { root.render(<NodeChip nodeId={id} />); });
        expect(container.querySelector('[data-custom]')?.textContent).toBe(id);
    });
});
