// @vitest-environment jsdom
/**
 * Q8 — 컬렉션 표: 행을 다른 행 위로 끌어 놓으면 하위로(가운데) · 위·아래 가장자리는 순서 · 「하위로」 단추는 없다.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecordView } from '../RecordView';
import type { RecordField, RecordTree } from '../contracts/collection';
import { rowDropZone } from '../logic';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let hostEl: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); hostEl?.remove(); root = null; hostEl = null; document.body.innerHTML = ''; });
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;

type R = { id: string; t: string; p: string | null };
const FIELDS: RecordField[] = [{ key: 't', label: '이름', type: 'text', locked: true }];
const rows: R[] = [
    { id: 'a', t: '가', p: null }, { id: 'b', t: '나', p: 'a' }, { id: 'c', t: '다', p: null }, { id: 'd', t: '라', p: null },
];

function setup(treeOver: Partial<RecordTree<R>> = {}) {
    const onReorder = vi.fn();
    const tree: RecordTree<R> = {
        parentOf: (r) => r.p, collapsed: () => false, onToggleCollapse: vi.fn(), onIndent: vi.fn(), onOutdent: vi.fn(), onMoveUnder: vi.fn(), ...treeOver,
    };
    hostEl = document.createElement('div');
    document.body.appendChild(hostEl);
    root = createRoot(hostEl);
    act(() => { root!.render(<RecordView<R> fields={FIELDS} records={rows} getId={(r) => r.id} viewKey="t.q8" titleKey="t" tree={tree} onReorder={onReorder} />); });
    return { tree, onReorder };
}

/** 포인터 이벤트 — useDragLeaf(마우스 경로)가 먹는 것. jsdom 엔 PointerEvent 가 없어 MouseEvent 에 pointerId·pointerType 을 단다 */
function ptr(el: Element, type: string, y: number) {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 0, clientY: y, button: 0 });
    Object.defineProperty(e, 'pointerId', { value: 1 });
    Object.defineProperty(e, 'pointerType', { value: 'mouse' });
    act(() => { el.dispatchEvent(e); });
}
let handle: Element | null = null;
/** 행의 세로 범위를 0~100 으로 고정 — 위 25 · 가운데 · 아래 75 판정이 좌표로 서게 */
const box = (id: string, top = 0) => { const row = q(`[data-rv-row="${id}"]`)!; row.getBoundingClientRect = () => ({ top, height: 100, bottom: top + 100, left: 0, right: 100, width: 100, x: 0, y: top, toJSON() { return {}; } }); return row; };
/** 행 손잡이를 잡고 8px 넘게 움직여 끌기를 시작한다 */
const grab = (id: string) => { handle = q(`[data-rv-row-drag="${id}"]`)!; ptr(handle, 'pointerdown', 0); ptr(handle, 'pointermove', 20); };
const over = (y: number) => ptr(handle!, 'pointermove', y);
const drop = (y: number) => ptr(handle!, 'pointerup', y);

