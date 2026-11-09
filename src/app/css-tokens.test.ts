/**
 * CSS 토큰 — 자기 참조(--x: var(--x))는 계산 시 무효가 되어 움직임이 죽는다(R1 토큰화 사고).
 * 모든 src/**\/*.css 에서 자기 참조 0, 움직임 토큰은 시간값.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function cssFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? cssFiles(p) : p.endsWith('.css') ? [p] : [];
    });
}
const files = cssFiles(join(process.cwd(), 'src'));
const decls = files.flatMap((f) =>
    [...readFileSync(f, 'utf8').matchAll(/(--[\w-]+)\s*:\s*([^;}]*)/g)].map((m) => ({ f, name: m[1], val: m[2].trim() })),
);

describe('css tokens', () => {
    it('css 파일이 있다', () => expect(files.length).toBeGreaterThan(0));
    it('자기 참조 변수가 없다', () => {
        const bad = decls.filter((d) => d.val.includes(`var(${d.name})`));
        expect(bad.map((d) => `${d.name}: ${d.val}`)).toEqual([]);
    });
    it.each(['--motion-fast', '--motion-base', '--motion-slow'])('%s 는 시간값', (n) => {
        const d = decls.filter((x) => x.name === n);
        expect(d.length).toBeGreaterThan(0);
        for (const x of d) expect(x.val).toMatch(/^\d*\.?\d+m?s$/);
    });
});
