// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { EditionBadge } from './EditionBadge';
import { RELEASE_NOTES } from './changelog';
import { ReleaseNotes } from './ReleaseNotes';

describe('쓰는 사람용 소식', () => {
    const html = renderToStaticMarkup(createElement(ReleaseNotes, { notes: RELEASE_NOTES }));
    it('세 칸 꼴로 그린다', () => {
        for (const id of ['improved', 'added', 'tryIt']) expect(html).toContain(`data-testid="notes-${id}"`);
        for (const l of ['좋아진 것', '새로 쓸 수 있는 것', '눌러 볼 것']) expect(html).toContain(l);
    });
    it('번호·영어 내부 이름이 화면 글자에 안 나온다', () => {
        const text = html.replace(/<[^>]*>/g, ' ');
        expect(text).not.toMatch(/\bT-[0-9A-Za-z]+|\bR\d+\b|\d{4}-\d\d-\d\d/);
        expect(text).not.toMatch(/[A-Za-z]{3,}/);
    });
    it('모든 묶음이 세 칸을 채웠다', () => {
        for (const n of RELEASE_NOTES) for (const k of ['improved', 'added', 'tryIt'] as const) expect(n[k].length).toBeGreaterThan(0);
    });
});

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('새 소식 팝오버 자리', () => {
    it('상태바 칸 안이 아니라 body 포털(Popover 원시 부품)로 그려진다 — 가운데 패널 밑에 안 깔리게', () => {
        globalThis.fetch = (() => Promise.reject(new Error('x'))) as typeof fetch;
        const slot = document.createElement('div');
        document.body.append(slot);
        const root = createRoot(slot);
        act(() => { root.render(createElement(EditionBadge)); });
        act(() => { slot.querySelector<HTMLButtonElement>('[data-testid="edition-badge"]')!.click(); });
        const panel = document.body.querySelector('[data-testid="changelog-panel"]')!;
        expect(panel).toBeTruthy();
        expect(slot.contains(panel)).toBe(false);
        expect(panel.closest('[data-popover]')?.parentElement).toBe(document.body);
        act(() => root.unmount());
    });
});
