// @vitest-environment jsdom
/**
 * W10b 툴바 — 교시 추가·삭제 · 길이 입력→뒤 교시 밀림 · notice · 되돌리기/다시하기 · 쉬는 시간 · 확대 · aria-label.
 */
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { TimeSheet } from './TimeSheet';
import { Table } from '../../sheet/Table';
import { parseHm } from './GridToolbar';
import { blankTimetable, guardTimeline, rowLength, type TimetableData } from '../model';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let latest: TimetableData = blankTimetable();
let notices: string[] = [];

function Harness() {
    const [hist, setHist] = useState<{ past: TimetableData[]; cur: TimetableData; future: TimetableData[] }>({ past: [], cur: blankTimetable(), future: [] });
    const [bar, setBar] = useState<HTMLElement | null>(null);
    latest = hist.cur;
    return (<>
        <div ref={setBar} />
        <TimeSheet data={hist.cur} Table={Table} toolbarHost={bar} onNotice={(m) => notices.push(m)}
            edit={(fn) => setHist((h) => { const n = guardTimeline(h.cur, fn(h.cur)); return n === h.cur ? h : { past: [...h.past, h.cur], cur: n, future: [] }; })}
            undo={() => setHist((h) => h.past.length ? { past: h.past.slice(0, -1), cur: h.past[h.past.length - 1], future: [h.cur, ...h.future] } : h)}
            redo={() => setHist((h) => h.future.length ? { past: [...h.past, h.cur], cur: h.future[0], future: h.future.slice(1) } : h)}
            canUndo={hist.past.length > 0} canRedo={hist.future.length > 0} />
    </>);
}
function mount() {
    notices = [];
    const el = document.createElement('div');
    document.body.appendChild(el);
    root = createRoot(el);
    act(() => { root!.render(<Harness />); });
}
afterEach(() => { act(() => { root?.unmount(); }); root = null; document.body.innerHTML = ''; });
const q = (s: string) => document.querySelector(s) as HTMLElement | null;
const btn = (label: string) => q(`button[aria-label="${label}"]`) as HTMLButtonElement;
const click = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const select = (c: number, r: number) => act(() => { q(`[data-rc="${r}:${c}"]`)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); });
const rowH = (r: number) => q(`tr[data-row-idx="${r}"]`)!.style.height;
function enter(label: string, value: string) {
    const el = q(`input[aria-label="${label}"]`) as HTMLInputElement;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
    act(() => { el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
}

describe('시간표 툴바', () => {
    it('툴바가 뜨고 아이콘 버튼엔 aria-label·title', () => {
        mount();
        expect(q('[role="toolbar"]')).not.toBeNull();
        const bar = q('[role="toolbar"]')!;
        expect(bar.className).toContain('flex-wrap');
        expect(bar.innerHTML).not.toContain('overflow-x-auto');
        for (const l of ['되돌리기', '다시하기', '교시 삭제', '더보기'].filter((x) => x !== '더보기')) {
            expect(btn(l).getAttribute('aria-label')).toBe(l);
            expect(btn(l).title).toBeTruthy();
        }
    });

    it('교시 추가 — 선택 행 아래 · 선택 없으면 끝 · 삭제', () => {
        mount();
        const n0 = latest.rows.length;
        click(btn('교시 추가'));
        expect(latest.rows.length).toBe(n0 + 1);
        const ids = latest.rows.map((r) => r.id);
        select(0, 1);
        click(btn('교시 추가'));
        expect(latest.rows.length).toBe(n0 + 2);
        expect(latest.rows[2].id).not.toBe(ids[2]);   // 행 1 아래(인덱스 2)에 새 행
        expect(ids.slice(0, 2)).toEqual(latest.rows.slice(0, 2).map((r) => r.id));
        click(btn('교시 삭제'));
        expect(latest.rows.length).toBe(n0 + 1);
    });

    it('길이 입력 → 뒤 교시가 밀린다', () => {
        mount();
        select(0, 0);
        const before = latest.rows.map((r) => r.range.start);
        const len0 = rowLength(latest, 0);
        enter('길이(분)', String(len0 + 10));
        expect(rowLength(latest, 0)).toBe(len0 + 10);
        expect(latest.rows[1].range.start).toBe(before[1] + 10);
        expect(latest.rows[5].range.start).toBe(before[5] + 10);
    });

    it('시작 시각 입력 — 앞 행과 겹치면 notice 한 줄', () => {
        mount();
        select(0, 1);
        enter('시작', '09:10');   // 0행 끝(09:50)보다 앞 → 맞춘다
        expect(notices.length).toBe(1);
        expect(notices[0]).toContain('겹쳐');
        expect(latest.rows[1].range.start).toBe(latest.rows[0].range.end);
    });

    it('앞 쉬는 시간 입력 → 갭이 바뀌고 뒤가 밀린다 · 첫 행은 입력 막힘', () => {
        mount();
        select(0, 0);
        expect((q('input[aria-label="앞 쉬는 시간(분)"]') as HTMLInputElement).disabled).toBe(true);
        select(0, 2);
        const s3 = latest.rows[3].range.start;
        enter('앞 쉬는 시간(분)', '20');
        expect(latest.rows[2].range.start - latest.rows[1].range.end).toBe(20);
        expect(latest.rows[3].range.start).toBeGreaterThan(s3);
    });

    it('하루 끝을 넘기는 길이는 막고 notice', () => {
        mount();
        select(0, 0);
        enter('길이(분)', '5000');
        expect(notices.some((m) => m.includes('24:00'))).toBe(true);
    });

    it('되돌리기·다시하기', () => {
        mount();
        expect(btn('되돌리기').disabled).toBe(true);
        click(btn('교시 추가'));
        const n = latest.rows.length;
        expect(btn('되돌리기').disabled).toBe(false);
        click(btn('되돌리기'));
        expect(latest.rows.length).toBe(n - 1);
        expect(btn('다시하기').disabled).toBe(false);
        click(btn('다시하기'));
        expect(latest.rows.length).toBe(n);
    });

    it('버튼 title 이 대상·비활성 이유를 말한다', () => {
        mount();
        select(0, 0);
        expect(btn('교시 삭제').title).toBe('1교시 삭제');
        expect(q('input[aria-label="앞 쉬는 시간(분)"]')!.closest('label')!.title).toBe('첫 교시는 앞 쉬는 시간이 없습니다');
        expect(btn('칸 지우기').title).toContain('칸의 내용');
        expect(btn('축소').title).toBe('화면 축소');
    });

    it('칸 지우기 · 확대(칸 높이가 커진다)', () => {
        mount();
        select(0, 0);   // 시트는 늘 칸 하나가 골라져 있다 — 지우기는 켜져 있다
        expect(btn('칸 지우기').disabled).toBe(false);
        expect(rowH(0)).toBe('40px');   // 50분 × 0.8
        click(btn('확대'));
        expect(rowH(0)).toBe('60px');   // 50분 × 1.2
        click(btn('축소')); click(btn('축소'));
        expect(rowH(0)).toBe('25px');   // 50분 × 0.5
    });

    it('시각 파서', () => {
        expect(parseHm('9:05')).toBe(545);
        expect(parseHm('0905')).toBe(545);
        expect(parseHm('24:00')).toBe(1440);
        expect(parseHm('가나')).toBeNull();
    });
    it('시작·길이·쉬는 시간이 어느 교시 값인지 접두로 보인다', () => {
        mount();
        select(0, 1);
        expect(document.querySelector('[data-testid="row-scope"]')?.textContent).toBe('2교시 ·');
    });

});
