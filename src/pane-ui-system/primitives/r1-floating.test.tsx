// @vitest-environment jsdom
/**
 * R1 떠 있는 부품 — Dialog 초점(autoFocus 존중·입력 중 안 뺏김·가두기·복귀) · Popover Esc 층 · ContextMenu 방향키.
 */
import { act, createElement as h, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';
import { Popover } from './Popover';
import { ContextMenu, type MenuEntry } from './ContextMenu';
import { MenuList, MenuItem } from './Menu';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let roots: Root[] = [];
// 닫힘 퇴장 전환(presence)은 움직임 줄이기면 즉시 — 이 파일은 「닫힘 호출」을 재므로 즉시 모드로 돌린다
beforeEach(() => { vi.stubGlobal('matchMedia', () => ({ matches: true })); });
afterEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { act(() => roots.forEach((r) => r.unmount())); roots = []; document.body.innerHTML = ''; });

function mount(node: React.ReactNode) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    act(() => root.render(node));
    return root;
}
const key = (k: string, opts: KeyboardEventInit = {}) =>
    act(() => { (document.activeElement ?? window).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...opts })); });
const rect = () => new DOMRect(10, 10, 40, 20);

describe('Dialog 초점', () => {
    it('자식 autoFocus 를 덮지 않는다', () => {
        mount(h(Dialog, { title: 't', onClose: () => {} },
            h('input', { id: 'a' }), h('input', { id: 'b', autoFocus: true })));
        expect(document.activeElement?.id).toBe('b');
    });

    it('autoFocus 가 없으면 첫 입력칸을 잡는다', () => {
        mount(h(Dialog, { title: 't', onClose: () => {} }, h('button', { id: 'btn' }, 'x'), h('input', { id: 'a' })));
        expect(document.activeElement?.id).toBe('a');
    });

    it('부모가 인라인 onClose 로 다시 그려도 입력 중 초점을 안 뺏는다', () => {
        let rerender: () => void = () => {};
        function Host() {
            const [n, setN] = useState(0);
            rerender = () => setN((x) => x + 1);
            return h(Dialog, { title: 't', onClose: () => void n }, h('input', { id: 'a' }), h('input', { id: 'b' }));
        }
        mount(h(Host));
        act(() => (document.getElementById('b') as HTMLElement).focus());
        act(() => rerender());
        expect(document.activeElement?.id).toBe('b');
    });

    it('닫히면 연 자리로 초점이 돌아간다', () => {
        const opener = document.createElement('button');
        opener.id = 'opener';
        document.body.appendChild(opener);
        opener.focus();
        const root = mount(h(Dialog, { title: 't', onClose: () => {} }, h('input', { id: 'a' })));
        expect(document.activeElement?.id).toBe('a');
        act(() => root.render(h(Dialog, { open: false, title: 't', onClose: () => {} })));
        expect(document.activeElement?.id).toBe('opener');
    });

    it('autoFocus 자식이 있어도 닫히면 연 자리로 돌아간다', () => {
        const opener = document.createElement('button');
        opener.id = 'opener2';
        document.body.appendChild(opener);
        opener.focus();
        const root = mount(h(Dialog, { title: 't', onClose: () => {} }, h('input', { id: 'af', autoFocus: true })));
        expect(document.activeElement?.id).toBe('af');
        act(() => root.render(h(Dialog, { open: false, title: 't', onClose: () => {} })));
        expect(document.activeElement?.id).toBe('opener2');
    });

    it('Tab 은 패널 안에서 돈다', () => {
        mount(h(Dialog, { title: 't', onClose: () => {} }, h('input', { id: 'a' }), h('button', { id: 'z' }, 'z')));
        act(() => (document.getElementById('z') as HTMLElement).focus());
        key('Tab');
        expect(document.activeElement?.id).toBe('a');
        key('Tab', { shiftKey: true });
        expect(document.activeElement?.id).toBe('z');
    });
});

