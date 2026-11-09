// @vitest-environment jsdom
/**
 * nodes.Header — 노드 공통 머리: 아이콘 고르기 → node.icon · 제목 고치기 → node.name · 이름이 바뀌면 탭 제목(setTitle)도.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PluginHost } from '../../../pane-ui-system/plugin';
import { setWorkspaceBridge } from '../../../pane-ui-system/plugin';
import { initStore, getState, newFolder, apiRename } from '../store';
import { registerType, clearTypes } from '../model/types';
import { clearDerived } from '../model/derive';
import { NodeHeader } from './NodeHeader';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const host = {
    storage: { get: <T,>(_k: string, f: T) => f, set: () => {} },
    store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => false, estimate: async () => null },
} as unknown as PluginHost;

let root: Root; let container: HTMLDivElement;
const titles: [string, string][] = [];
const glyphs: [string, string | undefined][] = [];

beforeEach(async () => {
    clearTypes(); clearDerived(); titles.length = 0; glyphs.length = 0;
    setWorkspaceBridge({ open: () => null, close: () => {}, setTitle: (l, t) => { titles.push([l, t]); }, setGlyph: (l, g) => { glyphs.push([l, g]); } });
    await initStore(host);
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
    newFolder();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); setWorkspaceBridge(null); });

describe('nodes.Header', () => {
    it('이름이 바뀌면 탭 제목도 따라가고, 제목 입력을 고치면 노드 이름이 바뀐다', () => {
        const id = getState().selectedId!;
        act(() => { root.render(<NodeHeader nodeId={id} leafId="leaf1" />); });
        expect(titles.at(-1)).toEqual(['leaf1', getState().tree.nodes[id].name]);

        act(() => { apiRename(id, '새 이름'); });
        expect(titles.at(-1)).toEqual(['leaf1', '새 이름']);          // 🔴 뷰는 탭 제목을 모른다 — 머리가 창틀에 시킨다

        const input = container.querySelector('input[aria-label="제목"]') as HTMLInputElement;
        const setVal = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        act(() => { setVal.call(input, '입력으로'); input.dispatchEvent(new Event('input', { bubbles: true })); });
        act(() => { input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); input.blur(); });
        expect(getState().tree.nodes[id].name).toBe('입력으로');
    });

    it('아이콘을 고르면 node.icon 에 저장된다', () => {
        const id = getState().selectedId!;
        act(() => { root.render(<NodeHeader nodeId={id} />); });
        act(() => { (container.querySelector('button[aria-label="아이콘 고르기"]') as HTMLElement).click(); });
        const pick = [...document.body.querySelectorAll('button')].find((b) => b.textContent === '📌')!;
        act(() => { pick.click(); });
        expect(getState().tree.nodes[id].icon).toBe('📌');
    });

    it('V2: 아이콘을 고르면 그 탭 아이콘(setGlyph)도 바뀐다', () => {
        const id = getState().selectedId!;
        act(() => { root.render(<NodeHeader nodeId={id} leafId="leaf1" />); });
        act(() => { (container.querySelector('button[aria-label="아이콘 고르기"]') as HTMLElement).click(); });
        act(() => { [...document.body.querySelectorAll('button')].find((b) => b.textContent === '📌')!.click(); });
        expect(glyphs.at(-1)).toEqual(['leaf1', '📌']);
    });

    it('제목에서 Enter 면 이름을 확정하고 onTitleEnter 를 부른다(IME 조합 중엔 안 부른다)', () => {
        const id = getState().selectedId!;
        let n = 0;
        act(() => { root.render(<NodeHeader nodeId={id} onTitleEnter={() => { n += 1; }} />); });
        const input = container.querySelector('input[aria-label="제목"]') as HTMLInputElement;
        input.focus();
        act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })); });
        expect(n).toBe(0);
        act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
        expect(n).toBe(1);
    });
});
