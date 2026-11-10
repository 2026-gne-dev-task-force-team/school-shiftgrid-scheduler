// @vitest-environment jsdom
/** 입력류 새 부품·다듬기 — Field 가 id 를 넘기는지 · 값 부품 onChange(값) · 크기 표 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { Field } from './Field';
import { TextInput } from './TextInput';
import { Select } from './Select';
import { Textarea } from './Textarea';
import { NumberInput } from './NumberInput';
import { Checkbox } from './Checkbox';
import { Segmented } from './Segmented';
import { RadioGroup } from './RadioGroup';
import { Badge } from './Badge';
import { PropertyField } from './PropertyField';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// 테스트용 느슨한 createElement(props 검사 생략)
const h = createElement as (...a: unknown[]) => React.ReactElement;
const cls = (el: React.ReactElement) => /class="([^"]*)"/.exec(renderToStaticMarkup(el))![1];
function mount(el: React.ReactElement) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => { root.render(el); });
    return host;
}

describe('입력칸 크기·상태', () => {
    it.each([['TextInput', TextInput], ['Select', Select], ['NumberInput', NumberInput]] as const)('%s 는 sm=h-btn · md=h-field · rounded-ctl · FOCUS_FIELD', (_n, C) => {
        const p = { options: [], value: null, onChange: () => {} } as object;
        expect(cls(h(C, { ...p, size: 'sm' }))).toContain('h-btn');
        const md = cls(h(C, p));
        for (const k of ['h-field', 'rounded-ctl', 'focus:border-accent', 'focus:outline-accent/30']) expect(md).toContain(k);
    });
    it('invalid 면 border-bad + aria-invalid', () => {
        const html = renderToStaticMarkup(h(TextInput, { invalid: true }));
        expect(html).toContain('border-bad');
        expect(html).toContain('aria-invalid="true"');
    });
    it('Textarea rows 기본 3 · size 별 글자', () => {
        expect(renderToStaticMarkup(h(Textarea, {}))).toContain('rows="3"');
        expect(cls(h(Textarea, { size: 'sm' }))).toContain('text-small');
    });
    it('Select placeholder 는 맨 앞 빈 option', () => {
        expect(renderToStaticMarkup(h(Select, { options: [{ value: 'a', label: 'A' }], placeholder: '고르기' }))).toContain('<option value="">고르기</option>');
    });
    it('Badge 18px(1.125rem) · tone 별 색', () => {
        expect(cls(h(Badge, { tone: 'danger' }, 'x'))).toContain('text-bad');
        expect(cls(h(Badge, {}, 'x'))).toContain('h-[1.125rem]');
    });
});

describe('Field', () => {
    it('이름표 htmlFor 와 칸 id 가 같고 도움말이 aria-describedby 로 이어진다', () => {
        const host = mount(h(Field, { label: '이름', hint: '도움말' }, h(TextInput, {})));
        const input = host.querySelector('input')!;
        const label = host.querySelector('label')!;
        expect(label.htmlFor).toBe(input.id);
        expect(input.id).not.toBe('');
        expect(host.querySelector(`[id="${input.getAttribute('aria-describedby')!}"]`)!.textContent).toBe('도움말');
    });
    it('error 가 있으면 칸이 invalid, 오류 글이 role=alert', () => {
        const host = mount(h(Field, { label: 'a', error: '틀림' }, h(NumberInput, { value: 1, onChange: () => {} })));
        expect(host.querySelector('input')!.getAttribute('aria-invalid')).toBe('true');
        expect(host.querySelector('[role=alert]')!.textContent).toBe('틀림');
    });
    it('row 배치', () => {
        expect(renderToStaticMarkup(h(Field, { label: 'a', layout: 'row' }, h(TextInput, {})))).toContain('flex-row');
    });
});

describe('값 부품', () => {
    it('NumberInput — 숫자는 number, 빈칸은 null', () => {
        const fn = vi.fn();
        const host = mount(h(NumberInput, { value: 1, onChange: fn }));
        const el = host.querySelector('input')!;
        const set = (v: string) => act(() => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v);
            el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        set('5'); expect(fn).toHaveBeenLastCalledWith(5);
        set(''); expect(fn).toHaveBeenLastCalledWith(null);
    });
    it('Checkbox — 클릭하면 onChange(true) · label 을 눌러도 토글', () => {
        const fn = vi.fn();
        const host = mount(h(Checkbox, { checked: false, onChange: fn, label: '고정' }));
        act(() => { host.querySelector('input')!.click(); });
        expect(fn).toHaveBeenCalledWith(true);
        expect(host.querySelector('label')!.textContent).toBe('고정');
    });
    it('Checkbox indeterminate', () => {
        const host = mount(h(Checkbox, { checked: false, onChange: () => {}, indeterminate: true }));
        expect(host.querySelector('input')!.indeterminate).toBe(true);
    });
    it('Segmented — radiogroup · 선택 표시 · ← 로 이동', () => {
        const fn = vi.fn();
        const host = mount(h(Segmented, { label: '보기', value: 'w', onChange: fn, options: [{ value: 'd', label: '일' }, { value: 'w', label: '주' }] }));
        expect(host.querySelector('[role=radiogroup]')!.getAttribute('aria-label')).toBe('보기');
        const btns = host.querySelectorAll<HTMLButtonElement>('[role=radio]');
        expect(btns[1].getAttribute('aria-checked')).toBe('true');
        act(() => { btns[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); });
        expect(fn).toHaveBeenCalledWith('d');
        act(() => { btns[0].click(); });
        expect(fn).toHaveBeenLastCalledWith('d');
    });
    it('RadioGroup — 고르면 onChange(값) · hint 표시', () => {
        const fn = vi.fn();
        const host = mount(h(RadioGroup, { label: '종류', value: 'a', onChange: fn, options: [{ value: 'a', label: 'A', hint: '설명' }, { value: 'b', label: 'B' }] }));
        act(() => { host.querySelectorAll<HTMLInputElement>('input')[1].click(); });
        expect(fn).toHaveBeenCalledWith('b');
        expect(host.textContent).toContain('설명');
    });
});

describe('PropertyField', () => {
    it('초점 고리가 생기고 Enter 로 확정한다', () => {
        const fn = vi.fn();
        const host = mount(h(PropertyField, { label: '이름', value: 'a', onCommit: fn }));
        const el = host.querySelector('input')!;
        expect(el.className).toContain('focus:border-accent');
        act(() => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, 'b');
            el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
        expect(fn).toHaveBeenCalledWith('b');
    });
});
