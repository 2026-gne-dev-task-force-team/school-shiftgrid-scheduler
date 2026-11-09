// @vitest-environment jsdom
import { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePresence, useExitClose } from './presence';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let last: { mounted: boolean; closing: boolean } = { mounted: false, closing: false };
function P({ open }: { open: boolean }) { last = usePresence(open, 120); return null; }
let api: { closing: boolean; close: () => void } | null = null;
function E({ fn }: { fn: () => void }) { api = useExitClose(fn, 120); return null; }
function mount(node: React.ReactElement) {
    const el = document.createElement('div');
    root = createRoot(el);
    act(() => root!.render(node));
}

describe('presence', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => { act(() => root?.unmount()); root = null; vi.useRealTimers(); vi.unstubAllGlobals(); });

    it('open 이 꺼져도 ms 동안 mounted·closing, 뒤에 언마운트', () => {
        mount(h(P, { open: true }));
        expect(last).toEqual({ mounted: true, closing: false });
        act(() => root!.render(h(P, { open: false })));
        expect(last).toEqual({ mounted: true, closing: true });
        act(() => { vi.advanceTimersByTime(119); });
        expect(last.mounted).toBe(true);
        act(() => { vi.advanceTimersByTime(2); });
        expect(last).toEqual({ mounted: false, closing: false });
    });

    it('퇴장 중 다시 열리면 유지', () => {
        mount(h(P, { open: true }));
        act(() => root!.render(h(P, { open: false })));
        act(() => root!.render(h(P, { open: true })));
        act(() => { vi.advanceTimersByTime(500); });
        expect(last).toEqual({ mounted: true, closing: false });
    });

    it('useExitClose 는 onClose 를 ms 뒤 한 번만 부른다', () => {
        const fn = vi.fn();
        mount(h(E, { fn }));
        act(() => { api!.close(); api!.close(); });
        expect(api!.closing).toBe(true);
        expect(fn).not.toHaveBeenCalled();
        act(() => { vi.advanceTimersByTime(130); });
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('움직임 줄이기면 즉시', () => {
        vi.stubGlobal('matchMedia', () => ({ matches: true }));
        mount(h(P, { open: true }));
        act(() => root!.render(h(P, { open: false })));
        expect(last.mounted).toBe(false);
    });
});
