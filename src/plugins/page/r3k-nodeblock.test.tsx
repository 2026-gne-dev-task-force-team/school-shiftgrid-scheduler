// @vitest-environment jsdom
/** R3-K 항목 끼워 넣기 선택기 — ↓·↑ 로 후보 이동, Enter 로 고르기(입력칸 초점은 그대로). */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NodeBlock } from './views/NodeBlock';
import { initPageNodes } from './nodes';
import type { NodesApi, PublicNode } from '../../pane-ui-system/core/nodes/contracts/nodes';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const all = ['가', '나', '다'].map((name, i) => ({ id: `n${i}`, type: 'page.page', name, children: [] })) as unknown as PublicNode[];
const api = {
    version: 1, subscribe: () => ({ dispose() {} }), find: (p: (n: PublicNode) => boolean) => all.filter(p), get: () => undefined, parent: () => null,
    isTrashed: () => false, roots: { main: 'main', trash: 'trash' }, Embed: () => null,
} as unknown as NodesApi;

let root: Root | null = null; let host: HTMLDivElement | null = null;
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; initPageNodes(null); });

function mount(onPick: (id: string) => void) {
    initPageNodes(api);
    host = document.createElement('div'); document.body.appendChild(host);
    root = createRoot(host);
    act(() => { root!.render(<NodeBlock selfId="self" onPick={onPick} />); });
}
const key = (el: Element, k: string, init: KeyboardEventInit = {}) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })); });
const input = () => document.querySelector('input[aria-label="끼워 넣을 항목 찾기"]') as HTMLInputElement;
const selected = () => [...document.querySelectorAll('[role="option"]')].findIndex((o) => o.getAttribute('aria-selected') === 'true');

describe('끼워 넣기 선택기 키보드', () => {
    it('입력칸 초점 · ↓↓ 로 셋째 후보 · Enter 로 그 항목을 고른다 · 초점은 입력칸에 남는다', () => {
        const pick = vi.fn(); mount(pick);
        expect(document.activeElement).toBe(input());
        expect(selected()).toBe(0);
        key(input(), 'ArrowDown'); key(input(), 'ArrowDown');
        expect(selected()).toBe(2);
        expect(document.activeElement).toBe(input());
        key(input(), 'Enter');
        expect(pick).toHaveBeenCalledWith('n2');
    });
    it('↑ 는 거꾸로 돌고 · 한글 조합 중 Enter 는 고르지 않는다', () => {
        const pick = vi.fn(); mount(pick);
        key(input(), 'ArrowUp');
        expect(selected()).toBe(2);
        key(input(), 'Enter', { isComposing: true });
        expect(pick).not.toHaveBeenCalled();
    });
});
