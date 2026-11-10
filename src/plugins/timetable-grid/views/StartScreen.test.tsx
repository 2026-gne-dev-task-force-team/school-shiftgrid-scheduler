// @vitest-environment jsdom
/** 시작 화면 환영 카드 — 처음엔 보이고, 「다시 보지 않기」는 기억되며, 다시 켤 수 있다. */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { NodesApi } from '../../../pane-ui-system/core/nodes/contracts/nodes';
import type { PluginHost } from '../../../pane-ui-system/plugin';
import { initGridNodes } from '../nodes';
import { StartScreen } from './StartScreen';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => { act(() => { root?.unmount(); }); root = null; document.body.innerHTML = ''; });

const opened: string[] = [];
function mount() {
    const mem = new Map<string, unknown>();
    const host = {
        storage: { get: (k: string, d: unknown) => (mem.has(k) ? mem.get(k) : d), set: (k: string, v: unknown) => { mem.set(k, v); } },
        modules: { use: () => null },
        views: { get: (id: string) => (id === "staff.sheet" ? {} : undefined) },
        workspace: { open: (id: string) => { opened.push(id); } },
    } as unknown as PluginHost;
    const api = {
        roots: { main: 'm', trash: 't' }, byType: () => [], liveByType: () => [], get: () => undefined, parent: () => 'm',
        isTrashed: () => false, subscribe: () => ({ dispose() { /* 없음 */ } }),
    } as unknown as NodesApi;
    initGridNodes(api, host);
    const el = document.createElement('div');
    document.body.appendChild(el);
    root = createRoot(el);
    act(() => { root!.render(<StartScreen />); });
    return mem;
}
const q = (id: string) => document.querySelector(`[data-testid="${id}"]`);
const btn = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement;

describe('시작 화면 환영 카드', () => {
    it('처음 켜면 환영 카드·첫 걸음·지금 할 일 한 줄이 보인다', () => {
        mount();
        expect(q('welcome-card')).not.toBeNull();
        expect(document.body.textContent).toContain('시간표 만들기');
        expect(q('next-step')?.textContent).toContain('먼저 선생님 명단을 만드세요');
    });
    it('「다시 보지 않기」를 누르면 카드가 사라지고 기억되며, 「안내 다시 보기」로 돌아온다', () => {
        const mem = mount();
        act(() => { btn('다시 보지 않기').click(); });
        expect(q('welcome-card')).toBeNull();
        expect(mem.get('welcomeDismissed')).toBe(true);
        act(() => { btn('안내 다시 보기').click(); });
        expect(q('welcome-card')).not.toBeNull();
        expect(mem.get('welcomeDismissed')).toBe(false);
    });
});

describe('시작 화면 첫 걸음 — 있는 화면에만 잇는다', () => {
    it('명단 화면이 있으면 걸음 1이 보이고 누르면 그 화면을 연다 · 달력 화면이 없으면 그 걸음은 없다', () => {
        opened.length = 0;
        mount();
        expect(document.body.textContent).toContain('1. 선생님 명단 만들기');
        expect(document.body.textContent).not.toContain('달력에서 보기');
        act(() => { btn('선생님 명단 만들기').click(); });
        expect(opened).toEqual(['staff.sheet']);
    });
});