describe('하위로 끌어 넣기 (V4)', () => {
    it('행 가운데에 놓으면 그 행의 하위로 — onMoveUnder(끈 행, 대상 행)', () => {
        const { tree, onReorder } = setup();
        grab('d');
        const c = box('c');
        over(50);
        expect(c.className).toContain('ring-accent');   // 가운데 = 행 전체가 파랗게
        expect(q('[data-rv-reorder-overlay] .bg-accent')).toBeNull();   // 하위일 땐 가로선 없음
        drop(50);
        expect(tree.onMoveUnder).toHaveBeenCalledWith('d', 'c');
        expect(onReorder).not.toHaveBeenCalled();
    });
    it('위 가장자리 = 그 앞으로(순서) · 줄 위에 파란 선', () => {
        const { tree, onReorder } = setup();
        grab('d');
        const c = box('c');
        over(10);
        expect(c.className).not.toContain('ring-accent');
        expect(q('[data-rv-reorder-overlay] .bg-accent')!.style.top).toBe('-1.5px');   // 줄 위 가로 안내선
        drop(10);
        expect(onReorder).toHaveBeenCalledWith('d', 'c');
        expect(tree.onMoveUnder).not.toHaveBeenCalled();
    });
    it('아래 가장자리 = 그 뒤로(= 다음 줄 앞) · 마지막 줄이면 맨 끝', () => {
        const { onReorder } = setup();
        grab('a');
        box('c');
        over(90);
        expect(q('[data-rv-reorder-overlay] .bg-accent')!.style.top).toBe('98.5px');   // 줄 아래 가로 안내선
        drop(90);
        expect(onReorder).toHaveBeenLastCalledWith('a', 'd');
        grab('a');
        box('d', 200);
        over(290);
        drop(290);
        expect(onReorder).toHaveBeenLastCalledWith('a', null);
    });
    it('자기 자신·자기 자손 위에는 못 놓는다(순환) — 선도 안 뜬다', () => {
        const { tree, onReorder } = setup();
        grab('a');
        const b = box('b');   // b 는 a 의 자식
        over(50);
        expect(b.className).not.toContain('ring-accent');
        drop(50);
        expect(tree.onMoveUnder).not.toHaveBeenCalled();
        expect(onReorder).not.toHaveBeenCalled();
    });
    it('접힌 행 가운데에 놓으면 넣은 뒤 펼친다', () => {
        const { tree } = setup({ collapsed: (id) => id === 'c' });
        grab('d');
        box('c');
        over(50);
        drop(50);
        expect(tree.onMoveUnder).toHaveBeenCalledWith('d', 'c');
        expect(tree.onToggleCollapse).toHaveBeenCalledWith('c');
    });
    it('onMoveUnder 가 없으면 가운데도 순서(앞/뒤 둘로 나뉜다) — 하위로는 안 들어간다', () => {
        const { onReorder } = setup({ onMoveUnder: undefined });
        grab('d');
        box('c');
        over(50);
        expect(q('[data-rv-row="c"]')!.className).not.toContain('ring-accent');
        drop(30);
        expect(onReorder).toHaveBeenCalled();
    });
});

describe('「하위로」 단추 삭제 (V4)', () => {
    it('들여쓰기·내어쓰기 단추가 행 hover 에도 없다(끌기·우클릭·Tab 만)', () => {
        setup();
        act(() => { q('[data-rv-row="b"]')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
        expect(q('[data-rv-indent]')).toBeNull();
        expect(q('[data-rv-outdent]')).toBeNull();
    });
});

describe('행 끌기 터치화 — y 구역 번역 · 키보드 대안', () => {
    it('rowDropZone: 하위 가능 = 위 35% 앞 · 아래 35% 뒤 · 가운데 하위 / 불가 = 반반', () => {
        expect([0, 34, 35, 50, 65, 66, 100].map((y) => rowDropZone(y, 0, 100, true))).toEqual(['before', 'before', 'into', 'into', 'into', 'after', 'after']);
        expect([0, 49, 50, 99].map((y) => rowDropZone(y, 0, 100, false))).toEqual(['before', 'before', 'after', 'after']);
        expect(rowDropZone(150, 100, 100, true)).toBe('into');     // top 이 0 이 아니어도 사각형 기준
        expect(rowDropZone(5, 0, 0, true)).toBe('into');           // 높이 0 방어
    });
    it('손잡이에서 Alt+↓ = 다음 행 뒤로 · Alt+↑ = 앞 행 앞으로 · 맨 앞/끝에선 무동작', () => {
        const { onReorder } = setup();
        const key = (id: string, k: string) => act(() => { q(`[data-rv-row-drag="${id}"]`)!.dispatchEvent(new KeyboardEvent('keydown', { key: k, altKey: true, bubbles: true, cancelable: true })); });
        key('c', 'ArrowUp');
        expect(onReorder).toHaveBeenLastCalledWith('c', 'b');
        key('c', 'ArrowDown');
        expect(onReorder).toHaveBeenLastCalledWith('c', null);   // d 뒤 = 맨 끝
        const n = onReorder.mock.calls.length;
        key('a', 'ArrowUp');
        key('d', 'ArrowDown');
        expect(onReorder.mock.calls.length).toBe(n);
    });
});
