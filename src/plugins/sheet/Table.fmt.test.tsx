// @vitest-environment jsdom
/** 칸 서식(굵게·정렬·배경색) — 범위 적용 · ⌘B · ⌘Z · 옛 자료(서식 칸 없음) 읽기. 소유자는 실제 applyTx. */
import { act, createRef, forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Table, type TableHandle } from './Table';
import { applyTx, type TableDoc } from './nodes';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface CtrlRef { h: () => TableHandle; doc: () => TableDoc }
const Owner = forwardRef<CtrlRef, { init: TableDoc }>(function Owner({ init }, ref) {
    const [doc, setDoc] = useState(init);
    const inner = useRef<TableHandle>(null);
    useImperativeHandle(ref, () => ({ h: () => inner.current!, doc: () => doc }), [doc]);
    return <Table ref={inner} columns={doc.cols} rows={doc.rows} merges={doc.merges} cellFmt={doc.cellFmt ?? {}}
        onCommit={(tx) => setDoc((d) => applyTx(d, tx))} />;
});

let root: Root | null = null;
let hostEl: HTMLDivElement | null = null;
afterEach(() => {
    if (root) act(() => root!.unmount());
    hostEl?.remove(); root = null; hostEl = null;
    document.querySelectorAll('[role="menu"]').forEach((n) => n.remove());
});
function mount(ui: React.ReactElement) {
    hostEl = document.createElement('div'); document.body.appendChild(hostEl);
    root = createRoot(hostEl); act(() => { root!.render(ui); });
}
// 옛 자료 — cellFmt 칸이 아예 없다
const old = (): TableDoc => ({
    cols: [{ key: 'a', title: 'A' }, { key: 'b', title: 'B' }],
    rows: [{ id: 'r0', cells: { a: '1', b: '2' } }, { id: 'r1', cells: { a: '3', b: '4' } }],
    merges: [],
});
const td = (r: number, c: number) => document.querySelector<HTMLElement>(`[data-rc="${r}:${c}"]`)!;
const key = (k: string, o: KeyboardEventInit = {}) =>
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...o })); });
function menu(r: number, c: number, label: string, sub?: string) {
    act(() => { td(r, c).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); });
    const find = (l: string) => [...document.querySelectorAll('button,[role="menuitem"]')].find((x) => x.textContent?.includes(l));
    const b = find(label);
    if (!b) throw new Error(`메뉴 못 찾음: ${label}`);
    act(() => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    if (sub) {
        const s = find(sub);
        if (!s) throw new Error(`하위 메뉴 못 찾음: ${sub}`);
        act(() => { s.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    }
}

describe('칸 서식', () => {
    it('옛 자료(서식 칸 없음)가 그대로 열린다', () => {
        const ref = createRef<CtrlRef>();
        mount(<Owner ref={ref} init={old()} />);
        expect(td(0, 0).className).not.toContain('font-bold');
        expect(ref.current!.doc().cellFmt).toBeUndefined();
    });

    it('⌘B 는 고른 범위를 굵게 · 다시 누르면 풀고 · ⌘Z 로 되돌린다', () => {
        const ref = createRef<CtrlRef>();
        mount(<Owner ref={ref} init={old()} />);
        act(() => ref.current!.h().focus());
        act(() => ref.current!.h().select(0, 0, 1, 0));
        key('b', { metaKey: true });
        expect(td(0, 0).className).toContain('font-bold');
        expect(td(1, 0).className).toContain('font-bold');
        expect(td(0, 1).className).not.toContain('font-bold');
        key('z', { metaKey: true });
        expect(td(0, 0).className).not.toContain('font-bold');
        key('z', { metaKey: true, shiftKey: true });
        expect(td(1, 0).className).toContain('font-bold');
        key('b', { metaKey: true });
        expect(td(0, 0).className).not.toContain('font-bold');
        expect(ref.current!.doc().cellFmt).toEqual({});
    });

    it('우클릭 메뉴: 정렬·칸 색이 범위에 걸리고 저장 문서에 남는다', () => {
        const ref = createRef<CtrlRef>();
        mount(<Owner ref={ref} init={old()} />);
        act(() => ref.current!.h().select(0, 0, 0, 1));
        menu(0, 0, '가운데 정렬');
        expect(td(0, 0).className).toContain('text-center');
        expect(td(0, 1).className).toContain('text-center');
        menu(0, 0, '칸 색', '초록색');
        expect(td(0, 1).className).toContain('bg-ok/15');
        expect(ref.current!.doc().cellFmt).toEqual({
            'r0|a': { align: 'center', tone: 'ok' }, 'r0|b': { align: 'center', tone: 'ok' },
        });
        act(() => ref.current!.h().focus());
        key('z', { metaKey: true });
        expect(td(0, 1).className).not.toContain('bg-ok/15');
    });

    it('앱 안 복사 → 붙여넣기는 서식도 같이 · 바깥 글자는 서식 없이(기존 서식 그대로)', () => {
        const ref = createRef<CtrlRef>();
        mount(<Owner ref={ref} init={old()} />);
        act(() => ref.current!.h().select(0, 0, 0, 0));
        menu(0, 0, '칸 색', '초록색');
        act(() => ref.current!.h().focus());
        key('b', { metaKey: true });
        let tsv = '';
        act(() => { tsv = ref.current!.h().copy(); });
        act(() => ref.current!.h().paste(tsv, 1, 1));
        expect(td(1, 1).className).toContain('bg-ok/15');
        expect(td(1, 1).className).toContain('font-bold');
        act(() => ref.current!.h().paste('바깥', 0, 1));
        expect(td(0, 1).className).not.toContain('bg-ok/15');
        expect(td(0, 0).className).toContain('bg-ok/15');
    });

    it('선택 밖 칸을 우클릭해 서식을 고르면 그 칸에 걸린다(옛 선택이 아니라)', () => {
        const ref = createRef<CtrlRef>();
        mount(<Owner ref={ref} init={old()} />);
        act(() => ref.current!.h().select(0, 0, 0, 0));
        menu(1, 1, '칸 색', '초록색');
        expect(td(1, 1).className).toContain('bg-ok/15');
        expect(td(0, 0).className).not.toContain('bg-ok/15');
    });
});
