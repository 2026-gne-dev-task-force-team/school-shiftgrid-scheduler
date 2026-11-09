// @vitest-environment jsdom
/** 토스트 퇴장 — 스토어에서 빠진 토스트는 .ui-pop-out(클릭 무시)으로 잠깐 남았다가 제거된다. 나타날 땐 .ui-pop-in. */
import { act, createElement as h, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLeavingToasts, TOAST_EXIT_MS } from './Toasts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

const AB = ['a', 'b'], B = ['b'];
function Probe({ ids }: { ids: string[] }) {
    const toasts = useMemo(() => ids.map((id) => ({ id })), [ids]);   // 스토어 스냅샷처럼 참조가 안정
    const list = useLeavingToasts(toasts);
    return h('div', null, list.map(({ item, leaving }) => h('i', { key: item.id, 'data-id': item.id, className: leaving ? 'ui-pop-out' : 'ui-pop-in' })));
}

describe('토스트 퇴장', () => {
    it('빠진 토스트는 ui-pop-out 으로 남았다가 퇴장 시간 뒤 사라진다', () => {
        vi.useFakeTimers();
        const el = document.createElement('div'); document.body.appendChild(el);
        const root = createRoot(el);
        act(() => root.render(h(Probe, { ids: AB })));
        expect(el.querySelectorAll('.ui-pop-in').length).toBe(2);
        act(() => root.render(h(Probe, { ids: B })));
        expect(el.querySelector('[data-id="a"]')?.className).toBe('ui-pop-out');
        expect(el.querySelector('[data-id="b"]')?.className).toBe('ui-pop-in');
        act(() => { vi.advanceTimersByTime(TOAST_EXIT_MS + 5); });
        expect(el.querySelector('[data-id="a"]')).toBeNull();
        act(() => root.unmount());
    });
});
