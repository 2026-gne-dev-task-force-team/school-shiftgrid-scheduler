// @vitest-environment jsdom
/**
 * P2 뒷부분 검산 — 보기 탭 · 필터 OR 그룹 · 상대 날짜 · 칸 고정/줄바꿈 · 계산 행 16종 · 키보드 셀 이동 · 복사(TSV)·채우기(⌘D) · 일괄 편집.
 *   🔴 채우기·일괄 편집은 onCellsChange 「한 번」 = 되돌리기 한 칸.
 */
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecordView } from './RecordView';
import type { CellChange, FilterNode, RecordField, ViewDef } from './contracts/collection';
import { CALC_FNS, calcFnsFor, runCalc } from './calc';
import { inRelative, relativeRange } from './fields/dates';
import { evalFilter, normalizeFilter } from './logic';
import { normalizeViews } from './view-state';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Rec = { id: string } & Record<string, unknown>;
const FIELDS: RecordField[] = [
    { key: 'f_t', label: '제목', type: 'text' },
    { key: 'f_x', label: '값', type: 'text' },
    { key: 'f_n', label: '수', type: 'number' },
];
const ROWS: Rec[] = [
    { id: 'a', f_t: '하나', f_x: 'x1', f_n: 1 },
    { id: 'b', f_t: '둘', f_x: 'x2', f_n: 2 },
    { id: 'c', f_t: '셋', f_x: '', f_n: null },
];

let root: Root | null = null;
let hostEl: HTMLDivElement | null = null;
let lastViews: ViewDef[] = [];
const cells = vi.fn<(c: CellChange[]) => void>();

function Harness() {
    const [rows, setRows] = useState(ROWS);
    const [views, setViews] = useState<ViewDef[]>(() => normalizeViews(undefined));
    return (
        <RecordView<Rec>
            fields={FIELDS} records={rows} getId={(r) => r.id} viewKey="t.p2b" titleKey="f_t"
            views={views} onViewsChange={(v) => { lastViews = v; setViews(v); }}
            onCellChange={(id, key, value) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [key]: value } : r)))}
            onCellsChange={(cs) => { cells(cs); setRows((rs) => rs.map((r) => cs.reduce((acc, c) => (c.id === r.id ? { ...acc, [c.key]: c.value } : acc), r))); }}
            onDeleteRecords={() => {}}
        />
    );
}

const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const qa = (sel: string) => [...document.querySelectorAll(sel)] as HTMLElement[];
const click = (el: Element | null) => act(() => { (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const down = (el: Element | null, init: MouseEventInit = {}) => act(() => { (el as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, ...init })); });
const key = (el: Element, k: string, init: KeyboardEventInit = {}) =>
    act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })); });
