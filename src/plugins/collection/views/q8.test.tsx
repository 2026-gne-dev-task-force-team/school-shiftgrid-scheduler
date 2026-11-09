// @vitest-environment jsdom
/**
 * Q8 — 컬렉션 표: 행을 다른 행 위로 끌어 놓으면 하위로(가운데) · 위·아래 가장자리는 순서 · 「하위로」 단추는 없다.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecordView } from '../RecordView';
import type { RecordField, RecordTree } from '../contracts/collection';

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

/** 끌기 이벤트 — jsdom 엔 DragEvent 가 없어 평범한 Event 에 좌표·dataTransfer 를 달아 보낸다 */
function drag(el: Element, type: string, clientY = 0) {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'clientY', { value: clientY });
    Object.defineProperty(e, 'dataTransfer', { value: { setData() { /* */ }, effectAllowed: '', dropEffect: '' } });
    act(() => { el.dispatchEvent(e); });
    return e;
}
/** 행의 세로 범위를 0~100 으로 고정 — 위 25 · 가운데 · 아래 75 판정이 좌표로 서게 */
const box = (id: string) => { const row = q(`[data-rv-row="${id}"]`)!; row.getBoundingClientRect = () => ({ top: 0, height: 100, bottom: 100, left: 0, right: 100, width: 100, x: 0, y: 0, toJSON() { return {}; } }); return row; };
const grab = (id: string) => drag(q(`[data-rv-row-drag="${id}"]`)!, 'dragstart');

describe('하위로 끌어 넣기 (V4)', () => {
    it('행 가운데에 놓으면 그 행의 하위로 — onMoveUnder(끈 행, 대상 행)', () => {
        const { tree, onReorder } = setup();
        grab('d');
        const c = box('c');
        drag(c, 'dragover', 50);
        expect(c.className).toContain('ring-accent');   // 가운데 = 행 전체가 파랗게
        drag(c, 'drop', 50);
        expect(tree.onMoveUnder).toHaveBeenCalledWith('d', 'c');
        expect(onReorder).not.toHaveBeenCalled();
    });
    it('위 가장자리 = 그 앞으로(순서) · 줄 위에 파란 선', () => {
        const { tree, onReorder } = setup();
        grab('d');
        const c = box('c');
        drag(c, 'dragover', 10);
        expect(c.className).toContain('border-t-accent');
        drag(c, 'drop', 10);
        expect(onReorder).toHaveBeenCalledWith('d', 'c');
        expect(tree.onMoveUnder).not.toHaveBeenCalled();
    });
    it('아래 가장자리 = 그 뒤로(= 다음 줄 앞) · 마지막 줄이면 맨 끝', () => {
        const { onReorder } = setup();
        grab('a');
        const c = box('c');
        drag(c, 'dragover', 90);
        expect(c.className).toContain('border-b-accent');
        drag(c, 'drop', 90);
        expect(onReorder).toHaveBeenLastCalledWith('a', 'd');
        grab('a');
        const d = box('d');
        drag(d, 'dragover', 90);
        drag(d, 'drop', 90);
        expect(onReorder).toHaveBeenLastCalledWith('a', null);
    });
    it('자기 자신·자기 자손 위에는 못 놓는다(순환) — 선도 안 뜬다', () => {
        const { tree, onReorder } = setup();
        grab('a');
        const b = box('b');   // b 는 a 의 자식
        const e = drag(b, 'dragover', 50);
        expect(e.defaultPrevented).toBe(false);
        expect(b.className).not.toContain('ring-accent');
        drag(b, 'drop', 50);
        expect(tree.onMoveUnder).not.toHaveBeenCalled();
        expect(onReorder).not.toHaveBeenCalled();
    });
    it('접힌 행 가운데에 놓으면 넣은 뒤 펼친다', () => {
        const { tree } = setup({ collapsed: (id) => id === 'c' });
        grab('d');
        const c = box('c');
        drag(c, 'dragover', 50);
        drag(c, 'drop', 50);
        expect(tree.onMoveUnder).toHaveBeenCalledWith('d', 'c');
        expect(tree.onToggleCollapse).toHaveBeenCalledWith('c');
    });
    it('onMoveUnder 가 없으면 가운데도 순서(앞/뒤 둘로 나뉜다) — 하위로는 안 들어간다', () => {
        const { onReorder } = setup({ onMoveUnder: undefined });
        grab('d');
        const c = box('c');
        drag(c, 'dragover', 50);
        expect(c.className).not.toContain('ring-accent');
        drag(c, 'drop', 30);
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
