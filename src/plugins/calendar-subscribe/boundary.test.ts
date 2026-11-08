/**
 * 꾸러미 경계 — 「달력 폴더에 구독 코드 0」(쥔님 2026-11-08: 달력은 남의 플러그인을 모른다).
 *   달력 폴더(src/plugins/calendar/**)에 링크 구독 전용 낱말(fetch·webcal·calendar-subscribe)이 0이어야 한다.
 *   (달력이 내주는 범용 registerSource·parseIcs 는 「구독 코드」가 아니라 입구다 — 그건 안 센다.)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const CAL = resolve(process.cwd(), 'src', 'plugins', 'calendar');

function walk(dir: string): string[] {
    let out: string[] = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) out = out.concat(walk(p));
        else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
    }
    return out;
}

describe('달력 폴더에 구독 코드 0', () => {
    const BANNED = ['calendar-subscribe', 'fetchIcs', 'webcal'];
    const files = walk(CAL);
    it('스캔할 달력 파일이 있다', () => { expect(files.length).toBeGreaterThan(0); });
    for (const f of files) {
        it(`구독 전용 낱말 없음: ${f.slice(CAL.length + 1)}`, () => {
            const src = readFileSync(f, 'utf-8');
            const hit = BANNED.filter((w) => src.includes(w));
            expect(hit, `달력 파일에 구독 전용 낱말이 들어왔다: ${hit.join(', ')}`).toEqual([]);
        });
    }
});
