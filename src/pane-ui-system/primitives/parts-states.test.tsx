// @vitest-environment jsdom
/** 공통 부품 상태 모양 — 모든 단추 변형·입력류가 disabled 모양을, 단추류가 active 피드백을 가진다 (QA #14·#38·#39) */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { TextInput } from './TextInput';
import { Select } from './Select';

const cls = (el: React.ReactElement) => /class="([^"]*)"/.exec(renderToStaticMarkup(el))![1];

describe('공통 부품 상태 모양', () => {
    it.each(['ghost', 'accent', 'plain'] as const)('Button %s 는 disabled 모양·active 피드백을 가진다', (variant) => {
        const c = cls(h(Button, { variant, disabled: true }, 'x'));
        for (const k of ['disabled:opacity-40', 'disabled:cursor-not-allowed', 'disabled:hover:bg-transparent']) expect(c).toContain(k);
        expect(c).toMatch(/active:bg-text/);
        expect(c).toContain('duration-fast');
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
