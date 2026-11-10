// @vitest-environment jsdom
/**
 * W-T 시간표 격자 = 스프레드시트 — 선택 ↔ 편집 두 상태 · 화살표/Tab/Enter 이동 · ⇧ 범위 · Delete · TSV 복붙 · 병합 건너기.
 *   되돌리기는 진짜 노드 다리(applyEdit/stepEdit)로 잰다 — 붙여넣기·지우기가 「한 번」인지.
 */
import { act, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { NodesApi } from '../../explorer/contracts/nodes';
import { applyEdit, initGridNodes, SHEET_TYPE, sheetDataOf, stepEdit } from '../nodes';
import { blankTimetable, mergeCells, setCellText, type TimetableData } from '../model';
import { step } from '../gridNav';
import { TimeGrid } from './TimeGrid';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
afterEach(() => { act(() => { root?.unmount(); }); root = null; document.body.innerHTML = ''; initGridNodes(null); });

let data: TimetableData;
const subs = new Set<() => void>();
function mount(init: TimetableData = blankTimetable()) {
    data = init;
    const node = () => ({ id: 's1', type: SHEET_TYPE, name: 't', data });
    const api = { byType: () => [node()], get: () => node(), setData: (_: string, d: TimetableData) => { data = d; subs.forEach((f) => f()); }, subscribe: (f: () => void) => { subs.add(f); return { dispose() { subs.delete(f); } }; } } as unknown as NodesApi;
    initGridNodes(api, { notify() {} } as never);
    const sub = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
    function Live() {
        const d = useSyncExternalStore(sub, () => sheetDataOf('s1'), () => sheetDataOf('s1'));
        return <TimeGrid data={d} edit={(fn) => applyEdit('s1', fn)} />;
    }
    const el = document.createElement('div'); document.body.appendChild(el);
    root = createRoot(el); act(() => { root!.render(<Live />); });
}
const cellEl = (c: number, r: number) => document.querySelector(`[data-c="${c}"][data-r="${r}"]`) as HTMLElement;
const grid = () => document.querySelector('[role="grid"]') as HTMLElement;
const ring = () => document.querySelector('[role="grid"] .ring-accent')?.closest('[data-c]') as HTMLElement | null;
const at = () => { const e = ring(); return e ? [Number(e.dataset.c), Number(e.dataset.r)] : null; };
const mouse = (el: Element, type: string, init: MouseEventInit = {}) => act(() => { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init })); });
const key = (el: Element, k: string, init: KeyboardEventInit = {}) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })); });
const textarea = () => document.querySelector('[role="grid"] textarea') as HTMLTextAreaElement | null;
function typeIn(el: HTMLTextAreaElement, v: string) {
    act(() => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
}
function clip(type: 'copy' | 'cut' | 'paste', text = '') {
    const store = { v: text };
    const ev = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'clipboardData', { value: { getData: () => store.v, setData: (_: string, v: string) => { store.v = v; } } });
    act(() => { document.activeElement!.dispatchEvent(ev); });
    return store.v;
}
const txt = (c: number, r: number) => data.cells[`c${c}r${r}`]?.text ?? '';

