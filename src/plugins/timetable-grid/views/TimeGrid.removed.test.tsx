// @vitest-environment jsdom
/** 시간표 행·열 지우기·병합 해제 → 알림 + 되돌리기(⌘Z 더미) → 원상. 뒤에 편집이 쌓이면 회색. */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NodesApi } from '../../../pane-ui-system/core/nodes/contracts/nodes';
import { applyEdit, initGridNodes, notifyRemoved, removedUndoable, SHEET_TYPE, sheetDataOf, undoRemoved } from '../nodes';
import { blankTimetable, columnCount, mergeCells, setCellText, type TimetableData } from '../model';
import { TimeGrid } from './TimeGrid';
import { useSyncExternalStore } from 'react';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
afterEach(() => { act(() => { root?.unmount(); }); root = null; document.body.innerHTML = ''; initGridNodes(null); });

function setup() {
    let data: TimetableData = blankTimetable();
    const subs = new Set<() => void>();
    const node = () => ({ id: 's1', type: SHEET_TYPE, name: 't', data });
    const api = { byType: () => [node()], get: () => node(), setData: (_: string, d: TimetableData) => { data = d; subs.forEach((f) => f()); }, subscribe: (f: () => void) => { subs.add(f); return { dispose() { subs.delete(f); } }; } } as unknown as NodesApi;
    const notify = vi.fn();
    initGridNodes(api, { notify } as never);
    const sub = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
    return { notify, get: () => data, sub };
}
function Live({ sub }: { sub: (f: () => void) => () => void }) {
    const d = useSyncExternalStore(sub, () => sheetDataOf('s1'), () => sheetDataOf('s1'));
    return <TimeGrid data={d} edit={(fn) => applyEdit('s1', fn)} onRemoved={(t) => notifyRemoved('s1', t)} />;
}
const click = (el: Element | null) => act(() => { el!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const menu = (sel: string, label: string) => {
    const t = document.querySelector(sel)!;
    act(() => { t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 })); });
    const item = [...document.querySelectorAll('button,[role="menuitem"]')].find((b) => b.textContent?.includes(label));
    if (!item) throw new Error(`메뉴 없음: ${label}`);
    click(item);
};
function mount(s: ReturnType<typeof setup>) {
    const el = document.createElement('div'); document.body.appendChild(el);
    root = createRoot(el); act(() => { root!.render(<Live sub={s.sub} />); });
}

describe('시간표 지우기 알림', () => {
    it('칸 Delete → 알림 → 되돌리기 → 글자 복원', () => {
        const s = setup(); mount(s);
        const cell = document.querySelector<HTMLElement>('[data-c="0"][data-r="0"]')!;
        act(() => { applyEdit('s1', (d) => setCellText(d, 0, 0, '국어')); });
        const grid = document.querySelector<HTMLElement>('[role="grid"]')!;
        act(() => { cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); });
        act(() => { grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true })); });
        expect(s.notify.mock.calls.at(-1)![0].title).toBe('칸 글자를 지웠습니다');
        expect(removedUndoable()).toBe(true);
        act(() => { undoRemoved(); });
        expect(JSON.stringify(s.get().cells)).toContain('국어');
    });
    it('마지막 칸 Tab 은 막지 않는다(격자 밖으로)', () => {
        const s = setup(); mount(s);
        const grid = document.querySelector<HTMLElement>('[role="grid"]')!;
        const last = [...document.querySelectorAll<HTMLElement>('[data-c][data-r]')].at(-1)!;
        act(() => { last.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); });
        const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
        act(() => { grid.dispatchEvent(ev); });
        expect(ev.defaultPrevented).toBe(false);
    });
    it('행 지우기 → 알림 → 되돌리기 → 원상', () => {
        const s = setup(); mount(s);
        const n0 = s.get().rows.length;
        menu('[data-r="1"]', '이 교시 삭제');
        expect(s.get().rows.length).toBe(n0 - 1);
        expect(s.notify.mock.calls.at(-1)![0].title).toBe('교시 1개를 삭제했습니다');
        expect(removedUndoable()).toBe(true);
        act(() => { undoRemoved(); });
        expect(s.get().rows.length).toBe(n0);
    });
    it('열 지우기 → 알림 → 되돌리기 → 원상 · 뒤에 편집이 쌓이면 회색', () => {
        const s = setup(); mount(s);
        const n0 = columnCount(s.get().columns);
        menu('[data-c="1"]', '이 열 삭제');
        expect(columnCount(s.get().columns)).toBe(n0 - 1);
        expect(s.notify.mock.calls.at(-1)![0].title).toBe('열 1개를 삭제했습니다');
        expect(removedUndoable()).toBe(true);
        act(() => { undoRemoved(); });
        expect(columnCount(s.get().columns)).toBe(n0);
        menu('[data-c="1"]', '이 열 삭제');
        act(() => { applyEdit('s1', (d) => mergeCells(d, { col0: 0, row0: 0, col1: 0, row1: 1 })); });
        expect(removedUndoable()).toBe(false);
    });
    it('병합 해제 → 알림 → 되돌리기 → 병합이 돌아온다', () => {
        const s = setup(); mount(s);
        act(() => { applyEdit('s1', (d) => mergeCells(d, { col0: 0, row0: 0, col1: 0, row1: 1 })); });
        const merged = s.get();
        menu('[data-c="0"][data-r="0"]', '병합 해제');
        expect(s.get()).not.toEqual(merged);
        expect(s.notify.mock.calls.at(-1)![0].title).toBe('병합을 풀었습니다');
        act(() => { undoRemoved(); });
        expect(s.get()).toEqual(merged);
    });
});
