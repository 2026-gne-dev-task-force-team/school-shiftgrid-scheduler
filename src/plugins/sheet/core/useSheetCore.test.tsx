// @vitest-environment jsdom
/**
 * 엔진 흡수 검산(이식) — 흡수한 범용 엔진이 레포 안에서 그대로 산다(「했다≠됐다」).
 *   옛 부품의 두 얼굴 테스트를 한 얼굴(엔진 손잡이)로 옮겼다: 키보드 이동·클램프·클릭 · 복붙·채우기·지우기 ·
 *   그리고 흡수하며 넓힌 commit(changes, source) 가 동작 종류를 싣는지.
 */
import { act, createRef, forwardRef, useImperativeHandle, useMemo } from 'react';
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
