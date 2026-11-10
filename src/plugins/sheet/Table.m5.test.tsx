// @vitest-environment jsdom
/**
 * Table M5(넘버스 얼굴) 검산 — 합계 바 · 둥근 추가 단추 끌기 · 참조 탭 포커스 · 머리/꼬리 채우기 제외 · 넘버스 키.
 *   소유자는 실제 표 노드 다리의 applyTx(nodes.ts) 를 그대로 쓴다.
 */
import { setPlatform } from '../../pane-ui-system/platform-keys';
import { act, createRef, forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Table, type TableHandle } from './Table';
import type { TableTx } from './contracts/table';
import { applyTx, type TableDoc } from './nodes';
import { QuickCalcStatus } from './views/QuickCalcStatus';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface CtrlRef { h: () => TableHandle; doc: () => TableDoc }
const Owner = forwardRef<CtrlRef, { init: TableDoc; features?: string[]; onTx?: (tx: TableTx) => void }>(
    function Owner({ init, features, onTx }, ref) {
        const [doc, setDoc] = useState(init);
        const inner = useRef<TableHandle>(null);
        useImperativeHandle(ref, () => ({ h: () => inner.current!, doc: () => doc }), [doc]);
        return (
            <Table ref={inner} columns={doc.cols} rows={doc.rows} merges={doc.merges} features={features}
                headerRow={doc.headerRow} footerRow={doc.footerRow} hideColHeader toolbar
                onCommit={(tx) => { onTx?.(tx); setDoc((d) => applyTx(d, tx)); }} />
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
});

/** 머리 1 · 본문 2 · 꼬리 1 — 숫자 표. */
const doc4 = (over: Partial<TableDoc> = {}): TableDoc => ({
    cols: [{ key: 'a', title: 'A' }, { key: 'b', title: 'B' }],
    rows: [
        { id: 'h', cells: { a: '100', b: '200' } },
        { id: 'r1', cells: { a: '1', b: '2' } },
        { id: 'r2', cells: { a: '3', b: '4' } },
        { id: 'f', cells: { a: '1000', b: '' } },
    ],
    merges: [], headerRow: true, footerRow: true, ...over,
});
const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const key = (k: string, o: KeyboardEventInit = {}) =>
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...o })); });

