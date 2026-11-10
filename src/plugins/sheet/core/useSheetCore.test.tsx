// @vitest-environment jsdom
/**
 * 엔진 흡수 검산(이식) — 흡수한 범용 엔진이 레포 안에서 그대로 산다(「했다≠됐다」).
 *   옛 부품의 두 얼굴 테스트를 한 얼굴(엔진 손잡이)로 옮겼다: 키보드 이동·클램프·클릭 · 복붙·채우기·지우기 ·
 *   그리고 흡수하며 넓힌 commit(changes, source) 가 동작 종류를 싣는지.
 */
import { act, createRef, forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSheetCore } from './useSheetCore';
import type { CellChange, CommitSource, SheetCoreAdapter, SheetCoreHandle } from './types';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Rec { changes: CellChange[]; source: CommitSource }

const Harness = forwardRef<SheetCoreHandle, { rows: number; cols: number; data: Map<string, string>; onCommit: (r: Rec) => void }>(
    function Harness({ rows, cols, data, onCommit }, ref) {
        const adapter = useMemo<SheetCoreAdapter>(() => ({
            rowCount: rows,
            dataRowCount: rows,
            colCount: cols,
            getText: (r, c) => data.get(`${r}:${c}`) ?? '',
            editable: () => true,
            cellKind: () => 'edit',
            editInitial: (r, c, typed) => (typed != null ? typed : data.get(`${r}:${c}`) ?? ''),
            commit: (changes, source) => {
                for (const ch of changes) data.set(`${ch.r}:${ch.c}`, ch.text);
                onCommit({ changes, source });
            },
        }), [rows, cols, data, onCommit]);
        const core = useSheetCore(adapter);
        useImperativeHandle(ref, () => core.handle, [core.handle]);
        return <div ref={core.containerRef} tabIndex={0} onFocus={core.onFocus} onBlur={core.onBlur} />;
    },
);

let root: Root | null = null;
let host: HTMLDivElement | null = null;
function mount(rows: number, cols: number) {
    const onCommit = vi.fn();
    const data = new Map<string, string>();
    const ref = createRef<SheetCoreHandle>();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => { root!.render(<Harness ref={ref} rows={rows} cols={cols} data={data} onCommit={onCommit} />); });
    return { onCommit, data, h: () => ref.current! };
}
afterEach(() => {
    if (root) act(() => root!.unmount());
    host?.remove();
    root = null; host = null;
});
const last = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.at(-1)![0] as Rec;

describe('엔진 — 키보드 이동·클램프·클릭', () => {
    it('화살표·Tab 으로 좌표를 밟고 끝에서 클램프한다', () => {
        const { h } = mount(3, 2);
        act(() => h().focus());
        expect(h().state().active).toEqual({ r: 0, c: 0 });
        act(() => h().press('ArrowDown'));
        expect(h().state().active).toEqual({ r: 1, c: 0 });
        act(() => h().press('ArrowRight'));
        expect(h().state().active).toEqual({ r: 1, c: 1 });
        act(() => h().press('ArrowRight')); // 오른쪽 끝 — 더 못 간다
        expect(h().state().active).toEqual({ r: 1, c: 1 });
        act(() => h().press('ArrowUp'));
        expect(h().state().active).toEqual({ r: 0, c: 1 });
        act(() => h().press('ArrowDown'));
        act(() => h().press('ArrowDown'));
        act(() => h().press('ArrowDown')); // 아래 끝(r=2) 클램프
        expect(h().state().active).toEqual({ r: 2, c: 1 });
    });

    it('클릭(선택)으로 active 가 그 칸으로 간다', () => {
        const { h } = mount(3, 2);
        act(() => h().click(2, 1));
        expect(h().state().active).toEqual({ r: 2, c: 1 });
    });
});

describe('엔진 — 편집 확정은 source=edit 로 올라간다', () => {
    it('글자 입력 뒤 commit 이 그 칸을 edit 소스로 올린다', () => {
        const { onCommit, h } = mount(3, 2);
        act(() => h().type('가나', 0, 0));
        act(() => h().commit());
        const rec = last(onCommit);
        expect(rec.source).toBe('edit');
        expect(rec.changes).toEqual([{ r: 0, c: 0, text: '가나' }]);
    });
});

describe('엔진 — 복붙·채우기·지우기(각 source)', () => {
    it('붙여넣기는 TSV 를 범위대로 올린다(source=paste)', () => {
        const { onCommit, h } = mount(3, 2);
        act(() => h().paste('가\t1\n나\t2', 0, 0));
        const rec = last(onCommit);
        expect(rec.source).toBe('paste');
        expect(rec.changes).toEqual([
            { r: 0, c: 0, text: '가' }, { r: 0, c: 1, text: '1' },
            { r: 1, c: 0, text: '나' }, { r: 1, c: 1, text: '2' },
        ]);
    });

    it('채우기는 맨 위 값을 아래로 복제한다(source=fill)', () => {
        const { onCommit, h, data } = mount(3, 2);
        data.set('0:0', '씨앗');
        act(() => h().select(0, 0, 0, 0));
        act(() => h().fill(2));
        const rec = last(onCommit);
        expect(rec.source).toBe('fill');
        expect(rec.changes).toEqual([{ r: 1, c: 0, text: '씨앗' }, { r: 2, c: 0, text: '씨앗' }]);
    });

    it('지우기는 선택 범위를 빈 글자로 올린다(source=clear)', () => {
        const { onCommit, h } = mount(3, 2);
        act(() => h().select(0, 0, 1, 1));
        act(() => h().clear());
        const rec = last(onCommit);
        expect(rec.source).toBe('clear');
        expect(rec.changes).toHaveLength(4);
        expect(rec.changes.every((c) => c.text === '')).toBe(true);
    });

    it('복사는 선택 범위를 TSV 로 돌려준다', () => {
        const { h, data } = mount(2, 2);
        data.set('0:0', 'a'); data.set('0:1', 'b'); data.set('1:0', 'c'); data.set('1:1', 'd');
        act(() => h().select(0, 0, 1, 1));
        let tsv = '';
        act(() => { tsv = h().copy(); });
        expect(tsv).toBe('a\tb\nc\td');
    });
});

