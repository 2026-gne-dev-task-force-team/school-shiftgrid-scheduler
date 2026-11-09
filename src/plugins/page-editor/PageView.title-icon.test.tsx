// @vitest-environment jsdom
/**
 * 제목·아이콘(요구 12·13) — 제목↔노드 이름 동기화 · 아이콘 저장 왕복 · 옛 데이터 로드 ·
 *   제목 Enter 는 본문 첫 블록으로 · 🔴 IME 조합 중 Enter 는 무시(명세 요구 11·12).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PageView } from './views/PageView';
import { setActivePage } from './store';
import { initPageNodes } from './nodes';
import type { NodesApi, PublicNode } from '../project-explorer/contracts/nodes';
import type { PluginHost } from '../../pane-ui-system/plugin';
import type { Page } from './core/types';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const store = new Map<string, { id: string; type: string; name: string; children: string[]; data?: unknown }>();
const fakeNodes = {
    version: 1,
    get: (id: string) => store.get(id) as unknown as PublicNode | undefined,
    setData: (id: string, data: unknown) => { const n = store.get(id); if (n) n.data = data; },
    // 모델 rename 과 같은 결 — 양끝 공백 trim, 비면 옛 이름 유지(무시).
    rename: (id: string, name: string) => { const n = store.get(id); const t = name.trim(); if (n && t) n.name = t; },
    subscribe: () => ({ dispose() {} }),
    parent: () => null,
    roots: { main: 'main', trash: 'trash' },
} as unknown as NodesApi;
const host = { modules: { use: () => null } } as unknown as PluginHost;

let root: Root; let container: HTMLDivElement;
afterEach(() => { act(() => root.unmount()); container.remove(); setActivePage(null); store.clear(); });

function setup(page: Page, name = '테스트 페이지') {
    store.set('p1', { id: 'p1', type: 'page-editor.page', name, children: [], data: page });
    initPageNodes(fakeNodes);
    act(() => { setActivePage('p1'); });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(<PageView host={host} />); });
}

/** 제어 input 에 값을 넣고 React onChange 를 깨운다(네이티브 value setter 로 추적기를 속인다). */
function typeInto(input: HTMLInputElement, value: string) {
    const setVal = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => { setVal.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
}

function titleInput(): HTMLInputElement {
    return container.querySelector('input[aria-label="페이지 제목"]') as HTMLInputElement;
}

describe('제목(요구 12)', () => {
    it('제목을 고치면 탐색기 노드 이름도 바뀐다', () => {
        setup({ blocks: [{ id: 'b', type: 'paragraph', text: '본문' }] });
        const t = titleInput();
        expect(t.value).toBe('테스트 페이지');
        typeInto(t, '새 제목');
        expect(store.get('p1')!.name).toBe('새 제목');
    });

    it('빈 제목은 노드 이름을 지우지 않고 「제목 없음」 placeholder 를 보인다', () => {
        setup({ blocks: [{ id: 'b', type: 'paragraph', text: '본문' }] });
        const t = titleInput();
        expect(t.placeholder).toBe('제목 없음');
        typeInto(t, '   ');
        expect(store.get('p1')!.name).toBe('테스트 페이지');   // 공백뿐 → 옛 이름 유지
    });

    it('제목에서 Enter 는 본문 첫 블록으로 캐럿을 옮긴다', () => {
        setup({ blocks: [{ id: 'b', type: 'paragraph', text: '첫 블록' }] });
        const t = titleInput();
        t.focus();
        act(() => { t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
        const ce = container.querySelector('[contenteditable]') as HTMLElement;
        expect(document.activeElement).toBe(ce);
    });

    it('🔴 IME 조합 중 Enter 는 본문으로 넘어가지 않는다(요구 11)', () => {
        setup({ blocks: [{ id: 'b', type: 'paragraph', text: '첫 블록' }] });
        const t = titleInput();
        t.focus();
        act(() => { t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })); });
        expect(document.activeElement).toBe(t);   // 제목칸에 그대로
    });
});

describe('아이콘(요구 13)', () => {
    it('아이콘이 없으면 「아이콘 추가」, 고르면 페이지 데이터에 저장된다(저장 왕복 — 저장)', () => {
        setup({ blocks: [{ id: 'b', type: 'paragraph', text: '본문' }] });
        expect(container.textContent).toContain('아이콘 추가');

        const add = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('아이콘 추가'))!;
        act(() => { add.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

        const emojiBtn = [...container.querySelectorAll('button')].find((b) => b.textContent === '📌')!;
        act(() => { emojiBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

        expect((store.get('p1')!.data as Page).icon).toBe('📌');
    });

    it('아이콘이 있는 페이지는 그 아이콘을 보여 준다(저장 왕복 — 로드)', () => {
        setup({ blocks: [{ id: 'b', type: 'paragraph', text: '본문' }], icon: '🚀' });
        expect(container.textContent).toContain('🚀');
        expect(container.textContent).not.toContain('아이콘 추가');   // 있으면 추가 단추 대신 아이콘
    });

    it('아이콘 없는 옛 데이터도 그대로 열린다', () => {
        // icon 칸이 없는 옛 페이지 — 터지지 않고 제목·본문이 보인다.
        setup({ blocks: [{ id: 'b', type: 'paragraph', text: '옛 본문' }] });
        expect(titleInput().value).toBe('테스트 페이지');
        expect(container.textContent).toContain('옛 본문');
        expect(container.textContent).toContain('아이콘 추가');
    });
});
