// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Button } from './Button';
import { IconButton } from './IconButton';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; });

function mount(el: React.ReactElement) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => createRoot(host).render(el));
    return host;
}

describe('꺼진 단추 안내', () => {
    it('꺼졌고 이유가 있으면 감싸는 span 이 title 을 든다', () => {
        const h = mount(createElement(Button, { disabled: true, disabledReason: '먼저 이름을 적어 주세요.' }, '저장'));
        expect(h.querySelector('span[title]')?.getAttribute('title')).toBe('먼저 이름을 적어 주세요.');
    });
    it('켜져 있으면 감싸지 않는다', () => {
        const h = mount(createElement(Button, { disabledReason: '먼저 이름을 적어 주세요.' }, '저장'));
        expect(h.querySelector('span[title]')).toBeNull();
    });
    it('꺼진 아이콘 단추도 span 이 title 을 든다', () => {
        const h = mount(createElement(IconButton, { icon: 'undo', label: '되돌리기', title: '되돌리기 (⌘Z)', disabled: true }));
        expect(h.querySelector('span[title]')?.getAttribute('title')).toBe('되돌리기 (⌘Z)');
    });
});
