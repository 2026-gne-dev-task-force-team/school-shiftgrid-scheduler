// @vitest-environment jsdom
/**
 * Table 통합 검산 — controlled 편집 · 키보드 · 붙여넣기 정책(append/clip) · 지우기 · 채우기 ·
 *   두 탭 동시(같은 데이터) · 내장 되돌리기 · TSV 왕복(api). 실제 앱 대신 여기서 「됐다」를 본다.
 */
import { act, createRef, forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Table, type TableHandle } from './Table';
import { tableApi } from './api';
import type { TableColumn, TableRow, TableTx } from './contracts/table';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cols: TableColumn[] = [{ key: 'a', title: 'A' }, { key: 'b', title: 'B' }];
const oneRow = (): TableRow[] => [{ id: 'r1', cells: { a: '', b: '' } }];

let gid = 0;
function applyTx(rows: TableRow[], tx: TableTx): TableRow[] {
    let next = rows.map((r) => ({ ...r, cells: { ...r.cells } }));
    for (const c of tx.cells) { const row = next.find((r) => r.id === c.rowId); if (row) row.cells[c.key] = c.value; }
    if (tx.rows?.remove) next = next.filter((r) => !tx.rows!.remove!.includes(r.id));
    for (const a of tx.rows?.add ?? []) {
        const ins = (a.cells ?? Array.from({ length: a.count }, () => ({}))).map((cells) => ({ id: `g${gid++}`, cells: { ...cells } }));
        next.splice(a.at, 0, ...ins);
    }
    for (const m of tx.rows?.move ?? []) {
        const i = next.findIndex((r) => r.id === m.id);
        if (i >= 0) { const [row] = next.splice(i, 1); next.splice(Math.min(m.to, next.length), 0, row); }
    }
    return next;
}

interface CtrlRef { h: () => TableHandle; rows: () => TableRow[] }
const Controlled = forwardRef<CtrlRef, { initial: TableRow[]; features?: (string)[]; onTx?: (tx: TableTx) => void }>(
    function Controlled({ initial, features, onTx }, ref) {
        const [rows, setRows] = useState(initial);
        const inner = useRef<TableHandle>(null);
        useImperativeHandle(ref, () => ({ h: () => inner.current!, rows: () => rows }), [rows]);
        return <Table ref={inner} columns={cols} rows={rows} features={features} onCommit={(tx) => { onTx?.(tx); setRows((r) => applyTx(r, tx)); }} />;
    },
);

let root: Root | null = null;
let hostEl: HTMLDivElement | null = null;
function mount(ui: React.ReactElement) {
    hostEl = document.createElement('div');
    document.body.appendChild(hostEl);
    root = createRoot(hostEl);
    act(() => { root!.render(ui); });
}
afterEach(() => { if (root) act(() => root!.unmount()); hostEl?.remove(); root = null; hostEl = null; });

function key(k: string, mods: Partial<KeyboardEventInit> = {}) {
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...mods })); });
}

describe('Table — controlled 편집·키보드', () => {
    it('글자 입력 후 Enter 로 확정하면 데이터가 바뀌고 커서가 아래로', () => {
        const ref = createRef<CtrlRef>();
        const onTx = vi.fn();
        mount(<Controlled ref={ref} initial={oneRow()} features={['rows']} onTx={onTx} />);
        act(() => ref.current!.h().focus());
        act(() => ref.current!.h().type('가', 0, 0));
        act(() => ref.current!.h().commit());
        expect(onTx.mock.calls.at(-1)![0].cells).toEqual([{ rowId: 'r1', key: 'a', value: '가' }]);
        expect(ref.current!.rows()[0].cells.a).toBe('가');
        expect(ref.current!.h().state().active).toEqual({ r: 1, c: 0 });
    });

    it('화살표·Tab·Enter·Shift+Enter 로 커서가 엑셀식으로 움직인다', () => {
        const ref = createRef<CtrlRef>();
        mount(<Controlled ref={ref} initial={[{ id: 'r1', cells: {} }, { id: 'r2', cells: {} }, { id: 'r3', cells: {} }]} features={[]} />);
        const h = () => ref.current!.h();
        act(() => h().focus());
        key('ArrowDown'); expect(h().state().active).toEqual({ r: 1, c: 0 });
        key('ArrowRight'); expect(h().state().active).toEqual({ r: 1, c: 1 });
        key('Tab', { shiftKey: true }); expect(h().state().active).toEqual({ r: 1, c: 0 });
        key('Enter'); expect(h().state().active).toEqual({ r: 2, c: 0 });       // 확정+아래
        key('Enter', { shiftKey: true }); expect(h().state().active).toEqual({ r: 1, c: 0 });  // 위
    });
});

