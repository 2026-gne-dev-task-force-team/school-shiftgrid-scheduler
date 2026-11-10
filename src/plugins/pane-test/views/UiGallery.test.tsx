// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, afterEach } from 'vitest';
import { setStoragePrefix } from '../../../pane-ui-system';
import { UiGallery } from './UiGallery';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; });

describe('부품 견본 뷰', () => {
    it('그려지고 Button 격자(4변형 × 3색 × 2크기 = 24)와 테마·밀도 고르기가 있다', () => {
        setStoragePrefix('test.gallery');
        const host = document.createElement('div');
        document.body.appendChild(host);
        act(() => createRoot(host).render(createElement(UiGallery)));
        const text = host.textContent ?? '';
        expect(text).toContain('부품 견본');
        expect(text).toContain('밀도');
        for (const v of ['solid', 'soft', 'ghost', 'outline']) expect(text).toContain(v);
        const tones = [...host.querySelectorAll('button')].filter((b) => ['neutral', 'accent', 'danger'].includes(b.textContent ?? ''));
        expect(tones.length).toBeGreaterThanOrEqual(24);
        expect(host.querySelectorAll('[role="radiogroup"]').length).toBeGreaterThanOrEqual(1);
    });
});
