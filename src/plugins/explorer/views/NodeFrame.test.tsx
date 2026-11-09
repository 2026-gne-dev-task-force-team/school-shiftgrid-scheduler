// @vitest-environment jsdom
/**
 * nodes.Frame — 모든 노드 화면의 겉틀(Q5): 상단 줄(‹ 위로 · 경로 · ⋯ 메뉴) + 큰 머리 + 본문 · 탭 제목 동기화(R2) · 피크 머리줄 자리 공유.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PluginHost } from '../../../pane-ui-system/plugin';
import { setWorkspaceBridge } from '../../../pane-ui-system/plugin';
import { PeekBarProvider, usePeekBarState } from '../../../pane-ui-system/shell/shared/peek-bar';
import { initStore, getState, apiCreate, apiRename } from '../store';
import { registerType, clearTypes } from '../model/types';
import { clearDerived } from '../model/derive';
import { NodeFrame } from './NodeFrame';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const host = {
    notify: () => {},
    storage: { get: <T,>(_k: string, f: T) => f, set: () => {} },
    store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => false, estimate: async () => null },
} as unknown as PluginHost;

let root: Root; let container: HTMLDivElement;
const titles: [string, string][] = [];
let parentId = ''; let childId = '';

beforeEach(async () => {
    clearTypes(); clearDerived(); titles.length = 0;
    setWorkspaceBridge({ open: () => null, close: () => {}, setTitle: (l, t) => { titles.push([l, t]); } });
    await initStore(host);
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
    parentId = apiCreate(getState().tree.root, { type: 'folder', name: '윗 폴더' });
    childId = apiCreate(parentId, { type: 'folder', name: '아래 폴더' });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); document.body.innerHTML = ''; setWorkspaceBridge(null); });

const render = (node: ReactNode) => act(() => { root.render(node); });
const click = (el: Element | null | undefined) => act(() => { (el as HTMLElement).click(); });
const menuItem = (label: string) => [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);

describe('nodes.Frame', () => {
    it('상단 줄에 조상 경로와 ‹ 단추, 그 밑에 큰 머리·본문이 선다', () => {
        let back = 0;
        render(<NodeFrame nodeId={childId} onBack={() => { back += 1; }} backLabel="목록"><p>본문</p></NodeFrame>);
        const nav = container.querySelector('nav[aria-label="경로"]')!;
        expect(nav.textContent).toBe('윗 폴더');                                   // 자신은 큰 머리에 — 경로엔 조상만
        click([...container.querySelectorAll('button')].find((b) => b.textContent?.includes('목록')));
        expect(back).toBe(1);
        expect((container.querySelector('input[aria-label="제목"]') as HTMLInputElement).value).toBe('아래 폴더');
        expect(container.textContent).toContain('본문');
    });

    it('🔑 R2: 이름이 바뀌면 그 탭(leaf) 제목이 따라간다', () => {
        render(<NodeFrame nodeId={childId} leafId="leaf9"><p>x</p></NodeFrame>);
        expect(titles.at(-1)).toEqual(['leaf9', '아래 폴더']);
        act(() => { apiRename(childId, '바뀐 이름'); });
        expect(titles.at(-1)).toEqual(['leaf9', '바뀐 이름']);
    });

    it('children 이 함수면 틀이 큰 머리를 따로 안 그리고 넘겨 준다(본문 안에 놓는 편집기용)', () => {
        render(<NodeFrame nodeId={childId}>{(header) => <section data-body>{header}</section>}</NodeFrame>);
        expect(container.querySelectorAll('input[aria-label="제목"]').length).toBe(1);
        expect(container.querySelector('[data-body] input[aria-label="제목"]')).not.toBeNull();
    });

    it('⋯ 메뉴: 본문이 보탠 항목 · 이름 바꾸기(제목 칸으로 포커스) · 휴지통으로(노드가 휴지통으로 간다)', () => {
        let ran = 0;
        render(<NodeFrame nodeId={childId} menu={[{ label: '내 동작', onClick: () => { ran += 1; } }]}><p>x</p></NodeFrame>);
        click(container.querySelector('button[aria-label="더보기"]'));
        expect(menuItem('내 동작')).toBeTruthy();
        click(menuItem('내 동작')); expect(ran).toBe(1);

        click(container.querySelector('button[aria-label="더보기"]'));
        click(menuItem('이름 바꾸기'));
        expect(document.activeElement).toBe(container.querySelector('input[aria-label="제목"]'));

        click(container.querySelector('button[aria-label="더보기"]'));
        click(menuItem('휴지통으로'));
        expect(getState().tree.nodes[getState().tree.trash].children).toContain(childId);
    });

    it('🔑 R1: 피크 안이면 상단 줄을 피크 머리줄 자리에 그린다(줄이 둘이 안 된다)', () => {
        let slotEl: HTMLElement | null = null;
        function Peek() {
            const bar = usePeekBarState();
            return (
                <div>
                    <div data-slot ref={(e) => { bar.setSlot(e); slotEl = e; }} />
                    <PeekBarProvider slot={bar.slot} claim={bar.claim}>
                        <NodeFrame nodeId={childId} onBack={() => {}}><p>피크 본문</p></NodeFrame>
                    </PeekBarProvider>
                    <i data-claimed={String(bar.claimed)} />
                </div>
            );
        }
        render(<Peek />);
        expect(slotEl!.querySelector('button[aria-label="더보기"]')).not.toBeNull();       // ⋯ 가 피크 머리줄 자리에
        expect(container.querySelectorAll('button[aria-label="더보기"]').length).toBe(1);   // 틀 안에 또 있지 않다
        expect(container.querySelector('[data-claimed]')!.getAttribute('data-claimed')).toBe('true');   // 피크는 「미리보기」 글자를 감춘다
    });
});
