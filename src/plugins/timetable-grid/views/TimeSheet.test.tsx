// @vitest-environment jsdom
/**
 * 리치 셀 2단계 — 시간표 화면 = 시트 Table 확장. 진짜 시트 Table 을 끼워 잰다(가짜 아님).
 *   열 = 요일 · 행 머리 = 교시+시각 · 쉬는 시간 틈 · 편집/붙이기/지우기 → model · 되돌리기는 시간표 노드 다리(applyEdit/stepEdit).
 */
import { act, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NodesApi } from '../../../pane-ui-system/core/nodes/contracts/nodes';
import { Table } from '../../sheet/Table';
import { applyEdit, initGridNodes, notifyRemoved, removedUndoable, SHEET_TYPE, sheetDataOf, stepEdit, undoRemoved } from '../nodes';
import { blankTimetable, columnCount, mergeCells, setCellText, type TimetableData } from '../model';
import { TimeSheet } from './TimeSheet';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
afterEach(() => { act(() => { root?.unmount(); }); root = null; document.body.innerHTML = ''; initGridNodes(null); });

let data: TimetableData;
let notify: ReturnType<typeof vi.fn>;
function mount(init: TimetableData = blankTimetable()) {
    data = init;
    const subs = new Set<() => void>();
    const node = () => ({ id: 's1', type: SHEET_TYPE, name: 't', data });
    const api = { byType: () => [node()], get: () => node(), setData: (_: string, d: TimetableData) => { data = d; subs.forEach((f) => f()); }, subscribe: (f: () => void) => { subs.add(f); return { dispose() { subs.delete(f); } }; } } as unknown as NodesApi;
    notify = vi.fn();
    initGridNodes(api, { notify } as never);
    const sub = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
    function Live() {
        const d = useSyncExternalStore(sub, () => sheetDataOf('s1'), () => sheetDataOf('s1'));
        return <TimeSheet data={d} Table={Table} edit={(fn) => applyEdit('s1', fn)} onRemoved={(t) => notifyRemoved('s1', t)}
            undo={() => stepEdit('s1', 'undo')} redo={() => stepEdit('s1', 'redo')} />;
    }
    const el = document.createElement('div'); document.body.appendChild(el);
    root = createRoot(el); act(() => { root!.render(<Live />); });
}
const q = <T extends Element = HTMLElement>(s: string) => document.querySelector(s) as T | null;
const cell = (c: number, r: number) => q(`[data-rc="${r}:${c}"]`)!;
const grid = () => q('[data-testid="table-grid"]')!;
const txt = (c: number, r: number) => data.cells[`c${c}r${r}`]?.text ?? '';
const mouse = (el: EventTarget, type: string, init: MouseEventInit = {}) => act(() => { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init })); });
const key = (k: string, init: KeyboardEventInit = {}) => act(() => { (document.activeElement ?? grid()).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })); });
const pick = (c: number, r: number) => { mouse(cell(c, r), 'mousedown'); mouse(window, 'mouseup'); };
function typeIn(v: string) {
    const el = document.activeElement as HTMLTextAreaElement | HTMLInputElement;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    act(() => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
}
function paste(text: string) {
    const ev = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'clipboardData', { value: { getData: () => text, setData() {} } });
    act(() => { (document.activeElement ?? grid()).dispatchEvent(ev); });
}
const menu = (target: Element, label: string) => {
    act(() => { target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 })); });
    const item = [...document.querySelectorAll('button,[role="menuitem"]')].find((b) => b.textContent?.includes(label));
    if (!item) throw new Error(`메뉴 없음: ${label}`);
    mouse(item, 'click');
};
const colHead = (title: string) => [...document.querySelectorAll('thead th')].find((t) => t.textContent?.trim() === title)!;

