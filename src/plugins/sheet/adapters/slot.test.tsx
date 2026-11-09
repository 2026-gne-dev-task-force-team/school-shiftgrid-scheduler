// @vitest-environment jsdom
/**
 * 「갈아 끼우기」 검산 — 간이 표(TableSlotProps)를 쓰던 손님(명단 꼴)이 이 편집기로 바뀌어도
 *   편집·행 추가(붙여넣기 넘침)·삭제가 손님의 낱개 콜백으로 온전히 되돌아가는지. people 폴더는 안 건드린다.
 */
import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Table, type TableHandle } from '../Table';
import { slotToTableProps, type TableSlotProps } from './slot';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let hostEl: HTMLDivElement | null = null;
function mount(ui: React.ReactElement) {
    hostEl = document.createElement('div');
    document.body.appendChild(hostEl);
    root = createRoot(hostEl);
    act(() => { root!.render(ui); });
}
afterEach(() => { if (root) act(() => root!.unmount()); hostEl?.remove(); root = null; hostEl = null; });

/** 명단 꼴 손님 — 모든 콜백을 감시한다(onAddRowWith·onMoveRowTo 포함). */
function makeSlot(over: Partial<TableSlotProps> = {}): TableSlotProps {
    return {
        columns: [{ key: 'name', title: '이름' }, { key: 'memo', title: '메모' }],
        rows: [{ id: 'p1', cells: { name: '김', memo: '' } }],
        onCellChange: vi.fn(),
        onAddRow: vi.fn(),
        onDeleteRow: vi.fn(),
        onMoveRow: vi.fn(),
        onPaste: vi.fn(),
        onAddRowWith: vi.fn(),
        onMoveRowTo: vi.fn(),
        ...over,
    };
}

describe('표 자리 어댑터 — 손님 콜백으로 되돌린다', () => {
    it('칸 편집이 onCellChange 로 온다', () => {
        const slot = makeSlot();
        const ref = createRef<TableHandle>();
        mount(<Table ref={ref} {...slotToTableProps(slot)} />);
        act(() => ref.current!.focus());
        act(() => ref.current!.type('이', 0, 0));
        act(() => ref.current!.commit());
        expect(slot.onCellChange).toHaveBeenCalledWith('p1', 'name', '이');
    });

    it('붙여넣기 넘침이 onAddRowWith 로 값까지 온다(있을 때)', () => {
        const slot = makeSlot();
        const ref = createRef<TableHandle>();
        mount(<Table ref={ref} {...slotToTableProps(slot)} />);
        act(() => ref.current!.paste('가\t메모가\n나\t메모나', 0, 0));
        // 첫 줄은 기존 행(onCellChange), 둘째 줄은 새 행(onAddRowWith)
        expect(slot.onCellChange).toHaveBeenCalledWith('p1', 'name', '가');
        expect(slot.onAddRowWith).toHaveBeenCalledWith({ name: '나', memo: '메모나' });
        expect(slot.onAddRow).not.toHaveBeenCalled();
    });

    it('onAddRowWith 가 없으면 onAddRow 로 떨어진다(값은 못 싣는다)', () => {
        const slot = makeSlot({ onAddRowWith: undefined });
        const ref = createRef<TableHandle>();
        mount(<Table ref={ref} {...slotToTableProps(slot)} />);
        act(() => ref.current!.paste('가\t1\n나\t2', 0, 0));
        expect(slot.onAddRow).toHaveBeenCalledTimes(1);
    });

    it('행 삭제가 onDeleteRow 로 온다', () => {
        const slot = makeSlot();
        const props = slotToTableProps(slot);
        mount(<Table {...props} />);
        // v3 노션식: 행 손잡이를 우클릭 → 「행 삭제」.
        const handle = hostEl!.querySelector<HTMLElement>('[data-testid="row-handle"]')!;
        act(() => { handle.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 5, clientY: 5 })); });
        const del = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('행 삭제'))!;
        act(() => { del.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect(slot.onDeleteRow).toHaveBeenCalledWith('p1');
    });
});
