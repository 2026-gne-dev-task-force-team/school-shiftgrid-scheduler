// @vitest-environment jsdom
/**
 * Table M2 통합 검산 — 병합 · 열 폭 · 행열 편집(axis-edit) · 행 높이(row-weight) · 열 타입(col-types) ·
 *   decorate · validate · headerMenu · 구조(행/열) 되돌리기. 실제 앱 대신 여기서 「됐다」를 본다.
 */
import { act, createRef, forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Table, type TableHandle } from './Table';
import type { CellValidation, CellDecoration, MergeRegion, TableColumn, TableRow, TableTx } from './contracts/table';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let gid = 0;
/** 트랜잭션을 상태(rows·columns·merges)에 적용 — ids 가 있으면 그대로 쓴다(되돌리기 짝 맞춤). */
function applyTx(
    st: { rows: TableRow[]; cols: TableColumn[]; merges: MergeRegion[] },
    tx: TableTx,
): typeof st {
    let rows = st.rows.map((r) => ({ ...r, cells: { ...r.cells } }));
    let cols = st.cols.map((c) => ({ ...c }));
    let merges = st.merges.map((m) => ({ ...m }));

    for (const c of tx.cells) { const row = rows.find((r) => r.id === c.rowId); if (row) row.cells[c.key] = c.value; }
    if (tx.rows?.remove) rows = rows.filter((r) => !tx.rows!.remove!.includes(r.id));
    for (const a of tx.rows?.add ?? []) {
        const list = a.cells ?? Array.from({ length: a.count }, () => ({}));
        const ins = list.map((cells, i) => ({ id: a.ids?.[i] ?? `g${gid++}`, cells: { ...cells } }));
        rows.splice(a.at, 0, ...ins);
    }
    for (const m of tx.rows?.move ?? []) {
        const i = rows.findIndex((r) => r.id === m.id);
        if (i >= 0) { const [row] = rows.splice(i, 1); rows.splice(Math.min(m.to, rows.length), 0, row); }
    }
    for (const a of tx.cols?.add ?? []) cols.splice(a.at, 0, { key: a.key, title: a.title });
    if (tx.cols?.remove) cols = cols.filter((c) => !tx.cols!.remove!.includes(c.key));
    for (const rn of tx.cols?.rename ?? []) { const col = cols.find((c) => c.key === rn.key); if (col) col.title = rn.title; }
    for (const rz of tx.cols?.resize ?? []) { const col = cols.find((c) => c.key === rz.key); if (col) col.width = rz.width; }
    for (const w of tx.axis?.rowWeight ?? []) { const row = rows.find((r) => r.id === w.id); if (row) row.weight = (row.weight ?? 28) + w.delta; }
    for (const s of tx.merge?.set ?? []) { merges = merges.filter((m) => !(m.rowId === s.rowId && m.key === s.key)); merges.push({ ...s }); }
    for (const cl of tx.merge?.clear ?? []) merges = merges.filter((m) => !(m.rowId === cl.rowId && m.key === cl.key));

    return { rows, cols, merges };
}

interface CtrlRef { h: () => TableHandle; st: () => { rows: TableRow[]; cols: TableColumn[]; merges: MergeRegion[] } }
const Controlled = forwardRef<CtrlRef, {
    initRows: TableRow[]; initCols: TableColumn[]; features: string[];
    decorate?: (rowId: string, key: string, value: string) => CellDecoration | undefined;
    validate?: (rowId: string, key: string, value: string) => CellValidation | undefined;
    headerMenu?: (kind: 'row' | 'col', id: string) => { label: string; onSelect?: () => void }[];
    onTx?: (tx: TableTx) => void;
}>(function Controlled({ initRows, initCols, features, decorate, validate, headerMenu, onTx }, ref) {
    const [st, setSt] = useState({ rows: initRows, cols: initCols, merges: [] as MergeRegion[] });
    const inner = useRef<TableHandle>(null);
    useImperativeHandle(ref, () => ({ h: () => inner.current!, st: () => st }), [st]);
    return (
        <Table
            ref={inner} columns={st.cols} rows={st.rows} merges={st.merges} features={features}
            decorate={decorate} validate={validate} headerMenu={headerMenu}
            onCommit={(tx) => { onTx?.(tx); setSt((s) => applyTx(s, tx)); }}
        />
    );
});

let root: Root | null = null;
let hostEl: HTMLDivElement | null = null;
function mount(ui: React.ReactElement) {
    hostEl = document.createElement('div');
    document.body.appendChild(hostEl);
    root = createRoot(hostEl);
    act(() => { root!.render(ui); });
}
afterEach(() => {
    if (root) act(() => root!.unmount());
    hostEl?.remove(); root = null; hostEl = null;
    document.querySelectorAll('[data-table-menu]').forEach((n) => n.remove());
});