describe('시간표 = 시트 확장', () => {
    it('열 제목 = 요일 · 행 머리 = 교시 + 시각 · 행 높이 = 분 × 0.8 · 쉬는 시간 틈', () => {
        mount();
        for (const d of ['월', '화', '수', '목', '금']) expect(colHead(d)).toBeTruthy();
        const h0 = q('[data-row-head="0"]')!;
        expect(h0.textContent).toContain('1교시');
        expect(h0.textContent).toContain('09:00~09:50');
        expect(q<HTMLElement>('tr[data-row-idx="0"]')!.style.height).toBe('40px');
        // 10분 × 0.8 = 8px 틈 — 글자는 10px 이상일 때만(안 그러면 잘린다)
        expect(q<HTMLElement>(`tr[data-row-gap="${data.rows[1].id}"]`)!.style.height).toBe('8px');
        expect(q(`tr[data-row-gap="${data.rows[0].id}"]`)).toBeNull();
    });

    it('칸 고르고 타자 → Enter = 시간표에 저장 · ⌘Z = 시간표 되돌리기', () => {
        mount();
        pick(1, 1);
        key('국'); typeIn('국어'); key('Enter');
        expect(txt(1, 1)).toBe('국어');
        expect(cell(1, 1).textContent).toContain('국어');
        act(() => { stepEdit('s1', 'undo'); });
        expect(txt(1, 1)).toBe('');
    });

    it('붙여넣기(TSV) 한 번 = 되돌리기 한 칸 · 넘치면 교시가 늘어난다', () => {
        mount();
        pick(0, 5);
        paste('가\t나\n다\t라');
        expect(txt(0, 5)).toBe('가'); expect(txt(1, 5)).toBe('나');
        expect(data.rows).toHaveLength(7);
        expect(txt(0, 6)).toBe('다');
        act(() => { stepEdit('s1', 'undo'); });
        expect(data.rows).toHaveLength(6);
        expect(txt(0, 5)).toBe('');
    });

    it('틈 끌기 → 쉬는 시간(분, 5분 단위) · 뒤 교시가 밀린다', () => {
        mount();
        const s2 = data.rows[2].range.start;
        mouse(q('[data-testid="gap-edge"]')!, 'mousedown', { clientY: 100 });
        mouse(window, 'mousemove', { clientY: 116 });
        mouse(window, 'mouseup', { clientY: 116 });
        expect(data.rows[1].range.start - data.rows[0].range.end).toBe(30);   // 10분 + 16px/0.8
        expect(data.rows[2].range.start).toBe(s2 + 20);
    });

    it('행 아래 끝 끌기 → 교시 길이(분)', () => {
        mount();
        mouse(q('[data-row-head="0"] [data-testid="row-edge-end"]')!, 'mousedown', { clientY: 100 });
        mouse(window, 'mousemove', { clientY: 120 });
        mouse(window, 'mouseup', { clientY: 120 });
        expect(data.rows[0].range).toEqual({ start: 540, end: 615 });   // 40px + 20px = 60px ÷ 0.8 = 75분
    });

    it('병합은 칸 하나로 그린다', () => {
        mount(mergeCells(blankTimetable(), { col0: 0, row0: 0, col1: 1, row1: 1 }));
        const td = cell(0, 0) as HTMLTableCellElement;
        expect(td.rowSpan).toBe(2); expect(td.colSpan).toBe(2);
        expect(q('[data-rc="1:1"]')).toBeNull();
    });
});

describe('시간표 지우기 알림(되돌리기 알림)', () => {
    it('칸 Delete → 알림 → 되돌리기 → 글자 복원', () => {
        mount(setCellText(blankTimetable(), 0, 0, '국어'));
        pick(0, 0);
        key('Delete');
        expect(txt(0, 0)).toBe('');
        expect(notify.mock.calls.at(-1)![0].title).toBe('칸 글자를 지웠습니다');
        expect(removedUndoable()).toBe(true);
        act(() => { undoRemoved(); });
        expect(txt(0, 0)).toBe('국어');
    });

    it('교시 지우기(행 손잡이 메뉴) → 알림 → 되돌리기 → 원상', () => {
        mount();
        const n0 = data.rows.length;
        menu(document.querySelectorAll('[data-testid="row-handle"]')[1], '이 교시 삭제');
        expect(data.rows).toHaveLength(n0 - 1);
        expect(notify.mock.calls.at(-1)![0].title).toBe('교시 1개를 삭제했습니다');
        act(() => { undoRemoved(); });
        expect(data.rows).toHaveLength(n0);
    });

    it('열 지우기(열 머리 메뉴) → 알림 → 되돌리기', () => {
        mount();
        const n0 = columnCount(data.columns);
        menu(colHead('화'), '이 열 삭제');
        expect(columnCount(data.columns)).toBe(n0 - 1);
        expect(notify.mock.calls.at(-1)![0].title).toBe('열 1개를 삭제했습니다');
        act(() => { undoRemoved(); });
        expect(columnCount(data.columns)).toBe(n0);
    });

    it('병합 해제(칸 메뉴) → 알림 → 되돌리기 → 병합이 돌아온다', () => {
        mount(mergeCells(blankTimetable(), { col0: 0, row0: 0, col1: 0, row1: 1 }));
        const merged = data;
        menu(cell(0, 0), '병합 해제');
        expect(data.cells['c0r0']?.rowSpan ?? 1).toBe(1);
        expect(notify.mock.calls.at(-1)![0].title).toBe('병합을 풀었습니다');
        act(() => { undoRemoved(); });
        expect(data).toEqual(merged);
    });
});
