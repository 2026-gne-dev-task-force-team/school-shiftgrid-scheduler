// @vitest-environment jsdom
/**
 * 새로 만들기 메뉴 무리 나눔 + 노드 메뉴의 「열기」 중복 제거(QA Q6, 2026-11-10).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PluginHost } from '../../plugin';
import { initStore, apiCreate, getState } from '../node-store/store';
import { registerType, clearTypes } from '../nodes/model/types';
import { clearDerived } from '../nodes/model/derive';
import { ExplorerView } from './views/ExplorerView';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mkHost = (narrow: boolean) => ({
    notify: () => {},
    storage: { get: <T,>(_k: string, f: T) => f, set: () => {} },
    store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => false, estimate: async () => null },
    screen: { narrow: () => narrow, on: () => ({ dispose: () => {} }) },
    commands: { run: () => {} },
} as unknown as PluginHost);

let root: Root; let container: HTMLDivElement;
beforeEach(async () => {
    clearTypes(); clearDerived();
    await initStore(mkHost(false));
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true, create: { label: '폴더' } });
    // 일부러 무리가 섞인 등록 순서
    registerType({ type: 'account.root', label: '계정', icon: 'user', create: { label: '계정' } });
    registerType({ type: 'rooms.list', label: '방 목록', icon: 'door', create: { label: '방 목록' } });
    registerType({ type: 'people.list', label: '사람 명단', icon: 'users', create: { label: '사람 명단' }, openable: true, open: () => {},
        menu: (id) => [{ label: '사람 명단 열기', commandId: 'x.open', commandArg: { nodeId: id } }, { label: '표 복사', commandId: 'x.copy', commandArg: { nodeId: id } }] });
    registerType({ type: 'page.page', label: '노트', icon: 'fileText', create: { label: '노트' } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); document.body.innerHTML = ''; });

const menuItems = () => [...document.querySelectorAll('[role="menu"] [role="menuitem"], [role="menu"] [role="separator"]')]
    .map((e) => (e.getAttribute('role') === 'separator' ? '---' : e.textContent));

describe('탐색기 메뉴', () => {
    it('+ 메뉴 — 무리 사이에 구분선이 들고 항목 수는 그대로', () => {
        act(() => { root.render(<ExplorerView host={mkHost(false)} />); });
        act(() => { (container.querySelector('[aria-label="새로 만들기"]') as HTMLElement).click(); });
        const items = menuItems();
        expect(items.filter((x) => x !== '---').length).toBe(5);
        expect(items).toEqual(['새 폴더', '새 노트', '---', '새 사람 명단', '---', '새 방 목록', '---', '새 계정']);
    });
    it('노드 메뉴 — 「열기」 하나만, 「○○ 열기」는 빠지고 다른 타입 줄은 남는다', async () => {
        await initStore(mkHost(true));
        registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true, create: { label: '폴더' } });
        registerType({ type: 'people.list', label: '사람 명단', icon: 'users', openable: true, open: () => {},
            menu: (id) => [{ label: '사람 명단 열기', commandId: 'x.open', commandArg: { nodeId: id } }, { label: '표 복사', commandId: 'x.copy', commandArg: { nodeId: id } }] });
        const id = apiCreate('root', { type: 'people.list', name: '명단' });
        act(() => { root.render(<ExplorerView host={mkHost(true)} />); });
        const row = container.querySelector(`[data-row-id="${id}"]`) as HTMLElement;
        act(() => { (row.querySelector('[aria-label="메뉴"]') as HTMLElement).click(); });
        const items = menuItems();
        expect(items.filter((x) => x === '열기').length).toBe(1);
        expect(items).not.toContain('사람 명단 열기');
        expect(items).toContain('표 복사');
    });
});

describe('K18 탐색기에서 아이콘 바꾸기', () => {
    it('줄 아이콘을 누르면 고르기가 뜨고, 이모지를 고르면 그 노드 icon 이 바뀐다', () => {
        const id = apiCreate('root', { type: 'page.page', name: '글' });
        act(() => { root.render(<ExplorerView host={mkHost(false)} />); });
        const row = container.querySelector(`[data-row-id="${id}"]`) as HTMLElement;
        act(() => { (row.querySelector('[aria-label="아이콘 바꾸기"]') as HTMLElement).click(); });
        const emoji = document.querySelector('[role="option"][aria-label="그리스"]') as HTMLElement;
        expect(emoji).toBeTruthy();
        act(() => { emoji.click(); });
        expect(getState().tree.nodes[id].icon).toBeTruthy();
        expect(document.querySelector('[role="option"][aria-label="그리스"]')).toBeNull();
    });
    it('우클릭 메뉴에 「아이콘 바꾸기」가 있다', () => {
        const id = apiCreate('root', { type: 'page.page', name: '글' });
        act(() => { root.render(<ExplorerView host={mkHost(false)} />); });
        const row = container.querySelector(`[data-row-id="${id}"]`) as HTMLElement;
        act(() => { row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); });
        expect(menuItems()).toContain('아이콘 바꾸기');
    });
});
