// @vitest-environment jsdom
/** R3-C 새 일정 직후 — 미리보기 제목 입력으로 초점 + 전체 선택. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { focusPeekTitle } from './focus-title';

afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); });

describe('focusPeekTitle', () => {
    it('미리보기 안 제목 입력으로 초점이 가고 글자가 전부 골라진다', () => {
        document.body.innerHTML = '<main tabindex="0" id="m"></main><div role="complementary" aria-label="미리보기"><button id="x">x</button><input aria-label="제목" value="제목 없음"></div>';
        (document.getElementById('m') as HTMLElement).focus();
        focusPeekTitle();
        const t = document.querySelector('input') as HTMLInputElement;
        expect(document.activeElement).toBe(t);
        expect(t.selectionStart).toBe(0);
        expect(t.selectionEnd).toBe(t.value.length);
    });
    it('입력이 늦게 그려져도 나타나면 잡는다', async () => {
        document.body.innerHTML = '<main tabindex="0" id="m"></main>';
        (document.getElementById('m') as HTMLElement).focus();
        focusPeekTitle();
        document.body.insertAdjacentHTML('beforeend', '<div role="complementary" aria-label="미리보기"><input aria-label="제목" value="abc"></div>');
        await new Promise((r) => setTimeout(r, 80));
        expect(document.activeElement?.getAttribute('aria-label')).toBe('제목');
    });
    it('그 사이 남의 입력칸으로 초점을 옮겼으면 뺏지 않는다', async () => {
        document.body.innerHTML = '<main tabindex="0" id="m"></main><input id="other">';
        (document.getElementById('m') as HTMLElement).focus();
        focusPeekTitle();
        (document.getElementById('other') as HTMLElement).focus();
        document.body.insertAdjacentHTML('beforeend', '<div role="complementary" aria-label="미리보기"><input aria-label="제목" value="a"></div>');
        await new Promise((r) => setTimeout(r, 80));
        expect(document.activeElement?.id).toBe('other');
    });
});
