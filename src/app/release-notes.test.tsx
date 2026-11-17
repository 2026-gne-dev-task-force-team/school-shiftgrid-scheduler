import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
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
