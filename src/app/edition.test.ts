import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import config from '../../site.config.json';
import { EDITION } from './site-config';
import { EditionBadge } from './EditionBadge';

describe('판 이름표 — 한 곳에서 나온다', () => {
    it('EDITION 은 site.config.json 값이고 이름이 1.2v 꼴이다', () => {
        expect(EDITION).toEqual(config.edition);
        expect(EDITION.appName).toBe('시간표 짜기 1.2v');
        expect(EDITION.shortName).toBe('시간표 1.2v');
    });
    it('배지는 EDITION.badge 문구를 그린다', () => {
        expect(renderToStaticMarkup(createElement(EditionBadge))).toContain(EDITION.badge);
    });
    it('vite.config 는 manifest·title 을 EDITION 에서 받고 리터럴로 안 적는다', () => {
        const v = readFileSync('vite.config.ts', 'utf-8');
        expect(v).toMatch(/name: EDITION\.appName/);
        expect(v).toMatch(/short_name: EDITION\.shortName/);
        expect(v).toMatch(/<title>\$\{EDITION\.appName\}/);
        expect(v).not.toMatch(/name: '시간표/);
    });
    it('index.html 의 자리 표시 title 도 같은 값', () => {
        const h = readFileSync('index.html', 'utf-8');
        expect(h).toContain(`<title>${EDITION.appName}</title>`);
        expect(h).toContain(`web-app-title" content="${EDITION.shortName}"`);
    });
});