const cols3 = (): TableColumn[] => [{ key: 'a', title: 'A' }, { key: 'b', title: 'B' }, { key: 'c', title: 'C' }];
const rows3 = (): TableRow[] => [
    { id: 'r0', cells: { a: '1', b: '2', c: '3' } },
    { id: 'r1', cells: { a: '4', b: '5', c: '6' } },
    { id: 'r2', cells: { a: '7', b: '8', c: '9' } },
];
function clickText(label: string) {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(label));
    if (!btn) throw new Error(`단추를 못 찾았다: ${label}`);
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

describe('Table M2 — 병합', () => {
    it('범위를 골라 「칸 합치기」 하면 merge.set tx 가 나가고 덮인 칸이 안 그려진다', () => {
        const ref = createRef<CtrlRef>();
        const onTx = vi.fn();
        mount(<Controlled ref={ref} initRows={rows3()} initCols={cols3()} features={['merge']} onTx={onTx} />);
        const before = document.querySelectorAll('[data-testid="table-grid"] td').length;
        act(() => ref.current!.h().select(0, 0, 1, 1));   // 2×2
        clickText('칸 합치기');
        const tx = onTx.mock.calls.at(-1)![0] as TableTx;
        expect(tx.merge?.set?.[0]).toEqual({ rowId: 'r0', key: 'a', rowSpan: 2, colSpan: 2 });
        expect(ref.current!.st().merges).toHaveLength(1);
        const after = document.querySelectorAll('[data-testid="table-grid"] td').length;
        expect(after).toBe(before - 3);   // 2×2 병합 → 칸 3개가 사라진다
    });

    it('병합 앵커 칸에 rowSpan·colSpan 이 붙는다', () => {
        const ref = createRef<CtrlRef>();
        mount(<Controlled ref={ref} initRows={rows3()} initCols={cols3()} features={['merge']} />);
        act(() => ref.current!.h().select(0, 0, 1, 1));
        clickText('칸 합치기');
        const spanned = [...document.querySelectorAll('td')].find((td) => td.getAttribute('rowspan') === '2');
        expect(spanned).toBeTruthy();
        expect(spanned!.getAttribute('colspan')).toBe('2');
    });
});

describe('Table M2 — 열 폭(col-resize)', () => {
    it('머리 경계를 끌면 cols.resize tx 가 나간다', () => {
        const ref = createRef<CtrlRef>();
        const onTx = vi.fn();
        mount(<Controlled ref={ref} initRows={rows3()} initCols={cols3()} features={['col-resize']} onTx={onTx} />);
        const handle = document.querySelector('[data-testid="col-resize"]')!;
        act(() => { handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100 })); });
        act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: 160 })); });
        act(() => { window.dispatchEvent(new MouseEvent('mouseup', {})); });
        const tx = onTx.mock.calls.at(-1)![0] as TableTx;
        expect(tx.cols?.resize?.[0].key).toBe('a');
        expect(tx.cols!.resize![0].width).toBeGreaterThan(120);   // 120(기본) + 60
    });
});

describe('Table M2 — 행열 편집(axis-edit)', () => {
    it('오른쪽 + 막대로 열을 더한다', () => {
        const ref = createRef<CtrlRef>();
        mount(<Controlled ref={ref} initRows={rows3()} initCols={cols3()} features={['rows', 'axis-edit']} />);
        expect(ref.current!.st().cols).toHaveLength(3);
        const addCol = document.querySelector('[data-testid="add-col"]')!;
        act(() => { addCol.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect(ref.current!.st().cols).toHaveLength(4);
    });
    it('열 손잡이 메뉴에서 「이 칸 지우기」 로 열을 뺀다', () => {
        const ref = createRef<CtrlRef>();
        mount(<Controlled ref={ref} initRows={rows3()} initCols={cols3()} features={['rows', 'axis-edit']} />);
        const handle = document.querySelectorAll('[data-testid="col-handle"]')[0];   // A 열 손잡이
        act(() => { handle.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 })); });
        clickText('이 칸 지우기');
        expect(ref.current!.st().cols.map((c) => c.key)).toEqual(['b', 'c']);
    });
    it('행 손잡이 메뉴 「줄 지우기」 로 행을 지운다', () => {
        const ref = createRef<CtrlRef>();
        mount(<Controlled ref={ref} initRows={rows3()} initCols={cols3()} features={['rows']} />);
        const handle = document.querySelectorAll('[data-testid="row-handle"]')[0];
        act(() => { handle.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 })); });
        clickText('줄 지우기');
        expect(ref.current!.st().rows.map((r) => r.id)).toEqual(['r1', 'r2']);
    });
});

