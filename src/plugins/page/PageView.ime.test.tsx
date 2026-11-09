// @vitest-environment jsdom
/**
 * 🔴 한글 IME — 조합 중(compositionstart~end)엔 실시간 변환·재렌더를 하지 않고,
 *   compositionend 뒤에 한 번만 처리한다(명세 요구 11). 실시간 서식 렌더로 바꾸며 가장 깨지기 쉬운 자리다.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PageView } from './views/PageView';
import { setActivePage } from './store';
import { initPageNodes } from './nodes';
import type { NodesApi, PublicNode } from '../explorer/contracts/nodes';
import type { PluginHost } from '../../pane-ui-system/plugin';
import type { Page } from './core/types';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const store = new Map<string, { id: string; type: string; name: string; children: string[]; body?: unknown }>();
const fakeNodes = {
    version: 1,
    get: (id: string) => store.get(id) as unknown as PublicNode | undefined,
    setBody: (id: string, body: unknown) => { const n = store.get(id); if (n) n.body = body; },
    subscribe: () => ({ dispose() {} }),
    parent: () => null,   // 휴지통 판정(inTrash)이 묻는다 — 이 테스트의 페이지는 루트에 있다
} as unknown as NodesApi;
const host = { modules: { use: () => null } } as unknown as PluginHost;

let root: Root; let container: HTMLDivElement;
afterEach(() => { act(() => root.unmount()); container.remove(); setActivePage(null); store.clear(); });

function setup(page: Page) {
    store.set('p1', { id: 'p1', type: 'page.page', name: '테스트', children: [], body: page });
    initPageNodes(fakeNodes);
    act(() => { setActivePage('p1'); });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(<PageView host={host} />); });
}

function fire(el: Element, type: string) {
    act(() => { el.dispatchEvent(new Event(type, { bubbles: true })); });
}

describe('🔴 한글 IME — 조합 중 무변환(요구 11)', () => {
    it('조합 중 **가** 는 글자 그대로, compositionend 뒤에 굵게로', () => {
        setup({ blocks: [{ id: 'b', type: 'paragraph', text: '' }] });
        const ce = container.querySelector('[contenteditable]') as HTMLElement;
        expect(ce).not.toBeNull();

        // 조합 시작 → 조합 중 입력(마커 포함) → 아직 변환되면 안 된다
        fire(ce, 'compositionstart');
        ce.textContent = '**가**';
        fire(ce, 'input');
        expect(ce.querySelector('strong')).toBeNull();   // 🔴 조합 중엔 재렌더/변환 금지
        expect(ce.textContent).toBe('**가**');

        // 조합 끝 → 한 번 처리 → 그제서야 굵게
        fire(ce, 'compositionend');
        expect(ce.querySelector('strong')?.textContent).toBe('가');
    });
});
