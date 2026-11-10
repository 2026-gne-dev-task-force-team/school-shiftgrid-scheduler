// @vitest-environment jsdom
/**
 * 리치 셀 창구 — renderText 가 칸 글자를 그리고, 편집 중 `@` 가 mention.Picker 를 띄워 고른 노드를 토큰으로 넣는다.
 *   Picker 가 떠 있는 동안 편집창이 초점을 잃어도 확정하지 않는다.
 */
import { act, createRef, forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Table, type TableHandle } from './Table';
import type { TableColumn, TableProps, TableRow, TableTx } from './contracts/table';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cols: TableColumn[] = [{ key: 'a', title: 'A' }];

function FakePicker({ onPick, onClose }: { anchor: DOMRect; onPick(id: string): void; onClose(): void }) {
    return (
        <div data-fake-picker>
            {/* oxlint-disable-next-line react/forbid-elements -- 검산용 가짜 고르기 */}
            <button data-pick onClick={() => onPick('n1')}>고르기</button>
            {/* oxlint-disable-next-line react/forbid-elements -- 검산용 가짜 고르기 */}
            <button data-close onClick={onClose}>닫기</button>
        </div>
    );
}
const mention: TableProps['mention'] = { Picker: FakePicker, token: (id) => `⟦node:${id}⟧` };

interface CtrlRef { h: () => TableHandle; rows: () => TableRow[] }
const Owner = forwardRef<CtrlRef, { initial: TableRow[]; onTx?: (tx: TableTx) => void }>(function Owner({ initial, onTx }, ref) {
    const [rows, setRows] = useState(initial);
    const inner = useRef<TableHandle>(null);
    useImperativeHandle(ref, () => ({ h: () => inner.current!, rows: () => rows }), [rows]);
    return (
        <Table ref={inner} columns={cols} rows={rows} features={[]} mention={mention}
            renderText={(v) => <i data-rendered>{v.toUpperCase()}</i>}
            onCommit={(tx) => {
                onTx?.(tx);
                setRows((rs) => rs.map((r) => {
                    const c = tx.cells.find((x) => x.rowId === r.id);
                    return c ? { ...r, cells: { ...r.cells, [c.key]: c.value } } : r;
                }));
            }} />
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
afterEach(() => { if (root) act(() => root!.unmount()); hostEl?.remove(); root = null; hostEl = null; });

const setVal = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
function typeInto(el: HTMLTextAreaElement, v: string) {
    act(() => { setVal.call(el, v); el.selectionStart = el.selectionEnd = v.length; el.dispatchEvent(new Event('input', { bubbles: true })); });
}

describe('Table — 리치 셀 창구', () => {
    it('renderText 가 칸 글자를 그린다', () => {
        mount(<Owner initial={[{ id: 'r1', cells: { a: 'abc' } }]} />);
        expect(hostEl!.querySelector('[data-rendered]')?.textContent).toBe('ABC');
    });

    it('`@` → 고르기 → 토큰이 `@` 자리에 들어가고, 고르는 동안 blur 로 확정되지 않는다', () => {
        const onTx = vi.fn();
        const ref = createRef<CtrlRef>();
        mount(<Owner ref={ref} initial={[{ id: 'r1', cells: { a: '' } }]} onTx={onTx} />);
        act(() => ref.current!.h().focus());
        act(() => ref.current!.h().type('담당 ', 0, 0));
        const ta = hostEl!.querySelector('textarea[aria-label="A"]') as HTMLTextAreaElement;
        typeInto(ta, '담당 @');
        expect(document.querySelector('[data-fake-picker]')).toBeTruthy();
        act(() => { ta.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); ta.blur(); });
        expect(onTx).not.toHaveBeenCalled();
        act(() => { (document.querySelector('[data-pick]') as HTMLButtonElement).click(); });
        expect(document.querySelector('[data-fake-picker]')).toBeNull();
        expect((hostEl!.querySelector('textarea[aria-label="A"]') as HTMLTextAreaElement).value).toBe('담당 ⟦node:n1⟧');
        act(() => { hostEl!.querySelector('textarea[aria-label="A"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
        expect(ref.current!.rows()[0].cells.a).toBe('담당 ⟦node:n1⟧');
    });

    it('`@` 를 붙여넣기 등으로 여러 글자와 함께 넣으면 고르기가 안 뜬다', () => {
        const ref = createRef<CtrlRef>();
        mount(<Owner ref={ref} initial={[{ id: 'r1', cells: { a: '' } }]} />);
        act(() => ref.current!.h().focus());
        act(() => ref.current!.h().type('x', 0, 0));
        const ta = hostEl!.querySelector('textarea[aria-label="A"]') as HTMLTextAreaElement;
        typeInto(ta, 'x a@b.c');
        expect(document.querySelector('[data-fake-picker]')).toBeNull();
    });
});