describe('Popover Esc 층', () => {
    it('대화창 안 팝오버의 Esc 는 팝오버만 닫는다', () => {
        const dialogClose = vi.fn();
        const popClose = vi.fn();
        mount(h(Dialog, { title: 't', onClose: dialogClose }, h(Popover, { anchor: rect(), onClose: popClose }, h('input', { id: 'p' }))));
        key('Escape');
        expect(popClose).toHaveBeenCalledTimes(1);
        expect(dialogClose).not.toHaveBeenCalled();
    });

    it('팝오버가 없으면 Esc 는 대화창을 닫는다', () => {
        const dialogClose = vi.fn();
        mount(h(Dialog, { title: 't', onClose: dialogClose }, h('input')));
        key('Escape');
        expect(dialogClose).toHaveBeenCalledTimes(1);
    });

    it('바깥 스크롤엔 닫히고 안쪽 스크롤엔 안 닫힌다', () => {
        const popClose = vi.fn();
        mount(h(Popover, { anchor: rect(), onClose: popClose }, h('div', { id: 'inner' }, 'x')));
        act(() => { document.getElementById('inner')!.dispatchEvent(new Event('scroll')); });
        expect(popClose).not.toHaveBeenCalled();
        act(() => { document.body.dispatchEvent(new Event('scroll')); });
        expect(popClose).toHaveBeenCalledTimes(1);
    });

    it('대화창보다 위 겹(z-popover > z-modal)에 뜬다', () => {
        mount(h(Dialog, { title: 't', onClose: () => {} }, h(Popover, { anchor: rect(), onClose: () => {} }, 'x')));
        expect(document.querySelector('[data-popover]')!.className).toContain('z-popover');
        expect(document.querySelector('[role="dialog"]')!.parentElement!.className).toContain('z-modal');
    });
});

describe('ContextMenu 키보드', () => {
    const items = (spy: (l: string) => void): MenuEntry[] => [
        { label: '하나', onClick: () => spy('하나') },
        { label: '끔', disabled: true, onClick: () => spy('끔') },
        { sep: true },
        { label: '둘', shortcut: '⌘D', onClick: () => spy('둘') },
        { label: '셋', danger: true, onClick: () => spy('셋') },
    ];
    const label = () => document.activeElement?.textContent;

    it('뜨면 첫 항목 · ↓ 는 끈 항목을 건너뛴다 · 끝에서 돈다 · Home/End', () => {
        mount(h(ContextMenu, { x: 0, y: 0, items: items(() => {}), onClose: () => {} }));
        expect(label()).toBe('하나');
        key('ArrowDown');
        expect(label()).toBe('둘⌘D');
        key('ArrowDown');
        expect(label()).toBe('셋');
        key('ArrowDown');
        expect(label()).toBe('하나');
        key('ArrowUp');
        expect(label()).toBe('셋');
        key('Home');
        expect(label()).toBe('하나');
        key('End');
        expect(label()).toBe('셋');
    });

    it('Enter 는 초점 항목을 실행하고 닫는다', () => {
        const spy = vi.fn();
        const onClose = vi.fn();
        mount(h(ContextMenu, { x: 0, y: 0, items: items(spy), onClose }));
        key('ArrowDown');
        key('Enter');
        expect(spy).toHaveBeenCalledWith('둘');
        expect(onClose).toHaveBeenCalled();
    });

    it('닫히면 열기 전 초점 자리로 돌아간다', () => {
        const opener = document.createElement('button');
        opener.id = 'op';
        document.body.appendChild(opener);
        opener.focus();
        const root = mount(h(ContextMenu, { x: 0, y: 0, items: items(() => {}), onClose: () => {} }));
        expect(label()).toBe('하나');
        act(() => root.render(null));
        expect(document.activeElement?.id).toBe('op');
    });

    it('Esc 는 메뉴만 닫는다', () => {
        const onClose = vi.fn();
        mount(h(ContextMenu, { x: 0, y: 0, items: items(() => {}), onClose }));
        key('Escape');
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('MenuList 는 Popover 안에서도 같은 꼴이다(단축키·위험색)', () => {
        mount(h(MenuList, { autoFocus: true }, h(MenuItem, { label: 'a', shortcut: 'X', onSelect: () => {} }), h(MenuItem, { label: 'b', danger: true, onSelect: () => {} })));
        expect(label()).toBe('aX');
        const b = [...document.querySelectorAll('[role="menuitem"]')][1];
        expect(b.className).toContain('text-bad');
    });
});
