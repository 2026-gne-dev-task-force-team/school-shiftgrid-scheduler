// @vitest-environment jsdom
/** K23 우클릭 메뉴 틀 — 구분선·묶음 머리·하위 메뉴(눌러/→ 키로 펼침, ← 로 접음). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ContextMenu, type MenuEntry } from './ContextMenu';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root; let box: HTMLDivElement;
const mount = (items: MenuEntry[], onCommand = vi.fn()) => {
    box = document.createElement('div'); document.body.appendChild(box); root = createRoot(box);
    act(() => { root.render(<ContextMenu x={10} y={10} items={items} onClose={() => {}} onCommand={onCommand} />); });
    return onCommand;
};
afterEach(() => { act(() => root.unmount()); box.remove(); document.body.innerHTML = ''; });

const key = (el: Element, k: string) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); });
const subItems = () => [...document.querySelectorAll('[data-ctx-sub] [role="menuitem"]')].map((e) => e.textContent);

describe('ContextMenu 하위 메뉴·구분선', () => {
    const items: MenuEntry[] = [
        { label: '열기' },
        { sep: true },
        { label: '새로 만들기', children: [{ label: '새 폴더', commandId: 'c.folder' }, { label: '새 노트' }] },
        { sep: true, label: '위험' },
        { label: '삭제', danger: true },
    ];
    it('구분선·묶음 머리가 그려진다', () => {
        mount(items);
        const seps = [...document.querySelectorAll('[role="separator"]')];
        expect(seps.length).toBe(2);
        expect(seps[1].textContent).toBe('위험');
    });
    it('하위 메뉴는 처음엔 닫혀 있고 → 키로 펼쳐지며, ← 로 접힌다', () => {
        mount(items);
        expect(subItems()).toEqual([]);
        const parent = [...document.querySelectorAll('[role="menuitem"]')].find((e) => e.textContent?.startsWith('새로 만들기'))!;
        (parent as HTMLElement).focus();
        key(parent, 'ArrowRight');
        expect(subItems()).toEqual(['새 폴더', '새 노트']);
        key(document.querySelector('[data-ctx-sub] [role="menuitem"]')!, 'ArrowLeft');
        expect(subItems()).toEqual([]);
    });
    it('하위 항목을 누르면 명령이 불린다', () => {
        const cmd = mount(items);
        const parent = [...document.querySelectorAll('[role="menuitem"]')].find((e) => e.textContent?.startsWith('새로 만들기')) as HTMLElement;
        act(() => { parent.click(); });
        act(() => { (document.querySelector('[data-ctx-sub] [role="menuitem"]') as HTMLElement).click(); });
        expect(cmd).toHaveBeenCalledWith('c.folder', undefined);
    });
});