describe('Table M5 — 넘버스 얼굴', () => {
    it('합계 바는 고른 범위에서 머리·꼬리 행을 빼고 합·평균을 낸다', () => {
        const ref = createRef<CtrlRef>();
        mount(<><Owner ref={ref} init={doc4()} /><QuickCalcStatus /></>);   // 합계는 상태바 쪽에 뜬다
        act(() => ref.current!.h().focus());
        act(() => ref.current!.h().select(0, 0, 3, 1));   // 표 전체
        const bar = q('quick-calc')!.textContent!;
        expect(bar).toContain('합계 10');                 // 1+2+3+4 (머리 100·200, 꼬리 1000 제외)
        expect(bar).toContain('평균 2.5');
        expect(bar).toContain('개수 4');
    });

    it('행 추가 단추를 아래로 끌면 5개가 tx 하나로 붙고, ⌘Z 한 번에 다 빠진다', () => {
        const ref = createRef<CtrlRef>();
        const onTx = vi.fn();
        mount(<Owner ref={ref} init={doc4({ footerRow: false })} onTx={onTx} />);
        const btn = q('add-row')!;
        act(() => { btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientY: 100 })); });
        act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientY: 100 + 36 * 4 + 2 })); });
        act(() => { window.dispatchEvent(new MouseEvent('mouseup', { clientY: 100 + 36 * 4 + 2 })); });
        act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });   // 뒤따르는 click 은 삼킨다
        expect(onTx).toHaveBeenCalledTimes(1);
        expect(ref.current!.doc().rows).toHaveLength(9);
        act(() => ref.current!.h().focus());
        key('z', { metaKey: true });
        expect(ref.current!.doc().rows).toHaveLength(4);
    });

    it('참조 탭·표 손잡이는 포커스가 있을 때만 보인다', () => {
        const ref = createRef<CtrlRef>();
        mount(<Owner ref={ref} init={doc4()} />);
        expect(q('table-handle')!.className).toContain('opacity-0');
        act(() => ref.current!.h().focus());
        expect(q('table-handle')!.className).toContain('opacity-100');
        expect(q('col-handle')!.textContent).toContain('A');
        act(() => { (document.activeElement as HTMLElement).blur(); });
        expect(q('table-handle')!.className).toContain('opacity-0');
    });

    it('표 손잡이를 누르면 표 전체가 골라진다', () => {
        const ref = createRef<CtrlRef>();
        mount(<Owner ref={ref} init={doc4()} />);
        act(() => { q('table-handle')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        const st = ref.current!.h().state();
        expect(st.anchor).toEqual({ r: 0, c: 0 });
        expect(st.active).toEqual({ r: 3, c: 1 });
    });

    it('채우기는 꼬리 행을 건드리지 않는다', () => {
        const ref = createRef<CtrlRef>();
        mount(<Owner ref={ref} init={doc4()} />);
        act(() => ref.current!.h().select(1, 0, 1, 0));
        act(() => ref.current!.h().fill(3));
        const rows = ref.current!.doc().rows;
        expect(rows[2].cells.a).toBe('1');
        expect(rows[3].cells.a).toBe('1000');   // 꼬리 그대로
    });

    it('머리 행은 채우기 씨앗이 못 된다', () => {
        const ref = createRef<CtrlRef>();
        mount(<Owner ref={ref} init={doc4({ footerRow: false })} />);
        act(() => ref.current!.h().select(0, 0, 0, 0));
        act(() => ref.current!.h().fill(2));
        expect(ref.current!.doc().rows[1].cells.a).toBe('1');
    });

    it('Alt+↓ 는 아래에 행을, Alt+→ 는 오른쪽에 열을 넣는다', () => {
        const ref = createRef<CtrlRef>();
        mount(<Owner ref={ref} init={doc4()} />);
        act(() => ref.current!.h().click(1, 0));
        key('ArrowDown', { altKey: true });
        expect(ref.current!.doc().rows.map((r) => r.id).slice(0, 2)).toEqual(['h', 'r1']);
        expect(ref.current!.doc().rows).toHaveLength(5);
        expect(ref.current!.doc().rows[2].cells).toEqual({});
        key('ArrowRight', { altKey: true });
        expect(ref.current!.doc().cols).toHaveLength(3);
    });

    it('M5c — 끌어 바꾼 열 너비·행 높이가 문서에 남고, ⌘Z 로 원래(없음)로 돌아간다', () => {
        const ref = createRef<CtrlRef>();
        mount(<Owner ref={ref} init={doc4()} features={['rows', 'axis-edit', 'col-resize', 'row-weight', 'history']} />);
        const drag = (el: Element, from: MouseEventInit, to: MouseEventInit) => {
            act(() => { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, ...from })); });
            act(() => { window.dispatchEvent(new MouseEvent('mousemove', to)); });
            act(() => { window.dispatchEvent(new MouseEvent('mouseup', to)); });
        };
        drag(q('col-resize')!, { clientX: 100 }, { clientX: 160 });
        expect(ref.current!.doc().cols[0].width).toBe(180);            // 120 + 60
        drag(q('row-weight')!, { clientY: 100 }, { clientY: 121 });
        expect(ref.current!.doc().rows[0].weight).toBe(45);            // 24 + 21 → 5 단위 스냅
        act(() => ref.current!.h().focus());
        key('z', { metaKey: true });
        key('z', { metaKey: true });
        expect(ref.current!.doc().rows[0].weight).toBe(24);
        expect(ref.current!.doc().cols[0].width).toBeUndefined();      // 0 이 아니라 「없음」
    });

    it('맨 아랫줄에서 Enter 는 행을 붙이지 않고 편집을 시작한다', () => {
        const ref = createRef<CtrlRef>();
        mount(<Owner ref={ref} init={doc4({ footerRow: false })} />);
        act(() => ref.current!.h().click(3, 1));
        key('Enter');
        expect(ref.current!.doc().rows).toHaveLength(4);
        expect(ref.current!.h().state().editing).toBe(true);
    });

    it('#23 칸 선택 → Enter(편집) → 글자 입력 → Esc 를 모든 칸에서 해도 행 수는 그대로', () => {
        for (const r of [0, 1, 2, 3]) {
            const ref = createRef<CtrlRef>();
            const onTx = vi.fn();
            mount(<Owner ref={ref} init={doc4()} onTx={onTx} />);
            act(() => ref.current!.h().click(r, 1));
            key('Enter');
            expect(ref.current!.h().state().editing).toBe(true);
            const input = document.querySelector<HTMLTextAreaElement>('textarea[aria-label]')!;
            const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
            act(() => { setter.call(input, 'x'); input.dispatchEvent(new Event('input', { bubbles: true })); });
            act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
            expect(ref.current!.h().state().editing).toBe(false);
            expect(ref.current!.doc().rows).toHaveLength(4);
            expect(onTx).not.toHaveBeenCalled();
            act(() => root!.unmount()); hostEl?.remove(); root = null; hostEl = null;
        }
    });

    it('#4 30열 붙여넣기 → 열이 30개로 늘어 전부 들어가고 ⌘Z 한 번에 원상복귀', () => {
        const ref = createRef<CtrlRef>();
        mount(<Owner ref={ref} init={doc4({ footerRow: false, headerRow: false })} features={['rows', 'axis-edit', 'paste-policy:append', 'history']} />);
        act(() => ref.current!.h().click(0, 0));
        const line = Array.from({ length: 30 }, (_, i) => `v${i}`).join('\t');
        const paste = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
        Object.defineProperty(paste, 'clipboardData', { value: { getData: () => `${line}\n${line}` } });
        act(() => { document.dispatchEvent(paste); });
        const d = ref.current!.doc();
        expect(d.cols).toHaveLength(30);
        expect(d.rows[0].cells[d.cols[29].key]).toBe('v29');
        expect(d.rows[1].cells[d.cols[29].key]).toBe('v29');
        key('z', { metaKey: true });
        expect(ref.current!.doc().cols).toHaveLength(2);
        expect(ref.current!.doc().rows[0].cells.a).toBe('100');
    });

    it('⌘V keydown 은 막지 않는다(막으면 브라우저가 paste 이벤트를 안 쏜다) · paste 이벤트로 칸이 채워진다', () => {
        setPlatform('win');   // Ctrl 이 Mod — 윈도우 흉내(W14)
        const ref = createRef<CtrlRef>();
        mount(<Owner ref={ref} init={doc4({ footerRow: false })} />);
        act(() => ref.current!.h().click(1, 0));
        const ev = new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, cancelable: true });
        act(() => { document.dispatchEvent(ev); });
        expect(ev.defaultPrevented).toBe(false);
        const paste = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
        Object.defineProperty(paste, 'clipboardData', { value: { getData: () => '7\t8' } });
        act(() => { document.dispatchEvent(paste); });
        expect(ref.current!.doc().rows[1].cells).toEqual({ a: '7', b: '8' });
    });

    it('M5d 도구 막대 — 아래에 행 · 고른 행 지우기(tx 하나) · 합치기는 범위일 때만', () => {
        const ref = createRef<CtrlRef>();
        const onTx = vi.fn();
        mount(<Owner ref={ref} init={doc4({ footerRow: false })} onTx={onTx} />);
        const click = (id: string) => act(() => { q(`tool-${id}`)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        act(() => ref.current!.h().click(1, 0));
        expect((q('tool-merge') as HTMLButtonElement).disabled).toBe(true);
        click('row-below');
        expect(ref.current!.doc().rows.map((r) => r.id).slice(0, 2)).toEqual(['h', 'r1']);
        expect(ref.current!.doc().rows).toHaveLength(5);
        act(() => ref.current!.h().select(1, 0, 2, 1));
        expect((q('tool-merge') as HTMLButtonElement).disabled).toBe(false);
        onTx.mockClear();
        click('row-del');
        expect(onTx).toHaveBeenCalledTimes(1);
        expect(ref.current!.doc().rows.map((r) => r.id)).toEqual(['h', 'r2', 'f']);
    });
});

