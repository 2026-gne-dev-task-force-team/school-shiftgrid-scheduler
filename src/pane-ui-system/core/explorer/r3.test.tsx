// @vitest-environment jsdom
/**
 * R3 「탐색기·노드 틀」 — 머리 한 꼴(data-nf-header) · 활성 탭 따라가기 · nodeMenu 항목·순서 · 시작 화면 조사·탭 이름.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PluginHost } from '../../plugin';
import { setWorkspaceBridge } from '../../plugin';
import { StartScreen } from '../..';
import { useLauncherTab, LAUNCHER_GLYPH } from '../../plugin';
import { initStore, getState, apiCreate } from '../node-store/store';
import { registerType, clearTypes } from '../nodes/model/types';
import { clearDerived } from '../nodes/model/derive';
import { NodeFrame } from '../node-frame/views/NodeFrame';
import { nodeMenu } from '../node-frame/views/node-menu';
import { bindLeafNode, followActivatedLeaf } from '../node-frame/leaf-follow';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const host = {
    notify: () => {},
    storage: { get: <T,>(_k: string, f: T) => f, set: () => {} },
    store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => false, estimate: async () => null },
} as unknown as PluginHost;

let root: Root; let container: HTMLDivElement;
let aId = ''; let bId = ''; let cId = '';
const titles: [string, string][] = []; const glyphs: [string, string | undefined][] = [];

beforeEach(async () => {
    clearTypes(); clearDerived(); titles.length = 0; glyphs.length = 0;
    setWorkspaceBridge({ open: () => null, close: () => {}, setTitle: (l: string, t: string) => { titles.push([l, t]); }, setGlyph: (l: string, g: string | undefined) => { glyphs.push([l, g]); } } as never);
    await initStore(host);
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
    registerType({ type: 'doc', label: '문서', icon: 'fileText' });
    registerType({ type: 'grid', label: '표', icon: 'table' });
    aId = apiCreate(getState().tree.root, { type: 'doc', name: '문서 하나' });
    bId = apiCreate(getState().tree.root, { type: 'grid', name: '표 하나' });
    cId = apiCreate(getState().tree.root, { type: 'doc', name: '문서 둘' });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); document.body.innerHTML = ''; setWorkspaceBridge(null); });

const render = (node: ReactNode) => act(() => { root.render(node); });

describe('R3 머리 한 꼴', () => {
    it('타입이 달라도 머리는 같은 data-nf-header 꼴(아이콘 칸 + 제목 입력 하나)', () => {
        const shape = (id: string) => {
            render(<NodeFrame nodeId={id}><p>x</p></NodeFrame>);
            const hd = container.querySelectorAll('[data-nf-header]');
            expect(hd.length).toBe(1);
            return { cls: hd[0].className, inputs: hd[0].querySelectorAll('textarea[aria-label="제목"]').length, tag: hd[0].tagName };
        };
        const a = shape(aId); const b = shape(bId);
        expect(a).toEqual(b);
        expect(a.inputs).toBe(1);
    });
    it('상단 줄(data-nf-bar)도 종류와 무관하게 한 개·같은 꼴(전체 달력의 줄과 같은 클래스)', () => {
        const bar = (id: string) => {
            render(<NodeFrame nodeId={id}><p>x</p></NodeFrame>);
            const b = container.querySelectorAll('[data-nf-bar]');
            expect(b.length).toBe(1);
            return b[0].className;
        };
        const a = bar(aId);
        expect(bar(bId)).toBe(a);
        expect(a).toBe('shrink-0 flex items-center gap-1 h-header px-pad border-b border-line select-none');
    });
});

describe('R3 활성 탭 따라가기', () => {
    it('노드 탭으로 바꾸면 그 노드를 고르고, 노드 아닌 화면이면 풀린다', () => {
        bindLeafNode('L1', aId); bindLeafNode('L2', cId);
        followActivatedLeaf({ id: 'L2', area: 'center' });
        expect(getState().selectedId).toBe(cId);
        followActivatedLeaf({ id: 'L1', area: 'center' });
        expect(getState().selectedId).toBe(aId);
        followActivatedLeaf({ id: 'LX-start', area: 'center' });
        expect(getState().selectedId).toBeNull();
    });
    it('사이드 패널 포커스는 건드리지 않는다', () => {
        bindLeafNode('L1', aId);
        followActivatedLeaf({ id: 'side', area: 'left' });
        expect(getState().selectedId).toBe(aId);
    });
    it('틀이 사라질 때 남이 고른 것은 안 지운다', () => {
        const off = bindLeafNode('L1', aId);
        act(() => { /* 다른 노드를 고른다 */ });
        bindLeafNode('L2', cId);
        off();
        expect(getState().selectedId).toBe(cId);
    });
});

describe('R3 nodeMenu', () => {
    const labels = (m: ReturnType<typeof nodeMenu>) => m.filter((e) => !('sep' in e)).map((e) => (e as { label: string }).label);
    it('항목과 순서 — 열기 · 이름 바꾸기 · 탐색기에서 보기 · 위로 · 아래로 · 삭제(위험)', () => {
        const m = nodeMenu(bId, {
            open: true, move: true, reveal: () => {}, rename: { run: () => {} }, remove: { run: () => {} },
        });
        expect(labels(m)).toEqual(['열기', '탐색기에서 보기', '이름 바꾸기', '위로', '아래로', '삭제']);
        const del = m.at(-1) as { danger?: boolean };
        expect(del.danger).toBe(true);
        expect((m.at(-2) as { sep?: boolean }).sep).toBe(true);
    });
    it('열기 없으면 빠지고, 첫째 형제는 위로가 회색', () => {
        const m = nodeMenu(aId, { move: true, rename: { run: () => {} }, remove: { run: () => {} } });
        expect(labels(m)[0]).toBe('이름 바꾸기');
        const up = m.find((e) => (e as { label?: string }).label === '위로') as { disabled?: boolean };
        expect(up.disabled).toBe(true);
    });
});

describe('R3 시작 화면', () => {
    const base = { icon: 'database' as const, title: '컬렉션', newLabel: '새 컬렉션', onNew: () => {}, onOpen: () => {}, items: [] };
    it('받침에 맞는 조사 — 컬렉션을·컬렉션이 없다 / 페이지를·페이지가 없다', () => {
        render(<StartScreen {...base} noun="컬렉션" />);
        expect(container.textContent).toContain('만들어 둔 컬렉션을 고른다');
        expect(container.textContent).toContain('만들어 둔 컬렉션이 없다');
        expect(container.textContent).not.toMatch(/컬렉션(를|가)/);
        render(<StartScreen {...base} noun="페이지" title="페이지" />);
        expect(container.textContent).toContain('만들어 둔 페이지를 고른다');
        expect(container.textContent).toContain('만들어 둔 페이지가 없다');
    });
    it('목록 행 아이콘은 이모지 우선, 아니면 그 타입 아이콘', () => {
        render(<StartScreen {...base} noun="표" items={[{ id: '1', name: '가', emoji: '🍎' }, { id: '2', name: '나' }]} />);
        expect(container.textContent).toContain('🍎');
        expect(container.querySelectorAll('li svg').length).toBe(1);
    });
    it('useLauncherTab — 탭 이름은 「새 …」, 아이콘은 ＋', () => {
        function V() { useLauncherTab('Lz', '새 페이지'); return null; }
        render(<V />);
        expect(titles.at(-1)).toEqual(['Lz', '새 페이지']);
        expect(glyphs.at(-1)).toEqual(['Lz', LAUNCHER_GLYPH]);
    });
});
