// @vitest-environment jsdom
/**
 * 속성 패널 — 범위·열 꼴은 두 칸 고르기(지금 것이 눌린 모양), 복사 단추는 튀지 않는다.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NodesApi } from '../../../pane-ui-system/core/nodes/contracts/nodes';
import { initGridNodes, SHEET_TYPE } from '../nodes';
import { blankTimetable, type TimetableData } from '../model';
import { TimetableProps } from './TimetableProps';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
afterEach(() => { act(() => { root?.unmount(); }); root = null; document.body.innerHTML = ''; initGridNodes(null); });

let data: TimetableData;
function mount() {
    data = blankTimetable();
    const subs = new Set<() => void>();
    const node = () => ({ id: 's1', type: SHEET_TYPE, name: 't', data });
    const api = { byType: () => [node()], get: () => node(), setData: (_: string, d: TimetableData) => { data = d; subs.forEach((f) => f()); }, subscribe: (f: () => void) => { subs.add(f); return { dispose() { subs.delete(f); } }; } } as unknown as NodesApi;
    initGridNodes(api, { notify: vi.fn() } as never);
    const el = document.createElement('div'); document.body.appendChild(el);
    root = createRoot(el);
    act(() => { root!.render(<TimetableProps target={{ id: 's1' } as never} host={{} as never} />); });
}
const radio = (name: string) => [...document.querySelectorAll('[role="radio"]')].find((b) => b.textContent === name) as HTMLElement;

describe('TimetableProps', () => {
    it('범위: 기간|횟수 두 칸 — 지금 것이 눌려 있고, 다른 칸을 누르면 바뀐다', () => {
        mount();
        expect(radio('기간').getAttribute('aria-checked')).toBe('true');
        expect(radio('횟수').getAttribute('aria-checked')).toBe('false');
        act(() => { radio('횟수').click(); });
        expect(data.range.kind).toBe('repeat');
        expect(radio('횟수').getAttribute('aria-checked')).toBe('true');
        act(() => { radio('횟수').click(); });   // 이미 눌린 칸을 또 눌러도 안 뒤집힌다
        expect(data.range.kind).toBe('repeat');
    });
    it('열 꼴도 두 칸 고르기', () => {
        mount();
        expect(radio('요일').getAttribute('aria-checked')).toBe('true');
        act(() => { radio('일차').click(); });
        expect(data.columns.kind).toBe('cycle');
    });
});
