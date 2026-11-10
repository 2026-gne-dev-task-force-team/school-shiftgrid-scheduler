// @vitest-environment jsdom
/**
 * 제목(요구 12) — 제목↔노드 이름 동기화 · 제목 Enter 는 본문 첫 블록으로 · 🔴 IME 조합 중 Enter 는 무시(명세 요구 11·12).
 *   🔑 Q5: 머리(아이콘·제목)는 노드 틀(nodes.Frame)이 그린다 — 아이콘 고르기·저장 왕복은 explorer 의 머리 테스트가 본다.
 *   여기선 페이지 편집기가 틀에 넘기는 것(제목 접근성 이름·placeholder·Enter → 본문 첫 블록)만 본다. 틀은 가짜(test-frame-host).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PageView } from './views/PageView';
import { setActivePage } from './store';
import { initPageNodes } from './nodes';
import type { NodesApi, PublicNode } from '../../pane-ui-system/core/nodes/contracts/nodes';
import type { Page } from './core/types';
import { frameHost } from './test-frame-host';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const store = new Map<string, { id: string; type: string; name: string; children: string[]; icon?: string; body?: unknown }>();
const fakeNodes = {
    version: 1,
    get: (id: string) => store.get(id) as unknown as PublicNode | undefined,
    setIcon: (id: string, icon: string | undefined) => { const n = store.get(id); if (n) n.icon = icon; },
    setBody: (id: string, body: unknown) => { const n = store.get(id); if (n) n.body = body; },
    // 모델 rename 과 같은 결 — 양끝 공백 trim, 비면 옛 이름 유지(무시).
    rename: (id: string, name: string) => { const n = store.get(id); const t = name.trim(); if (n && t) n.name = t; },
    subscribe: () => ({ dispose() {} }),
    parent: () => null,
    children: () => [],   // Q8: 본문의 하위 페이지 줄을 맞추느라 자식을 묻는다 — 이 테스트의 페이지엔 자식이 없다
    batch: (fn: () => void) => fn(),
    isTrashed: () => false,   // R5-8 정식 휴지통 판정 — 이 테스트의 페이지는 휴지통 밖
    roots: { main: 'main', trash: 'trash' },
} as unknown as NodesApi;
const host = frameHost(fakeNodes);

let root: Root; let container: HTMLDivElement;
afterEach(() => { act(() => root.unmount()); container.remove(); setActivePage(null); store.clear(); });

function setup(page: Page, name = '테스트 페이지', icon?: string) {
    store.set('p1', { id: 'p1', type: 'page.page', name, children: [], body: page, icon });
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
        t.focus();
        typeInto(t, '새 제목');
        act(() => { t.blur(); });   // 제목 칸은 포커스가 빠질 때 한 번 넘긴다
        expect(store.get('p1')!.name).toBe('새 제목');
    });

    it('빈 제목은 노드 이름을 지우지 않고 「제목 없음」 placeholder 를 보인다', () => {
        setup({ blocks: [{ id: 'b', type: 'paragraph', text: '본문' }] });
        const t = titleInput();
        expect(t.placeholder).toBe('제목 없음');
        t.focus();
        typeInto(t, '   ');
        act(() => { t.blur(); });
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
