// @vitest-environment jsdom
/** #47 건너뛰기 링크 — 누르면 본문 영역으로 초점. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { SkipLink } from './Workbench';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('SkipLink', () => {
    it('초점 받을 때만 보이는 클래스 + 누르면 main 안 제목 칸에 초점', () => {
        const host = document.createElement('div');
        host.innerHTML = '<main id="main-content" tabindex="-1"><input aria-label="페이지 제목"></main>';
        const slot = document.createElement('div');
        document.body.append(slot, host);
        const root = createRoot(slot);
        act(() => { root.render(<SkipLink />); });
        const a = slot.querySelector<HTMLAnchorElement>('[data-skip-link]')!;
        expect(a.className).toContain('sr-only');
        expect(a.className).toContain('focus:not-sr-only');
        act(() => { a.click(); });
        expect(document.activeElement).toBe(host.querySelector('input'));
        act(() => root.unmount());
    });
});
