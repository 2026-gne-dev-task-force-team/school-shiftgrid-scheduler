// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => { document.body.innerHTML = ''; });

function mount(props: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(createElement(ConfirmDialog, { title: '지울까요?', onConfirm, onCancel, ...props }, '되돌릴 수 없습니다')));
    return { onConfirm, onCancel };
}

const dialog = () => document.querySelector('[role="dialog"]');
const button = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === label)!;

describe('Dialog · ConfirmDialog', () => {
    it('제목이 접근성 이름이고 본문·두 단추가 뜬다', () => {
        mount();
        expect(dialog()?.getAttribute('aria-label')).toBe('지울까요?');
        expect(dialog()?.textContent).toContain('되돌릴 수 없습니다');
        expect(button('확인')).toBeTruthy();
        expect(button('취소')).toBeTruthy();
    });

    it('확인 → onConfirm · 취소 → onCancel', () => {
        const { onConfirm, onCancel } = mount();
        act(() => button('확인').click());
        expect(onConfirm).toHaveBeenCalledTimes(1);
        act(() => button('취소').click());
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('🔴 Esc 와 바깥 클릭은 취소다(확인이 아니다)', () => {
        const { onConfirm, onCancel } = mount();
        act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
        expect(onCancel).toHaveBeenCalledTimes(1);
        const backdrop = dialog()!.parentElement!;
        act(() => { backdrop.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
        expect(onCancel).toHaveBeenCalledTimes(2);
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('open=false 면 아무것도 안 그린다', () => {
        mount({ open: false });
        expect(dialog()).toBeNull();
    });
});