describe('Table — 붙여넣기 정책', () => {
    it('append: 표보다 큰 붙여넣기는 행을 더한다', () => {
        const ref = createRef<CtrlRef>();
        const onTx = vi.fn();
        mount(<Controlled ref={ref} initial={oneRow()} features={['rows', 'paste-policy:append']} onTx={onTx} />);
        act(() => ref.current!.h().paste('가\t1\n나\t2', 0, 0));
        const tx = onTx.mock.calls.at(-1)![0] as TableTx;
        expect(tx.rows?.add?.[0]).toMatchObject({ at: 1, count: 1 });
        expect(ref.current!.rows()).toHaveLength(2);
        expect(ref.current!.rows()[1].cells).toMatchObject({ a: '나', b: '2' });
    });

    it('clip: 넘치는 줄은 버린다(행 안 는다)', () => {
        const ref = createRef<CtrlRef>();
        const onTx = vi.fn();
        mount(<Controlled ref={ref} initial={oneRow()} features={['paste-policy:clip']} onTx={onTx} />);
        act(() => ref.current!.h().paste('가\t1\n나\t2', 0, 0));
        const tx = onTx.mock.calls.at(-1)![0] as TableTx;
        expect(tx.rows).toBeUndefined();
        expect(ref.current!.rows()).toHaveLength(1);
        expect(ref.current!.rows()[0].cells).toMatchObject({ a: '가', b: '1' });
    });
});

describe('Table — 지우기·채우기', () => {
    it('범위 선택 후 Delete 가 그 범위를 한 트랜잭션으로 비운다', () => {
        const ref = createRef<CtrlRef>();
        const onTx = vi.fn();
        mount(<Controlled ref={ref} initial={[{ id: 'r1', cells: { a: 'x', b: 'y' } }]} features={[]} onTx={onTx} />);
        act(() => ref.current!.h().select(0, 0, 0, 1));
        key('Delete');
        const tx = onTx.mock.calls.at(-1)![0] as TableTx;
        expect(tx.source).toBe('clear');
        expect(ref.current!.rows()[0].cells).toEqual({ a: '', b: '' });
    });

    it('채우기(fill)는 맨 위 값을 아래로 복제한다', () => {
        const ref = createRef<CtrlRef>();
        mount(<Controlled ref={ref} initial={[{ id: 'r1', cells: { a: '씨앗' } }, { id: 'r2', cells: { a: '' } }, { id: 'r3', cells: { a: '' } }]} features={['fill']} />);
        act(() => ref.current!.h().select(0, 0, 0, 0));
        act(() => ref.current!.h().fill(2));
        expect(ref.current!.rows()[1].cells.a).toBe('씨앗');
        expect(ref.current!.rows()[2].cells.a).toBe('씨앗');
    });
});

describe('Table — 두 탭 동시(controlled 증명)', () => {
    it('같은 데이터를 두 Table 에 열고 한쪽을 고치면 다른 쪽도 바뀐다', () => {
        const aRef = createRef<TableHandle>();
        function TwoTabs() {
            const [rows, setRows] = useState(oneRow());
            const onCommit = (tx: TableTx) => setRows((r) => applyTx(r, tx));
            return (
                <>
                    <Table ref={aRef} columns={cols} rows={rows} features={['rows']} onCommit={onCommit} />
                    <Table columns={cols} rows={rows} features={['rows']} onCommit={onCommit} />
                </>
            );
        }
        mount(<TwoTabs />);
        act(() => aRef.current!.focus());
        act(() => aRef.current!.type('공유', 0, 0));
        act(() => aRef.current!.commit());
        const grids = document.querySelectorAll('[data-testid="table-grid"]');
        expect(grids).toHaveLength(2);
        expect(grids[1].textContent).toContain('공유');   // 둘째 탭에도 비친다
    });
});

describe('Table — 내장 되돌리기(소유자 없음 + history 모듈)', () => {
    it('⌘Z 로 편집을 되돌리고 ⌘⇧Z 로 다시 한다', () => {
        const ref = createRef<CtrlRef>();
        mount(<Controlled ref={ref} initial={[{ id: 'r1', cells: { a: '옛' } }]} features={['history']} />);
        const h = () => ref.current!.h();
        act(() => h().focus());
        act(() => h().type('새', 0, 0));
        act(() => h().commit());
        expect(ref.current!.rows()[0].cells.a).toBe('새');
        act(() => h().focus());
        key('z', { metaKey: true });            // undo
        expect(ref.current!.rows()[0].cells.a).toBe('옛');
        key('z', { metaKey: true, shiftKey: true });  // redo
        expect(ref.current!.rows()[0].cells.a).toBe('새');
    });
});

describe('TableApi — TSV 왕복', () => {
    it('parseClipboard ↔ toTsv', () => {
        const grid = tableApi.parseClipboard('a\tb\nc\td');
        expect(grid).toEqual([['a', 'b'], ['c', 'd']]);
        expect(tableApi.toTsv(grid)).toBe('a\tb\nc\td');
    });
    it('features.list 에 내장 다섯이 있다', () => {
        for (const id of ['rows', 'fill', 'paste-policy:append', 'paste-policy:clip', 'history']) {
            expect(tableApi.features.list()).toContain(id);
        }
    });
});
