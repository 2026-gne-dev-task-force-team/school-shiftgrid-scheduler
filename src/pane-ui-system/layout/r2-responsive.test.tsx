// @vitest-environment jsdom
/** R2 — S5 반응형 실시간 전환(usePanels/useNarrow) · S13 탭 닫기 자리 고정 */
import { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { useNarrow, usePanels, type Panels } from './useScreen';
import { Row } from '../primitives/Row';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let roots: Root[] = [];
afterEach(() => { act(() => roots.forEach((r) => r.unmount())); roots = []; document.body.innerHTML = ''; });

/** 가짜 matchMedia — setWidth 로 창 폭을 바꾸면 change 를 쏜다 */
function fakeScreen(initial: number) {
    let w = initial;
    const subs = new Set<{ q: number; fn: (e: { matches: boolean }) => void }>();
    window.matchMedia = ((query: string) => {
        const q = Number(/max-width:\s*(\d+)px/.exec(query)![1]);
        return {
            get matches() { return w <= q; },
            addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => subs.add({ q, fn }),
            removeEventListener: (_: string, fn: unknown) => { for (const s of subs) if (s.fn === fn) subs.delete(s); },
        };
    }) as unknown as typeof window.matchMedia;
    return (nw: number) => { w = nw; act(() => subs.forEach((s) => s.fn({ matches: w <= s.q }))); };
}

function probe() {
    const out: { narrow: boolean; panels: Panels }[] = [];
    function P() { const narrow = useNarrow(); const panels = usePanels(narrow); out.push({ narrow, panels }); return null; }
    const host = document.createElement('div');
    const root = createRoot(host);
    roots.push(root);
    act(() => root.render(h(P)));
    return () => out[out.length - 1];
}

describe('S5 — 창만 줄여도 서랍이 접힌다', () => {
    it('넓음 → 좁음에서 접고, 다시 넓히면 원래 배치로 돌아온다', () => {
        localStorage.clear();
        const setWidth = fakeScreen(1280);
        const last = probe();
        expect(last().narrow).toBe(false);
        expect(last().panels.state.leftOpen).toBe(true);
        expect(last().panels.state.rightOpen).toBe(true);
        setWidth(390);
        expect(last().narrow).toBe(true);
        expect(last().panels.state.leftOpen).toBe(false);
        expect(last().panels.state.rightOpen).toBe(false);
        setWidth(1280);
        expect(last().narrow).toBe(false);
        expect(last().panels.state.leftOpen).toBe(true);
        expect(last().panels.state.rightOpen).toBe(true);
    });
});

describe('S13 — 탭 닫기 × 자리는 늘 확보한다', () => {
    const slotCls = (active: boolean) => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);
        roots.push(root);
        act(() => root.render(h(Row, { label: 'a', variant: 'tab', active, revealOnHover: true, end: h('button', null, 'x') })));
        return (host.querySelector('button')!.parentElement as HTMLElement).className;
    };
    it('활성·비활성 모두 hidden 이 아니라 flex 로 폭을 차지하고 opacity 만 바뀐다', () => {
        for (const a of [true, false]) {
            const c = slotCls(a);
            expect(c).toMatch(/\bflex\b/);
            expect(c).not.toMatch(/\bhidden\b/);
        }
        expect(slotCls(false)).toMatch(/\bopacity-0\b/);
        expect(slotCls(true)).toMatch(/\bopacity-100\b/);
    });
});