describe('Table M2 — 행 높이(row-weight)', () => {
    it('행 머리 경계를 끌면 axis.rowWeight tx 가 나간다(5 단위 스냅)', () => {
        const ref = createRef<CtrlRef>();
        const onTx = vi.fn();
        mount(<Controlled ref={ref} initRows={rows3()} initCols={cols3()} features={['row-weight']} onTx={onTx} />);
        const handle = document.querySelector('[data-testid="row-weight"]')!;
        act(() => { handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientY: 100 })); });
        act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientY: 142 })); });   // +42 → 스냅 후 델타
        act(() => { window.dispatchEvent(new MouseEvent('mouseup', {})); });
        const tx = onTx.mock.calls.at(-1)![0] as TableTx;
        expect(tx.axis?.rowWeight?.[0].id).toBe('r0');
        expect(tx.axis!.rowWeight![0].delta).toBeGreaterThan(0);
        const w = ref.current!.st().rows[0].weight!;
        expect(w % 5).toBe(0);           // 높이가 5 단위로 스냅된다
        expect(w).toBeGreaterThan(28);
    });
});

describe('Table M2 — 열 타입(col-types) bool', () => {
    it('bool 칸은 체크박스로 그려지고 누르면 값이 뒤집힌다', () => {
        const ref = createRef<CtrlRef>();
        const cols: TableColumn[] = [{ key: 'name', title: '이름' }, { key: 'done', title: '끝', type: 'bool' }];
        const rows: TableRow[] = [{ id: 'r0', cells: { name: '가', done: '' } }];
        mount(<Controlled ref={ref} initRows={rows} initCols={cols} features={['col-types']} />);
        const box = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
        expect(box).toBeTruthy();
        expect(box.checked).toBe(false);
        act(() => { box.dispatchEvent(new MouseEvent('click', { bubbles: true })); box.dispatchEvent(new Event('change', { bubbles: true })); });
        expect(ref.current!.st().rows[0].cells.done).toBe('1');
    });
});

describe('Table M2 — decorate·validate·headerMenu', () => {
    it('decorate 의 badge 가 칸에 붙는다', () => {
        const ref = createRef<CtrlRef>();
        mount(<Controlled ref={ref} initRows={rows3()} initCols={cols3()} features={[]}
            decorate={(_id, key) => (key === 'a' ? { badge: '★', tone: 'ok' } : undefined)} />);
        expect(document.querySelector('[data-testid="table-grid"]')!.textContent).toContain('★');
    });
    it('validate 가 틀린 칸을 표시하고 툴바에 수를 올린다', () => {
        const ref = createRef<CtrlRef>();
        mount(<Controlled ref={ref} initRows={rows3()} initCols={cols3()} features={['validate']}
            validate={(_id, key) => (key === 'a' ? { level: 'bad', message: '안 돼' } : undefined)} />);
        expect(document.querySelector('[data-testid="table-grid"]')!.innerHTML).toContain('ring-bad');
        expect(document.body.textContent).toContain('확인 필요');
    });
    it('headerMenu 의 손님 항목을 누르면 onSelect 가 불린다', () => {
        const ref = createRef<CtrlRef>();
        const onSelect = vi.fn();
        mount(<Controlled ref={ref} initRows={rows3()} initCols={cols3()} features={[]}
            headerMenu={(kind) => (kind === 'col' ? [{ label: '손님 항목', onSelect }] : [])} />);
        const th = document.querySelector('thead th')!;   // showRowHead 없음 → 첫 th = A 열
        act(() => { th.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 5, clientY: 5 })); });
        clickText('손님 항목');
        expect(onSelect).toHaveBeenCalled();
    });
});

describe('Table M2 — 구조 되돌리기(history + 행/열)', () => {
    it('행 추가를 ⌘Z 로 되돌린다(같은 id 로 지운다)', () => {
        const ref = createRef<CtrlRef>();
        mount(<Controlled ref={ref} initRows={rows3()} initCols={cols3()} features={['rows', 'history']} />);
        const h = () => ref.current!.h();
        act(() => h().focus());
        const addRow = document.querySelector('[data-testid="add-row"]')!;
        act(() => { addRow.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect(ref.current!.st().rows).toHaveLength(4);
        act(() => h().focus());
        act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true })); });
        expect(ref.current!.st().rows).toHaveLength(3);
    });
    it('행 삭제를 ⌘Z 로 되살린다(옛 값·옛 자리)', () => {
        const ref = createRef<CtrlRef>();
        mount(<Controlled ref={ref} initRows={rows3()} initCols={cols3()} features={['rows', 'history']} />);
        const h = () => ref.current!.h();
        const handle = document.querySelectorAll('[data-testid="row-handle"]')[0];
        act(() => { handle.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 })); });
        clickText('줄 지우기');
        expect(ref.current!.st().rows.map((r) => r.id)).toEqual(['r1', 'r2']);
        act(() => h().focus());
        act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true })); });
        const back = ref.current!.st().rows;
        expect(back.map((r) => r.id)).toEqual(['r0', 'r1', 'r2']);
        expect(back[0].cells).toEqual({ a: '1', b: '2', c: '3' });
    });
});
