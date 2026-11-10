// @vitest-environment jsdom
/** 공통 부품 상태 모양 — 모든 단추 변형·입력류가 disabled 모양을, 단추류가 active 피드백을 가진다 (QA #14·#38·#39) */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { Toggle } from './Toggle';
import { TextInput } from './TextInput';
import { Select } from './Select';

const cls = (el: React.ReactElement) => /class="([^"]*)"/.exec(renderToStaticMarkup(el))![1];

describe('공통 부품 상태 모양', () => {
    const VARIANTS = ['solid', 'soft', 'ghost', 'outline'] as const;
    const TONES = ['neutral', 'accent', 'danger'] as const;
    it.each(VARIANTS.flatMap((v) => TONES.map((t) => [v, t] as const)))('Button %s·%s 는 disabled 모양·active 피드백을 가진다', (variant, tone) => {
        const c = cls(h(Button, { variant, tone, disabled: true }, 'x'));
        for (const k of ['disabled:opacity-40', 'disabled:cursor-not-allowed', 'disabled:hover:bg-', 'disabled:active:bg-']) expect(c).toContain(k);
        expect(c).toMatch(/active:bg-/);
        expect(c).toContain('duration-fast');
        expect(c).toContain('rounded-ctl');
    });
    it('Button 높이는 size 가 정한다 — sm h-btn · md h-field', () => {
        expect(cls(h(Button, { size: 'sm' }, 'x'))).toContain('h-btn');
        expect(cls(h(Button, {}, 'x'))).toContain('h-field');
    });
    it.each(['ghost', 'accent', 'plain'] as const)('Button 옛 별칭 %s 도 disabled 모양을 가진다', (variant) => {
        const c = cls(h(Button, { variant, disabled: true }, 'x'));
        for (const k of ['disabled:opacity-40', 'disabled:cursor-not-allowed', 'disabled:hover:bg-']) expect(c).toContain(k);
        expect(c).toMatch(/active:bg-/);
    });
    it('Button plain 별칭은 옛 높이 h-btn · accent 별칭은 accent soft', () => {
        expect(cls(h(Button, { variant: 'plain' }, 'x'))).toContain('h-btn');
        expect(cls(h(Button, { variant: 'accent' }, 'x'))).toContain('text-accent');
    });
    it('Button loading 은 눌림을 막는다', () => {
        expect(renderToStaticMarkup(h(Button, { loading: true }, 'x'))).toContain('disabled');
    });
    it('Toggle 은 checked/onChange 와 옛 on/onToggle 둘 다 받는다', () => {
        expect(renderToStaticMarkup(h(Toggle, { checked: true, onChange: () => {} }))).toContain('aria-checked="true"');
        expect(renderToStaticMarkup(h(Toggle, { on: true, onToggle: () => {} }))).toContain('aria-checked="true"');
    });
    it('IconButton 은 disabled·active', () => {
        const c = cls(h(IconButton, { icon: 'plus' as never, label: 'a' }));
        expect(c).toContain('disabled:opacity-40');
        expect(c).toContain('disabled:cursor-not-allowed');
        expect(c).toMatch(/active:bg-text/);
    });
    it('TextInput·Select 는 disabled 모양과 hover 테두리', () => {
        for (const c of [cls(h(TextInput, { disabled: true })), cls(h(Select, { options: [], disabled: true }))]) {
            expect(c).toContain('disabled:opacity-40');
            expect(c).toContain('disabled:cursor-not-allowed');
            expect(c).toContain('hover:border-muted');
            expect(c).toContain('disabled:hover:border-line');
        }
    });
});