function setInput(el: HTMLInputElement, value: string) {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => { set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
}
const pos = (r: number, c: number) => q(`[data-rv-pos="${r}:${c}"]`)!;
const selected = () => qa('[data-rv-sel]').map((e) => e.getAttribute('data-rv-pos'));

beforeEach(() => {
    localStorage.clear();
    cells.mockClear();
    lastViews = [];
    hostEl = document.createElement('div');
    document.body.appendChild(hostEl);
    root = createRoot(hostEl);
    act(() => { root!.render(<Harness />); });
});
afterEach(() => {
    act(() => { root?.unmount(); });
    hostEl?.remove();
    vi.useRealTimers();
});

describe('상대 날짜', () => {
    it('이번 주는 월요일부터 · 오늘 기준으로 매번 다시 잰다', () => {
        const wed = new Date(2026, 10, 11);   // 2026-11-11 수
        expect(relativeRange('thisWeek', wed)).toEqual(['2026-11-09', '2026-11-16']);
        expect(relativeRange('lastMonth', wed)).toEqual(['2026-10-01', '2026-11-01']);
        expect(relativeRange('today', wed)).toEqual(['2026-11-11', '2026-11-12']);
        expect(inRelative({ start: '2026-11-15T23:00' }, 'thisWeek', wed)).toBe(true);
        expect(inRelative('2026-11-16', 'thisWeek', wed)).toBe(false);
        // 필터에 날짜를 박지 않는다 — 시계가 가면 결과가 바뀐다
        const field: RecordField = { key: 'd', label: '날', type: 'date' };
        const by = new Map([['d', field]]);
        const node: FilterNode = { key: 'd', op: 'thisWeek' };
        vi.useFakeTimers();
        vi.setSystemTime(wed);
        expect(evalFilter(node, by, { d: '2026-11-10' })).toBe(true);
        vi.setSystemTime(new Date(2026, 10, 20));
        expect(evalFilter(node, by, { d: '2026-11-10' })).toBe(false);
    });
});

describe('필터 OR 그룹', () => {
    const by = new Map(FIELDS.map((f) => [f.key, f]));
    it('{or:[a,{and:[b,c]}]} 평가 · 3단은 정규화가 버린다', () => {
        const f: FilterNode = { or: [{ key: 'f_t', op: 'eq', value: '셋' }, { and: [{ key: 'f_x', op: 'contains', value: 'x' }, { key: 'f_n', op: 'gt', value: 1 }] }] };
        expect(ROWS.filter((r) => evalFilter(f, by, r)).map((r) => r.id)).toEqual(['b', 'c']);
        const deep = normalizeFilter({ or: [{ and: [{ or: [{ key: 'f_t', op: 'empty' }] }] }] });
        expect(deep).toEqual({ or: [] });
    });
    it('UI — 그룹 추가 · 「또는」으로 바꾸기, 그룹 안엔 「그룹 추가」가 없다', () => {
        click(q('[data-rv-filter-btn]'));
        click(q('[data-rv-add-filter="0"]'));
        click(q('[data-rv-add-filter-group]'));
        const conj = q('[data-rv-filter-conj="0"]') as HTMLSelectElement;
        act(() => { conj.value = 'or'; conj.dispatchEvent(new Event('change', { bubbles: true })); });
        const filter = lastViews[0].filter as { or: FilterNode[] };
        expect(filter.or).toHaveLength(2);
        expect('and' in filter.or[1]).toBe(true);
        expect(qa('[data-rv-filter-group="1"]')).toHaveLength(1);
        expect(qa('[data-rv-add-filter-group]')).toHaveLength(1);   // 위쪽에만 — 3단을 UI 가 막는다
        expect(q('[data-rv-filter-btn]')!.textContent).toContain('2');
    });
});

describe('계산 행', () => {
    const num: RecordField = { key: 'n', label: 'n', type: 'number' };
    const multi: RecordField = { key: 'm', label: 'm', type: 'multi', options: [] };
    const date: RecordField = { key: 'd', label: 'd', type: 'date' };
    it('16종 · 빈 값은 개수 외 함수에서 빠진다', () => {
        expect(CALC_FNS).toHaveLength(16);
        const vals = [3, 1, null, 2, undefined];
        expect(runCalc('count', vals, num)).toBe('5');
        expect(runCalc('values', vals, num)).toBe('3');
        expect(runCalc('empty', vals, num)).toBe('2');
        expect(runCalc('pctEmpty', vals, num)).toBe('40%');
        expect(runCalc('sum', vals, num)).toBe('6');
        expect(runCalc('avg', vals, num)).toBe('2');
        expect(runCalc('median', [4, 1, 3, 2], num)).toBe('2.5');
        expect(runCalc('range', vals, num)).toBe('2');
        expect(runCalc('sum', [null], num)).toBe('');
        expect(runCalc('sum', [1234567], { ...num, config: { format: 'comma' } })).toBe('1,234,567');
        expect(runCalc('values', [['a', 'b'], ['a'], []], multi)).toBe('3');
        expect(runCalc('unique', [['a', 'b'], ['a'], []], multi)).toBe('2');
        expect(runCalc('dateRange', ['2026-11-01', { start: '2026-11-11T09:00' }, null], date)).toBe('10일');
        expect(runCalc('earliest', ['2026-11-05', '2026-11-01'], date)).toBe('2026-11-01');
        expect(calcFnsFor({ key: 't', label: 't', type: 'text' }).some((c) => c.id === 'sum')).toBe(false);
    });
    it('칸 아래 「계산」에서 합계를 고르면 보기에 저장되고 값이 뜬다', () => {
        click(q('[data-rv-calc="f_n"]'));
        click(q('[data-rv-calc-fn="sum"]'));
        expect(lastViews[0].calc).toEqual({ f_n: 'sum' });
        expect(q('[data-rv-calc="f_n"] [data-rv-calc-val]')!.textContent).toBe('3');
    });
});

describe('보기 탭', () => {
    it('추가 → 새 탭 활성(활성은 localStorage) · 복제 · 이름 · 마지막 하나는 못 지움', () => {
        expect(qa('[data-rv-view-tab]')).toHaveLength(1);
        click(q('[data-rv-view-tab]'));   // 활성 탭 누르면 메뉴
        expect((q('[data-rv-view-act="delete"]') as HTMLButtonElement).disabled).toBe(true);
        click(q('[data-rv-view-add]'));
        expect(lastViews).toHaveLength(2);
        const newId = lastViews[1].id;
        expect(q(`[data-rv-view-tab="${newId}"]`)!.getAttribute('aria-selected')).toBe('true');
        expect(Object.values({ ...localStorage }).includes(newId)).toBe(true);
        click(q(`[data-rv-view-tab="${newId}"]`));
        click(q('[data-rv-view-act="duplicate"]'));
        expect(lastViews).toHaveLength(3);
        act(() => { q(`[data-rv-view-tab="${lastViews[2].id}"]`)!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
        const inp = q('[data-rv-view-rename]') as HTMLInputElement;
        setInput(inp, '주간');
        key(inp, 'Enter');
        expect(lastViews[2].name).toBe('주간');
        click(q(`[data-rv-view-tab="${lastViews[2].id}"]`));
        click(q('[data-rv-view-act="delete"]'));
        expect(lastViews).toHaveLength(2);
    });
});

describe('칸 고정 · 줄바꿈', () => {
    it('frozen:1 → 첫 칸 sticky · wrap → 칸에 표시', () => {
        click(q('[data-rv-head-menu="f_t"]'));
        click(q('[data-rv-freeze]'));
        expect(lastViews[0].frozen).toBe(1);
        expect(q('[data-rv-head="f_t"]')!.style.position).toBe('sticky');
        expect(pos(0, 0).style.position).toBe('sticky');
        expect(q('[data-rv-head="f_x"]')!.style.position).toBe('');
        click(q('[data-rv-head-menu="f_x"]'));
        click(q('[data-rv-wrap]'));
        expect(lastViews[0].columns.find((c) => c.key === 'f_x')?.wrap).toBe(true);
        expect(pos(0, 1).className).toContain('whitespace-normal');
    });
});

describe('키보드 · 복사 · 채우기', () => {
    it('화살표·Tab 이동 · Enter 로 편집 열림 · IME 중엔 무시', () => {
        down(pos(0, 0));
        key(pos(0, 0), 'ArrowDown');
        expect(selected()).toEqual(['1:0']);
        key(pos(1, 0), 'Tab');
        expect(selected()).toEqual(['1:1']);
        key(pos(1, 1), 'ArrowDown', { isComposing: true });
        expect(selected()).toEqual(['1:1']);
        key(pos(1, 1), 'Enter');
        expect(q('[data-rv-pos="1:1"] input')).not.toBeNull();
    });
    it('Shift 범위 → 복사는 TSV', () => {
        down(pos(0, 0));
        key(pos(0, 0), 'ArrowRight', { shiftKey: true });
        key(pos(0, 1), 'ArrowDown', { shiftKey: true });
        expect(selected()).toEqual(['0:0', '0:1', '1:0', '1:1']);
        const data: Record<string, string> = {};
        const ev = new Event('copy', { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
        ev.clipboardData = { setData: (t: string, v: string) => { data[t] = v; }, getData: () => '' };
        act(() => { pos(1, 1).dispatchEvent(ev); });
        expect(data['text/plain']).toBe('하나\tx1\n둘\tx2');
    });
    it('⌘D — 맨 윗줄 값을 아래로, 한 묶음', () => {
        down(pos(0, 1));
        down(pos(2, 1), { shiftKey: true });
        key(pos(2, 1), 'd', { ctrlKey: true });
        expect(cells).toHaveBeenCalledTimes(1);
        expect(cells.mock.calls[0][0]).toEqual([{ id: 'b', key: 'f_x', value: 'x1' }, { id: 'c', key: 'f_x', value: 'x1' }]);
    });
});

describe('일괄 편집', () => {
    it('행 3개 고르고 「칸 바꾸기」 → 3행 같은 값 · 한 묶음', () => {
        for (const id of ['a', 'b', 'c']) click(q(`[data-rv-check="${id}"]`));
        click(q('[data-rv-bulk]'));
        const sel = q('[data-rv-bulk-field]') as HTMLSelectElement;
        act(() => { sel.value = 'f_x'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
        click(q('[data-rv-bulk-cell] [data-rv-cell]'));
        const inp = q('[data-rv-bulk-cell] input') as HTMLInputElement;
        setInput(inp, '같음');
        key(inp, 'Enter');
        expect(cells).toHaveBeenCalledTimes(1);
        expect(cells.mock.calls[0][0]).toEqual(['a', 'b', 'c'].map((id) => ({ id, key: 'f_x', value: '같음' })));
    });
});