describe('W-T 시간표 격자 = 스프레드시트', () => {
    it('칸 클릭 = 선택(편집창 없음 · 초점은 격자) → 화살표·Tab 로 칸 이동 · Enter = 편집 시작', () => {
        mount();
        mouse(cellEl(1, 1), 'mousedown');
        expect(textarea()).toBeNull();
        expect(document.activeElement).toBe(grid());
        expect(at()).toEqual([1, 1]);
        key(grid(), 'ArrowRight'); expect(at()).toEqual([2, 1]);
        key(grid(), 'ArrowDown'); expect(at()).toEqual([2, 2]);
        key(grid(), 'Tab'); expect(at()).toEqual([3, 2]);
        key(grid(), 'Tab', { shiftKey: true }); expect(at()).toEqual([2, 2]);
        key(grid(), 'ArrowDown'); expect(at()).toEqual([2, 3]);
        key(grid(), 'Enter');                                   // 🙋17 선택 상태 Enter = 편집 시작(시트와 같게)
        expect(textarea()).not.toBeNull();
        expect(at()).toEqual([2, 3]);
        key(textarea()!, 'Escape');
        expect(textarea()).toBeNull();
        key(grid(), 'ArrowUp'); key(grid(), 'ArrowLeft'); key(grid(), 'ArrowLeft'); key(grid(), 'ArrowLeft');
        expect(at()).toEqual([0, 2]);   // 표 밖으론 안 나간다
    });

    it('타자 시작 = 그 글자로 편집 → Enter 확정 + 아래 칸 선택(초점은 격자) · ⇧Enter 는 위', () => {
        mount();
        mouse(cellEl(0, 0), 'mousedown');
        key(grid(), '국');
        expect(textarea()!.value).toBe('국');
        typeIn(textarea()!, '국어');
        key(textarea()!, 'Enter');
        expect(txt(0, 0)).toBe('국어');
        expect(textarea()).toBeNull();
        expect(document.activeElement).toBe(grid());
        expect(at()).toEqual([0, 1]);
        key(grid(), 'F2'); typeIn(textarea()!, '수학'); key(textarea()!, 'Enter', { shiftKey: true });
        expect(txt(0, 1)).toBe('수학');
        expect(at()).toEqual([0, 0]);
        key(grid(), 'x'); key(textarea()!, 'Tab');   // Tab = 확정 + 옆
        expect(txt(0, 0)).toBe('x'); expect(at()).toEqual([1, 0]);
    });

    it('Esc = 편집 취소 → 선택 상태로 돌아와 화살표가 칸을 옮긴다', () => {
        mount(setCellText(blankTimetable(), 2, 2, '원래'));
        mouse(cellEl(2, 2), 'dblclick');
        typeIn(textarea()!, '바뀜');
        key(textarea()!, 'Escape');
        expect(txt(2, 2)).toBe('원래');
        expect(textarea()).toBeNull();
        expect(document.activeElement).toBe(grid());
        key(grid(), 'ArrowRight');
        expect(at()).toEqual([3, 2]);
    });

    it('⇧화살표·⇧클릭·끌기로 범위 → Delete 로 한 번에 지우고 ⌘Z 한 번에 돌아온다', () => {
        let d = blankTimetable();
        for (const [c, r] of [[0, 0], [1, 0], [0, 1], [1, 1], [2, 2]]) d = setCellText(d, c, r, `${c}${r}`);
        mount(d);
        mouse(cellEl(0, 0), 'mousedown');
        key(grid(), 'ArrowRight', { shiftKey: true }); key(grid(), 'ArrowDown', { shiftKey: true });
        key(grid(), 'Delete');
        expect([txt(0, 0), txt(1, 0), txt(0, 1), txt(1, 1), txt(2, 2)]).toEqual(['', '', '', '', '22']);
        act(() => { stepEdit('s1', 'undo'); });
        expect([txt(0, 0), txt(1, 1)]).toEqual(['00', '11']);
        // ⇧클릭
        mouse(cellEl(1, 1), 'mousedown'); mouse(cellEl(2, 2), 'mousedown', { shiftKey: true });
        key(grid(), 'Backspace');
        expect([txt(0, 0), txt(1, 1), txt(2, 2)]).toEqual(['00', '', '']);
        // 끌기
        mouse(cellEl(0, 0), 'mousedown'); mouse(cellEl(1, 0), 'mouseover'); mouse(cellEl(1, 0), 'mouseup');
        key(grid(), 'Delete');
        expect([txt(0, 0), txt(1, 0), txt(0, 1)]).toEqual(['', '', '01']);
    });

    it('여러 칸 TSV 붙여넣기 = 칸마다 · 표 밖은 열·교시 자동 확장 · 되돌리기 한 번 · 복사는 범위 TSV', () => {
        mount();
        mouse(cellEl(0, 0), 'mousedown');
        clip('paste', 'A\tB\nC\tD');
        expect([txt(0, 0), txt(1, 0), txt(0, 1), txt(1, 1)]).toEqual(['A', 'B', 'C', 'D']);
        mouse(cellEl(0, 0), 'mousedown'); mouse(cellEl(1, 1), 'mousedown', { shiftKey: true });
        expect(clip('copy')).toBe('A\tB\nC\tD');
        act(() => { stepEdit('s1', 'undo'); });
        expect(Object.keys(data.cells)).toEqual([]);
        mouse(cellEl(4, 5), 'mousedown');   // 맨 오른쪽 아래(금 · 6행) — 넘치면 열·교시를 더한다
        clip('paste', '1\t2\n3\t4');
        expect(Object.entries(data.cells).map(([k, v]) => [k, v.text])).toEqual([['c4r5', '1'], ['c5r5', '2'], ['c4r6', '3'], ['c5r6', '4']]);
        mouse(cellEl(4, 5), 'mousedown');
        expect(clip('cut')).toBe('1');
        expect(txt(4, 5)).toBe('');
    });

    it('병합 칸은 한 칸으로 건넌다', () => {
        const d = mergeCells(blankTimetable(), { col0: 1, row0: 1, col1: 2, row1: 2 });
        expect(step(d, { c: 0, r: 1 }, 1, 0)).toEqual({ c: 1, r: 1 });
        expect(step(d, { c: 1, r: 1 }, 1, 0)).toEqual({ c: 3, r: 1 });
        expect(step(d, { c: 1, r: 1 }, 0, 1)).toEqual({ c: 1, r: 3 });
        expect(step(d, { c: 2, r: 3 }, 0, -1)).toEqual({ c: 1, r: 1 });
        mount(d);
        mouse(cellEl(0, 2), 'mousedown');
        key(grid(), 'ArrowRight'); expect(at()).toEqual([1, 1]);
        key(grid(), 'ArrowRight'); expect(at()).toEqual([3, 1]);
    });

    it('⌘Z 는 격자가 먹지 않고 위로 흘린다', () => {
        mount();
        mouse(cellEl(0, 0), 'mousedown');
        const ev = new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true });
        act(() => { grid().dispatchEvent(ev); });
        expect(ev.defaultPrevented).toBe(false);
        expect(textarea()).toBeNull();
    });
});
