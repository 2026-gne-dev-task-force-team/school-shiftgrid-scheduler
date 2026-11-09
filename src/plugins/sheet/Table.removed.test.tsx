// @vitest-environment jsdom
/** 시트 행·열 지우기 → 「n개를 지웠습니다」 알림 + 되돌리기 → 원상. 뒤에 다른 작업이 쌓이면 회색(isTop=false). */
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Table } from './Table';
import type { TableColumn, TableRow, TableTx } from './contracts/table';
import { initTableNodes, notifyRemoved, removedUndoable, undoRemoved } from './nodes';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
afterEach(() => { act(() => { root?.unmount(); }); root = null; document.body.innerHTML = ''; initTableNodes(null); });

const COLS: TableColumn[] = [{ key: 'a', title: 'A' }, { key: 'b', title: 'B' }];
const ROWS: TableRow[] = [{ id: 'r1', cells: { a: '1' } }, { id: 'r2', cells: { a: '2' } }, { id: 'r3', cells: { a: '3' } }];
let latest = { rows: ROWS, cols: COLS };

function apply(st: typeof latest, tx: TableTx): typeof latest {
    let rows = st.rows, cols = st.cols;
    if (tx.rows?.remove) rows = rows.filter((r) => !tx.rows!.remove!.includes(r.id));
    for (const a of tx.rows?.add ?? []) rows = [...rows.slice(0, a.at), ...(a.cells ?? []).map((c, i) => ({ id: a.ids![i], cells: { ...c } })), ...rows.slice(a.at)];
    if (tx.cols?.remove) cols = cols.filter((c) => !tx.cols!.remove!.includes(c.key));
    for (const a of tx.cols?.add ?? []) cols = [...cols.slice(0, a.at), { key: a.key, title: a.title }, ...cols.slice(a.at)];
    return { rows, cols };
}
function H({ notify }: { notify: (isTop: () => boolean) => void }) {
    const [st, setSt] = useState({ rows: ROWS, cols: COLS });
    latest = st;
    return <Table columns={st.cols} rows={st.rows} features={['rows', 'axis-edit', 'history']}
        onCommit={(tx) => setSt((s) => apply(s, tx))}
        onRemoved={(kind, n, undo, isTop) => { notify(isTop); notifyRemoved(`${kind} ${n}개를 지웠습니다`, undo, isTop); }} />;
}
const ctx = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 })); });
const clickText = (t: string) => {
    const el = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(t)) as HTMLElement;
    act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};
function mount() {
    const notify = vi.fn(); const title = vi.fn();
    initTableNodes(null, { notify: title } as never);
    const el = document.createElement('div'); document.body.appendChild(el);
    root = createRoot(el); act(() => { root!.render(<H notify={notify} />); });
    return { notify, title };
}

describe('시트 행·열 지우기 알림', () => {
    it('행 지우기 → 알림 → 되돌리기 → 원상', () => {
        const s = mount();
        ctx(document.querySelectorAll('[data-testid="row-handle"]')[0]); clickText('줄 지우기');
        expect(latest.rows.map((r) => r.id)).toEqual(['r2', 'r3']);
        expect(s.title.mock.calls.at(-1)![0].title).toBe('행 1개를 지웠습니다');
        expect(s.title.mock.calls.at(-1)![0].action.commandId).toBe('sheet.undoRemoved');
        expect(removedUndoable()).toBe(true);
        act(() => { undoRemoved(); });
        expect(latest.rows.map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);
    });
    it('열 지우기 → 알림 → 되돌리기 → 원상 · 뒤에 다른 작업이 쌓이면 회색', () => {
        const s = mount();
        ctx(document.querySelectorAll('[data-testid="col-handle"]')[0]); clickText('이 칸 지우기');
        expect(latest.cols.map((c) => c.key)).toEqual(['b']);
        expect(s.title.mock.calls.at(-1)![0].title).toBe('열 1개를 지웠습니다');
        act(() => { undoRemoved(); });
        expect(latest.cols.map((c) => c.key)).toEqual(['a', 'b']);
        // 회색: 지운 뒤 행을 하나 더 지우면 첫 알림은 무효
        ctx(document.querySelectorAll('[data-testid="col-handle"]')[0]); clickText('이 칸 지우기');
        const firstTop = s.notify.mock.calls.at(-1)![0] as () => boolean;
        expect(firstTop()).toBe(true);
        ctx(document.querySelectorAll('[data-testid="row-handle"]')[0]); clickText('줄 지우기');
        expect(firstTop()).toBe(false);   // 뒤에 다른 작업이 쌓였다 → 옛 알림은 회색
    });
});
