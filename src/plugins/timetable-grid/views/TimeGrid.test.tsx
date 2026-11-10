// @vitest-environment jsdom
/**
 * Q4 T5 시간표 그리드 — 시각 눈금 · 행 = 시각 띠(높이 ∝ 시간) · 칸 글자 · 행 시각 끌기 · 열 너비 끌기.
 */
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { TimeGrid } from './TimeGrid';
import { blankTimetable, type TimetableData } from '../model';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let hostEl: HTMLDivElement | null = null;
let latest: TimetableData = blankTimetable();

function Harness() {
    const [data, setData] = useState<TimetableData>(blankTimetable());
    latest = data;
    return <TimeGrid data={data} edit={(fn) => setData((d) => fn(d))} />;
}
function mount() {
    hostEl = document.createElement('div');
    document.body.appendChild(hostEl);
    root = createRoot(hostEl);
    act(() => { root!.render(<Harness />); });
}
afterEach(() => { act(() => { root?.unmount(); }); hostEl?.remove(); root = null; hostEl = null; document.body.innerHTML = ''; });
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const qa = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[];
const fire = (el: Element, type: string, init: MouseEventInit = {}) => act(() => { el.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init })); });
function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    act(() => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
    act(() => { el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
}

describe('시간표 그리드(달력 주 보기 꼴)', () => {
    it('왼쪽 시각 눈금 09:00~15:00 · 열 머리 월~금 · 칸 높이는 시간에 비례(50분 = 40px)', () => {
        mount();
        const text = document.body.textContent ?? '';
        for (const t of ['09:00', '12:00', '15:00']) expect(text).toContain(t);
        expect(qa('input[aria-label$="이름"][aria-label^="열"]').map((i) => (i as HTMLInputElement).value)).toEqual(['월', '화', '수', '목', '금']);
        expect(qa('[data-testid="row-edge-end"]').length).toBe(6);
        const cell = q('[data-c="0"][data-r="0"]')!;
        expect(cell.style.height).toBe('40px');   // 09:00~09:50
        expect(q('[data-c="0"][data-r="1"]')!.style.top).toBe('48px');   // 10:00 = 1시간 아래
    });

    it('칸에 적고 포커스를 빼면 한 번에 저장된다 · 위쪽 도구 막대는 없다', () => {
        mount();
        fire(q('[data-c="1"][data-r="2"]')!, 'dblclick');   // 칸은 선택 상태가 기본 — 더블클릭으로 편집
        type(q('[data-c="1"][data-r="2"] textarea') as HTMLTextAreaElement, '수학');
        expect(latest.cells['c1r2']?.text).toBe('수학');
        expect(q('[role="toolbar"]')).toBeNull();
    });

    it('행 아래 가장자리를 끌면 끝 시각이 5분 단위로 바뀐다(놓을 때 한 번)', () => {
        mount();
        const edge = q('[data-testid="row-edge-end"]')!;
        fire(edge, 'pointerdown', { clientY: 100 });
        fire(edge, 'pointermove', { clientY: 140 });   // +40px = +50분
        expect(latest.rows[0].range.end).toBe(590);     // 끄는 동안은 저장 안 함
        fire(edge, 'pointerup', { clientY: 140 });
        expect(latest.rows[0].range).toEqual({ start: 540, end: 640 });
    });

    it('열 머리 오른쪽 가장자리를 끌면 그 열 너비가 저장된다', () => {
        mount();
        const grip = q('[data-testid="col-resize"]')!;
        fire(grip, 'pointerdown', { clientX: 0 });
        fire(grip, 'pointermove', { clientX: 80 });
        fire(grip, 'pointerup', { clientX: 80 });
        expect(latest.colWidths).toEqual({ '0': 200 });
    });
});