describe('판 W-S — 병합 활성칸 · 가로 스크롤 따라가기', () => {
    it('병합 직후 활성칸은 병합 칸 좌상(data-active 유지)', () => {
        const ref = createRef<CtrlRef>();
        mount(<Owner ref={ref} init={doc4({ footerRow: false })} />);
        act(() => ref.current!.h().select(1, 0, 2, 1));
        act(() => { q('tool-merge')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        const act1 = document.querySelectorAll('[data-active="true"]');
        expect(act1).toHaveLength(1);
        expect(act1[0].getAttribute('data-rc')).toBe('1:0');
    });

    it('활성칸이 가로로 화면 밖이면 scrollLeft 를 옮겨 보이게 한다', () => {
        const ref = createRef<CtrlRef>();
        const orig = Element.prototype.getBoundingClientRect;
        const cw = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return (this as HTMLElement).dataset.testid === 'table-grid' ? 300 : 0; } });
        Element.prototype.getBoundingClientRect = function (this: Element) {
            const rc = this.getAttribute('data-rc');
            const sl = (document.querySelector('[data-testid="table-grid"]') as HTMLElement | null)?.scrollLeft ?? 0;
            if (rc) { const c = Number(rc.split(':')[1]); return { left: c * 100 - sl, right: c * 100 + 100 - sl, top: 0, bottom: 20, width: 100, height: 20, x: 0, y: 0, toJSON() {} } as DOMRect; }
            return { left: 0, right: 300, top: 0, bottom: 100, width: 300, height: 100, x: 0, y: 0, toJSON() {} } as DOMRect;
        };
        try {
            const cols = Array.from({ length: 8 }, (_, i) => ({ key: `k${i}`, title: `K${i}` }));
            mount(<Owner ref={ref} init={{ cols, rows: [{ id: 'r', cells: {} }], merges: [], headerRow: false, footerRow: false } as TableDoc} />);
            act(() => ref.current!.h().click(0, 0));
            for (let i = 0; i < 6; i++) key('ArrowRight');
            const box = document.querySelector<HTMLElement>('[data-testid="table-grid"]')!;
            expect(box.scrollLeft).toBe(6 * 100 + 100 - 300);   // 활성 칸(c=6)의 오른쪽 끝이 보이는 자리
            for (let i = 0; i < 6; i++) key('ArrowLeft');
            expect(box.scrollLeft).toBe(0);
        } finally {
            Element.prototype.getBoundingClientRect = orig;
            if (cw) Object.defineProperty(HTMLElement.prototype, 'clientWidth', cw); else delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
        }
    });
});
