// @vitest-environment jsdom
/**
 * 탐색기 줄 목록 메모화 — 2,000 노드(폴더 20×98)에서 렌더 시간 재기 + 무효화(펼침·이름·새 노드·검색어)가 화면에 닿는지.
 * 🔴 시간은 환경마다 다르다 — 단정하지 않고 console 에 찍는다(전후 비교용). 정확성만 expect 로 건다.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PluginHost } from '../../plugin';
import { initStore, getState, toggle, select, apiCreate, apiRename, apiBatch } from '../node-store/store';
import { registerType, clearTypes } from '../nodes/model/types';
import { clearDerived } from '../nodes/model/derive';
import { ExplorerView } from './views/ExplorerView';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const host = {
    notify: () => {},
    storage: { get: <T,>(_k: string, f: T) => f, set: () => {} },
    store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => false, estimate: async () => null },
    screen: { narrow: () => false, on: () => ({ dispose: () => {} }) },
    commands: { run: () => {} },
} as unknown as PluginHost;

let root: Root; let container: HTMLDivElement;
let folders: string[] = [];

beforeEach(async () => {
    clearTypes(); clearDerived();
    await initStore(host);
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true, create: { label: '폴더' } });
    registerType({ type: 'page.page', label: '노트', icon: 'fileText', create: { label: '노트' }, openable: true, open: () => {} });
    folders = [];
    apiBatch(() => {
        for (let f = 0; f < 20; f++) {
            const fid = apiCreate(getState().tree.root, { type: 'folder', name: `폴더${f}` });
            folders.push(fid);
            for (let i = 0; i < 98; i++) apiCreate(fid, { type: 'page.page', name: `노트${f}-${i}` });
        }
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); document.body.innerHTML = ''; });

const rowIds = () => [...container.querySelectorAll('[data-row-id]')].map((e) => e.getAttribute('data-row-id'));
const time = (label: string, fn: () => void): number => {
    const t0 = performance.now(); act(fn); const ms = performance.now() - t0;
    console.log(`[perf] ${label}: ${ms.toFixed(1)}ms`);
    return ms;
};

describe('탐색기 줄 목록 메모화', () => {
    it('2,000 노드 — 펴기·고르기 렌더 시간(찍기) + 줄 수가 맞다', () => {
        expect(Object.keys(getState().tree.nodes).length).toBeGreaterThan(1900);
        act(() => { root.render(<ExplorerView host={host} />); });
        // 처음엔 전부 펼침 — 20 + 1960 줄
        expect(rowIds().length).toBe(20 + 20 * 98);
        time('폴더 접기', () => toggle(folders[0]));
        expect(rowIds().length).toBe(20 + 20 * 98 - 98);
        time('폴더 펴기', () => toggle(folders[0]));
        expect(rowIds().length).toBe(20 + 20 * 98);
        time('고르기(나무 그대로)', () => select(folders[1]));
        time('고르기2(나무 그대로)', () => select(folders[2]));
    }, 30000);

    it('무효화 — 이름 바꾸기·새 노드·펼침·검색어가 화면에 닿는다', () => {
        act(() => { root.render(<ExplorerView host={host} />); });
        const first = getState().tree.nodes[folders[3]].children[0];
        act(() => apiRename(first, '바뀐이름'));
        expect(container.textContent).toContain('바뀐이름');
        const made = ((): string => { let id = ''; act(() => { id = apiCreate(folders[3], { type: 'page.page', name: '새로생김' }); }); return id; })();
        expect(container.querySelector(`[data-row-id="${made}"]`)).not.toBeNull();
        act(() => toggle(folders[3]));
        expect(container.querySelector(`[data-row-id="${made}"]`)).toBeNull();
        act(() => toggle(folders[3]));
        expect(container.querySelector(`[data-row-id="${made}"]`)).not.toBeNull();
        // 검색어
        const input = container.querySelector('input') as HTMLInputElement;
        const setVal = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        act(() => { setVal.call(input, '새로생김'); input.dispatchEvent(new Event('input', { bubbles: true })); });
        expect(rowIds()).toEqual([folders[3], made]);
        act(() => { setVal.call(input, ''); input.dispatchEvent(new Event('input', { bubbles: true })); });
        expect(rowIds().length).toBe(20 + 20 * 98 + 1);
    }, 30000);
});
