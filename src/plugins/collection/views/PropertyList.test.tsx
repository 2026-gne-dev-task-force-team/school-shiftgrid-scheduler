// @vitest-environment jsdom
/**
 * 속성 목록(PropertyList) — 표와 같은 Cell 이라 인스펙터에서도 모든 타입이 고쳐진다 · 보기 전용 · 자동 계산 칸 · locked 기본 칸.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PropertyList } from './PropertyList';
import { RecordView } from '../RecordView';
import { fieldTypes } from '../fields/registry';
import type { RecordCellValue, RecordField } from '../contracts/collection';
import type { NodesApi } from '../../explorer/contracts/nodes';
import { initRecordNodes } from '../nodes';
import { DB_TYPE, ROW_TYPE } from '../schema';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let hostEl: HTMLDivElement | null = null;
function mount(el: React.ReactElement) {
    hostEl = document.createElement('div');
    document.body.appendChild(hostEl);
    root = createRoot(hostEl);
    act(() => { root!.render(el); });
}
afterEach(() => { act(() => { root?.unmount(); }); hostEl?.remove(); root = null; hostEl = null; document.body.innerHTML = ''; });

const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const mi = (label: string) => [...document.querySelectorAll('[role="menuitem"]')].find((x) => x.textContent === label) as HTMLButtonElement | undefined;
const click = (el: Element | null) => act(() => { (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const key = (el: Element, k: string) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });
function setInput(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const set = Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')!.set!;
    act(() => { set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
}
const typeText = (cellKey: string, text: string) => {
    click(q(`[data-rv-cell="${cellKey}"]`));
    const input = q('[data-rv-editing]') as HTMLInputElement;
    setInput(input, text);
    key(input, 'Enter');
};

/** 관계 칸 손짓용 — db1 밑 행 하나(r1 「첫째」)만 있는 가짜 노드 시스템 */
const FAKE_NODES = {
    get: (id: string) => (id === 'r1' ? { id, type: ROW_TYPE, name: '첫째', children: [] } : id === 'db1' ? { id, type: DB_TYPE, name: 'db', children: ['r1'] } : undefined),
    isTrashed: () => false,
    path: (id: string) => (id === 'r1' ? ['db1', 'r1'] : []),
    liveByType: (t: string) => (t === ROW_TYPE ? [{ id: 'r1', type: ROW_TYPE, name: '첫째', children: [] }] : []),
    subscribe: () => ({ dispose() { /* 빈 것 */ } }),
} as unknown as NodesApi;

const OPTS = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }];
/** 고칠 수 있는 내장 타입마다: 칸 하나 + 그 타입 값 꼴로 바꾸는 손짓 + 기대 값 */
const EDITABLE: { type: string; field: Partial<RecordField>; act: (k: string) => void; expected: RecordCellValue }[] = [
    { type: 'text', field: {}, act: (k) => typeText(k, '글'), expected: '글' },
    { type: 'number', field: {}, act: (k) => typeText(k, '42'), expected: 42 },
    { type: 'url', field: {}, act: (k) => typeText(k, 'https://a.b'), expected: 'https://a.b' },
    { type: 'email', field: {}, act: (k) => typeText(k, 'a@b.c'), expected: 'a@b.c' },
    { type: 'phone', field: {}, act: (k) => typeText(k, '010-1'), expected: '010-1' },
    { type: 'check', field: {}, act: (k) => click(q(`[data-rv-cell="${k}"]`)), expected: true },
    { type: 'select', field: { options: OPTS }, act: (k) => { click(q(`[data-rv-cell="${k}"]`)); click(q('[data-rv-opt="b"]')); }, expected: 'b' },
    { type: 'status', field: { options: OPTS }, act: (k) => { click(q(`[data-rv-cell="${k}"]`)); click(q('[data-rv-opt="a"]')); }, expected: 'a' },
    { type: 'multi', field: { options: OPTS }, act: (k) => { click(q(`[data-rv-cell="${k}"]`)); click(q('[data-rv-opt="a"]')); }, expected: ['a'] },
    { type: 'date', field: {}, act: (k) => { click(q(`[data-rv-cell="${k}"]`)); click(q('[data-iso="2026-11-15"]')); }, expected: { start: '2026-11-15' } },
    { type: 'relation', field: { config: { target: { kind: 'db', nodeId: 'db1' }, many: true } },
        act: (k) => { act(() => { initRecordNodes(FAKE_NODES); }); click(q(`[data-rv-cell="${k}"]`)); click(mi('첫째')!); act(() => { initRecordNodes(null); }); }, expected: ['r1'] },
];

