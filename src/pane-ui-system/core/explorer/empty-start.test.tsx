// @vitest-environment jsdom
/**
 * 빈 탐색기 「처음이라면」 — 새로 만들기 표에서 바로 만들기 단추가 서고, 누르면 노드가 생긴다. 「새 폴더」는 맨 끝 보조 링크.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PluginHost } from '../../plugin';
import { initStore, getState } from '../node-store/store';
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

const opened: string[] = [];
let root: Root; let container: HTMLDivElement;

beforeEach(async () => {
    clearTypes(); clearDerived();
    await initStore(host);
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true, create: { label: '폴더' } });
    registerType({ type: 'account.x', label: '계정', icon: 'user', create: { label: '계정' } });
    registerType({ type: 'timetable-grid.sheet', label: '시간표', icon: 'table', create: { label: '시간표' }, openable: true, open: (id) => { opened.push(id); } });
    registerType({ type: 'people.list', label: '사람 명단', icon: 'users', create: { label: '사람 명단' }, openable: true, open: (id) => { opened.push(id); } });
    registerType({ type: 'page.page', label: '노트', icon: 'fileText', create: { label: '노트' }, openable: true, open: (id) => { opened.push(id); } });
    registerType({ type: 'cal.sub', label: '구독 캘린더', icon: 'calendar', create: { label: '구독 캘린더' } });
    opened.length = 0;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); document.body.innerHTML = ''; });

const btns = () => [...container.querySelectorAll('[data-explorer-empty] button')] as HTMLButtonElement[];

describe('빈 탐색기 처음 안내', () => {
    it('앞 셋(없는 타입 건너뜀)+더 보기, 폴더 만들기는 맨 끝 · 누르면 만들고 바로 열린다(이름칸 없음)', () => {
        act(() => { root.render(<ExplorerView host={host} />); });
        const labels = btns().map((b) => b.textContent);
        expect(labels).toEqual(['새 시간표', '새 사람 명단', '새 노트', '더 보기', '폴더 만들기']);
        const before = Object.keys(getState().tree.nodes).length;
        act(() => { btns()[0].click(); });
        expect(Object.keys(getState().tree.nodes).length).toBeGreaterThan(before);
        expect(Object.values(getState().tree.nodes).some((n) => n.type === 'timetable-grid.sheet')).toBe(true);
        expect(opened.length).toBe(1);
        expect(getState().renamingId).toBeNull();
    });
    it('더 보기를 누르면 나머지가 펼쳐진다', () => {
        act(() => { root.render(<ExplorerView host={host} />); });
        act(() => { btns().find((b) => b.textContent === '더 보기')!.click(); });
        const labels = btns().map((b) => b.textContent);
        expect(labels).toContain('새 계정');
        expect(labels).toContain('새 구독 캘린더');
        expect(labels).not.toContain('더 보기');
    });
});