// ── 판 W-S — 엑셀 관례 보강 ──────────────────────────────────
const keyOf = (key: string, o: KeyboardEventInit = {}) =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...o }));

/** 붙여넣기로 행이 늘어나는 표(Table 의 pasteOverflow=append 흉내). */
const GrowHarness = forwardRef<SheetCoreHandle, object>(function GrowHarness(_p, ref) {
    const [rows, setRows] = useState(3);
    const adapter = useMemo<SheetCoreAdapter>(() => ({
        rowCount: rows, dataRowCount: rows, colCount: 3, growCols: false,
        getText: () => '', editable: () => true, cellKind: () => 'edit', editInitial: () => '',
        commit: (changes) => setRows((n) => Math.max(n, ...changes.map((c) => c.r + 1))),
    }), [rows]);
    const core = useSheetCore(adapter);
    useImperativeHandle(ref, () => core.handle, [core.handle]);
    return <div ref={core.containerRef} tabIndex={0} onFocus={core.onFocus} onBlur={core.onBlur} />;
});

describe('판 W-S — 잘라내기·붙인 범위·Home/End/⌘방향·PageUp/Down', () => {
    it('⌘X 는 복사하고 범위를 지운다(commit 한 번, source=clear)', () => {
        const { onCommit, h, data } = mount(3, 2);
        data.set('0:0', 'a'); data.set('0:1', 'b');
        act(() => h().select(0, 0, 0, 1));
        onCommit.mockClear();
        act(() => { keyOf('x', { metaKey: true }); });
        expect(onCommit).toHaveBeenCalledTimes(1);
        const rec = last(onCommit);
        expect(rec.source).toBe('clear');
        expect(rec.changes).toEqual([{ r: 0, c: 0, text: '' }, { r: 0, c: 1, text: '' }]);
    });

    it('붙인 범위 전체가 선택된다(행이 늘어나도 옛 행 수로 안 잘린다)', () => {
        const ref = createRef<SheetCoreHandle>();
        host = document.createElement('div'); document.body.appendChild(host);
        root = createRoot(host);
        act(() => { root!.render(<GrowHarness ref={ref} />); });
        const tsv = Array.from({ length: 6 }, () => 'x\ty\tz').join('\n');
        act(() => ref.current!.paste(tsv, 0, 0));
        const st = ref.current!.state();
        expect(st.anchor).toEqual({ r: 0, c: 0 });
        expect(st.active).toEqual({ r: 5, c: 2 });
        expect(st.rows).toBe(6);
    });

    it('표가 안 늘면 붙인 선택은 표 안으로 접힌다', () => {
        const { h } = mount(3, 2);
        act(() => h().paste('a\tb\nc\td\ne\tf\ng\th\ni\tj', 0, 0));
        expect(h().state().active).toEqual({ r: 2, c: 1 });
    });

    it('Home/End 는 행 처음·끝, ⌘방향·⌘Home/End 는 표 끝', () => {
        const { h } = mount(5, 4);
        act(() => { h().click(2, 2); });
        act(() => { keyOf('Home'); });
        expect(h().state().active).toEqual({ r: 2, c: 0 });
        act(() => { keyOf('End'); });
        expect(h().state().active).toEqual({ r: 2, c: 3 });
        act(() => { keyOf('ArrowDown', { metaKey: true }); });
        expect(h().state().active).toEqual({ r: 4, c: 3 });
        act(() => { keyOf('ArrowUp', { ctrlKey: true }); });
        expect(h().state().active).toEqual({ r: 0, c: 3 });
        act(() => { keyOf('End', { metaKey: true }); });
        expect(h().state().active).toEqual({ r: 4, c: 3 });
        act(() => { keyOf('Home', { metaKey: true }); });
        expect(h().state().active).toEqual({ r: 0, c: 0 });
        act(() => { keyOf('ArrowRight', { metaKey: true, shiftKey: true }); });
        expect(h().state().anchor).toEqual({ r: 0, c: 0 });
        expect(h().state().active).toEqual({ r: 0, c: 1 + 2 });
    });

    it('PageDown/PageUp 은 한 쪽(jsdom 은 10행)씩 움직이고 끝에서 클램프한다', () => {
        const { h } = mount(25, 2);
        act(() => { h().click(0, 0); });
        act(() => { keyOf('PageDown'); });
        expect(h().state().active.r).toBe(10);
        act(() => { keyOf('PageDown'); });
        act(() => { keyOf('PageDown'); });
        expect(h().state().active.r).toBe(24);
        act(() => { keyOf('PageUp'); });
        expect(h().state().active.r).toBe(14);
    });
});