describe('PropertyList — 내장 타입이 인스펙터에서 고쳐진다', () => {
    it('손짓 목록이 「고칠 수 있는 내장 타입」 전부를 덮는다(새 타입이 생기면 여기서 빨강)', () => {
        const editable = fieldTypes.list().filter((d) => !d.readOnly).map((d) => d.type).sort();
        expect(EDITABLE.map((e) => e.type).sort()).toEqual(editable);
    });
    it.each(EDITABLE)('$type — onChange(key, 그 타입 값 꼴)', ({ type, field, act: gesture, expected }) => {
        const onChange = vi.fn();
        mount(<PropertyList fields={[{ key: 'k', label: '칸', type, ...field }]} values={{}} onChange={onChange} />);
        gesture('k');
        expect(onChange).toHaveBeenCalledWith('k', expected);
    });
});

describe('PropertyList — 못 고치는 칸', () => {
    it('onChange 가 없으면 보기 전용 — 눌러도 편집이 안 열린다', () => {
        mount(<PropertyList fields={[{ key: 'k', label: '칸', type: 'text' }]} values={{ k: '값' }} />);
        click(q('[data-rv-cell="k"]'));
        expect(q('[data-rv-editing]')).toBeNull();
    });
    it('created·updated·id·field.readOnly 는 onChange 가 있어도 보기만', () => {
        const onChange = vi.fn();
        mount(<PropertyList fields={[
            { key: 'c', label: '생성', type: 'created' }, { key: 'u', label: '수정', type: 'updated' },
            { key: 'i', label: 'ID', type: 'id' }, { key: 'r', label: '잠금', type: 'text', readOnly: true },
        ]} values={{ c: '2026-11-09T10:00', u: '2026-11-09T10:00', i: 3, r: 'x' }} onChange={onChange} />);
        for (const k of ['c', 'u', 'i', 'r']) click(q(`[data-rv-cell="${k}"]`));
        expect(q('[data-rv-editing]')).toBeNull();
        expect(onChange).not.toHaveBeenCalled();
    });
});

describe('locked 기본 칸 — 머리 메뉴가 지우기·타입 바꾸기를 막는다', () => {
    const FIELDS: RecordField[] = [
        { key: 't', label: '제목', type: 'text' },
        { key: 'base', label: '기본', type: 'text', locked: true },
        { key: 'free', label: '자유', type: 'text' },
    ];
    const open = (k: string) => {
        mount(<RecordView<{ id: string }> fields={FIELDS} records={[]} getId={(r) => r.id} viewKey="t.lock" titleKey="t" onFieldsChange={() => {}} />);
        click(q(`[data-rv-head-menu="${k}"]`));
    };
    it('locked 칸: 칸 삭제 단추 없음 · 타입 단추 전부 비활성', () => {
        open('base');
        expect(mi('속성 삭제')).toBeUndefined();
        expect(document.querySelectorAll('[data-rv-type]:not([disabled])').length).toBe(0);
    });
    it('보통 칸: 칸 삭제 단추 있음 · 타입 단추 활성(대조)', () => {
        open('free');
        expect(mi('속성 삭제')).toBeTruthy();
        expect(document.querySelectorAll('[data-rv-type]:not([disabled])').length).toBeGreaterThan(0);
    });
});
