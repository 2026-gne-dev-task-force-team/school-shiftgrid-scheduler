// @vitest-environment jsdom
/** R3-K 떠 있는 부품 초점 — Popover(열면 안으로 · 닫으면 연 단추로) · ContextMenu(남이 가져간 초점은 안 뺏는다) · PeekLayer(닫으면 연 자리로). */
import { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Popover } from './Popover';
import { ContextMenu } from './ContextMenu';
import { PeekLayer } from '../shell/shared/PeekLayer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let roots: Root[] = [];
beforeEach(() => { vi.stubGlobal('matchMedia', () => ({ matches: true })); });
afterEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { act(() => roots.forEach((r) => r.unmount())); roots = []; document.body.innerHTML = ''; });
function mount(node: React.ReactNode) {
    const host = document.createElement('div'); document.body.appendChild(host);
    const root = createRoot(host); roots.push(root); act(() => root.render(node)); return root;
}
const opener = () => { const b = document.createElement('button'); b.id = 'op'; document.body.appendChild(b); b.focus(); return b; };
const esc = () => act(() => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });

describe('Popover 초점', () => {
    it('열면 안의 첫 조작 요소로 · Esc 로 닫으면 연 단추로 돌아온다', () => {
        const op = opener();
        let open = true;
        const root = mount(null);
        const render = () => act(() => root.render(open ? h(Popover, { anchor: new DOMRect(0, 0, 10, 10), onClose: () => { open = false; render(); } }, h('button', { id: 'first' }, 'a'), h('button', null, 'b')) : null));
        render();
        expect(document.activeElement?.id).toBe('first');
        esc();
        expect(document.getElementById('first')).toBeNull();
        expect(document.activeElement).toBe(op);
    });
    it('안쪽이 이미 초점을 가져갔으면(autoFocus) 덮지 않는다', () => {
        opener();
        mount(h(Popover, { anchor: new DOMRect(0, 0, 10, 10), onClose: () => {} }, h('button', { id: 'a' }, 'a'), h('input', { id: 'b', autoFocus: true })));
        expect(document.activeElement?.id).toBe('b');
    });
    it('입력칸 없이 내용만 있어도 팝오버 자신이 초점(BODY 로 안 빠진다)', () => {
        opener();
        mount(h(Popover, { anchor: new DOMRect(0, 0, 10, 10), onClose: () => {} }, h('span', null, '글')));
        expect(document.activeElement?.hasAttribute('data-popover')).toBe(true);
    });
});

describe('ContextMenu 초점', () => {
    it('메뉴가 일으킨 일이 초점을 가져갔으면 닫힐 때 뺏지 않는다', () => {
        opener();
        const target = document.createElement('input'); target.id = 'edit'; document.body.appendChild(target);
        let open = true;
        const root = mount(null);
        const render = () => act(() => root.render(open ? h(ContextMenu, { x: 0, y: 0, onClose: () => { open = false; render(); }, items: [{ label: '편집', onClick: () => target.focus() }] }) : null));
        render();
        act(() => (document.querySelector('[role="menuitem"]') as HTMLElement).click());
        expect(document.activeElement).toBe(target);
    });
});

describe('PeekLayer 초점', () => {
    it('Esc 로 닫아 층이 사라지면 연 자리(행)로 초점이 돌아온다', () => {
        const row = opener();
        let open = true;
        const root = mount(null);
        const render = () => act(() => root.render(open ? h(PeekLayer, { mode: 'overlay', onClose: () => { open = false; render(); }, children: h('textarea', { id: 'memo', autoFocus: true }) }) : null));
        render();
        act(() => document.getElementById('memo')!.focus());
        esc();
        expect(document.getElementById('memo')).toBeNull();
        expect(document.activeElement).toBe(row);
    });
});
