/**
 * 상태색 대비 검사 — 모든 프리셋 × (밝게/어둡게) 에서 bad·warn·accent·ok 글자가
 * 바탕 넷(side·bg·panel·panel2) 위에서 WCAG 대비 4.5 이상이다. 누가 색을 바꿔도 여기서 빨개진다.
 * 또 index.css 의 첫 화면 기본값(--c-*)이 notion-light/notion-dark 와 값까지 같은지 묶는다
 *   (원본은 tokens.ts — applyTheme 이 실행 때 그 값을 꽂는다. CSS 는 JS 가 뜨기 전 깜빡임 방지용 사본).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COLOR_TOKENS, THEMES } from '../tokens';

const STATUS = ['bad', 'warn', 'accent', 'ok'] as const;
const BACKS = ['side', 'bg', 'panel', 'panel2'] as const;

function lin(c: number): number {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function lum(t: string): number {
    const [r, g, b] = t.trim().split(/\s+/).map(Number);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
export function contrast(a: string, b: string): number {
    const x = lum(a); const y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe('상태색 × 바탕 대비 ≥ 4.5', () => {
    for (const t of THEMES) {
        for (const s of STATUS) {
            it(`${t.id} ${s}`, () => {
                for (const b of BACKS) {
                    const c = contrast(t.palette[s], t.palette[b]);
                    expect(c, `${t.id} ${s} on ${b} = ${c.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
                }
            });
        }
    }
});

describe('index.css 기본값 = tokens.ts 노션 프리셋', () => {
    const css = readFileSync(resolve(process.cwd(), 'src', 'index.css'), 'utf-8');
    const cut = css.indexOf('@media (prefers-color-scheme: dark)');
    const read = (seg: string) => {
        const m: Record<string, string> = {};
        for (const x of seg.matchAll(/--c-([a-z0-9]+):\s*(\d+ \d+ \d+);/g)) m[x[1]] = x[2];
        return m;
    };
    const cases: [string, Record<string, string>][] = [
        ['notion-light', read(css.slice(0, cut))],
        ['notion-dark', read(css.slice(cut))],
    ];
    for (const [id, vals] of cases) {
        it(`${id} 값이 같다`, () => {
            const p = THEMES.find((t) => t.id === id)!.palette;
            for (const k of COLOR_TOKENS) expect(vals[k], `${id} ${k}`).toBe(p[k]);
        });
    }
});
