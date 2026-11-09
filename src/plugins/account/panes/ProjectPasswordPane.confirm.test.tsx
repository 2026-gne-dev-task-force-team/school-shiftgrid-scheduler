// @vitest-environment jsdom
/** #27 프로젝트 암호 해제 — 한 번 눌러 즉시 풀리지 않고 확인창을 거친다. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

const setPw = vi.hoisted(() => vi.fn(async () => true));
vi.mock('../core', () => ({
    getCurrent: () => ({ kind: 'master' }), hasProjectPassword: () => true, setProjectPassword: setPw,
    getKeepMinutes: () => 0, setKeepMinutes: () => {},
}));
vi.mock('./useAccount', () => ({ useAccountVersion: () => 0 }));
import { ProjectPasswordPane } from './ProjectPasswordPane';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const btn = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === t) as HTMLElement;

describe('프로젝트 암호 해제 확인창', () => {
    it('「암호 해제」는 확인창만 띄우고, 「해제」를 눌러야 풀린다', async () => {
        const el = document.createElement('div'); document.body.appendChild(el);
        const root = createRoot(el);
        act(() => { root.render(<ProjectPasswordPane />); });
        act(() => { btn('암호 해제').click(); });
        expect(setPw).not.toHaveBeenCalled();
        expect(document.body.textContent).toContain('프로젝트 암호를 해제할까요?');
        await act(async () => { btn('해제').click(); });
        expect(setPw).toHaveBeenCalledWith('', '');
        act(() => { root.unmount(); });
    });

    it('새 암호를 비운 채 「암호 바꾸기」도 같은 확인창을 탄다', async () => {
        setPw.mockClear();
        const el = document.createElement('div'); document.body.appendChild(el);
        const root = createRoot(el);
        act(() => { root.render(<ProjectPasswordPane />); });
        await act(async () => { btn('암호 바꾸기').click(); });
        expect(setPw).not.toHaveBeenCalled();
        expect(document.body.textContent).toContain('프로젝트 암호를 해제할까요?');
        act(() => { root.unmount(); });
    });
});
