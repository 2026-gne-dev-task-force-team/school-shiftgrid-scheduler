/**
 * 테마 층 검사.
 *   ① 토큰 대조 — tokens.ts 의 토큰 이름과 index.css 의 --c-*·--s-* 가 "정확히" 같다
 *      (두 벌이 따로 낡는 것을 막는다 — 이름이 하나라도 어긋나면 빨간불)
 *   ② 설정 받아들이기 — 모양 틀린 저장값은 그 칸만 기본값으로 떨어진다
 *   ③ 프리셋 완전성 — 🔴 모든 테마 프리셋이 색 11종을 다 갖고, 값이 "r g b" 꼴이다(W10)
 *   ④ 모드 짝 — 밝기 짝이 있는 테마는 mode 를 따라 바뀌고, 짝이 없으면 그대로다
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COLOR_TOKENS, SIZE_TOKENS, THEMES, DENSITIES, FONT_SIZES, densityScale, presetForMode } from '../tokens';
import {
    defaultThemeSettings, normalizeThemeSettings, type ThemeSettings,
} from '../settings';

const css = readFileSync(resolve(process.cwd(), 'src', 'index.css'), 'utf-8');

/** index.css 에서 --<prefix>-<이름>: 로 "정의된" 토큰 이름을 모은다(값 안의 var() 참조는 안 센다) */
function cssTokenNames(prefix: string): string[] {
    const re = new RegExp(`--${prefix}-([a-z0-9]+)\\s*:`, 'g');
    const set = new Set<string>();
    for (const m of css.matchAll(re)) set.add(m[1]);
    return [...set].sort();
}

describe('① 토큰 이름이 tokens.ts 와 index.css 에서 같다', () => {
    it('색 토큰(--c-*) 이름이 정확히 일치한다', () => {
        expect(cssTokenNames('c')).toEqual([...COLOR_TOKENS].sort());
    });
    it('치수 토큰(--s-*) 이름이 정확히 일치한다', () => {
        expect(cssTokenNames('s')).toEqual([...SIZE_TOKENS].sort());
    });
});

describe('② 설정 받아들이기', () => {
    it('빈 값·엉뚱한 값은 전부 기본값', () => {
        expect(normalizeThemeSettings(null)).toEqual(defaultThemeSettings());
        expect(normalizeThemeSettings('어둡게')).toEqual(defaultThemeSettings());
        expect(normalizeThemeSettings(42)).toEqual(defaultThemeSettings());
    });
    it('칸 하나만 성하면 그 칸만 살린다', () => {
        const s = normalizeThemeSettings({ mode: 'dark', density: '엉뚱', theme: '없는테마' });
        expect(s.mode).toBe('dark');              // 성한 칸은 산다
        expect(s.density).toBe(defaultThemeSettings().density);  // 틀린 칸 → 기본
        expect(s.theme).toBe(defaultThemeSettings().theme);     // 모르는 프리셋 → 기본
    });
    it('아는 테마 id 는 받는다', () => {
        expect(normalizeThemeSettings({ theme: 'nord' }).theme).toBe('nord');
        expect(normalizeThemeSettings({ theme: 'github-dark' }).theme).toBe('github-dark');
    });
    it('custom 은 아는 토큰 + 성한 "r g b" 값만 추린다', () => {
        const s = normalizeThemeSettings({ custom: { accent: '10 20 30', 없는키: 'x', bg: '빨강' } });
        expect(s.custom).toEqual({ accent: '10 20 30' });
    });
    it('custom 이 전부 틀리면 undefined', () => {
        const s = normalizeThemeSettings({ custom: { bg: 'nope' } });
        expect(s.custom).toBeUndefined();
    });
    it('받아들인 값은 다시 넣어도 그대로다(멱등)', () => {
        const once: ThemeSettings = normalizeThemeSettings({ mode: 'light', density: 'compact', theme: 'dracula' });
        expect(normalizeThemeSettings(once)).toEqual(once);
    });
});

describe('③ 모든 테마 프리셋이 색 11종을 다 갖는다', () => {
    const TRIPLET = /^\d{1,3} \d{1,3} \d{1,3}$/;
    // 🔴 기대 목록 — 요구명세가 든 9개(하나라도 빠지면 빨간불)
    const EXPECTED = [
        'notion-light', 'notion-dark', 'obsidian',
        'github-light', 'github-dark', 'solarized-light', 'solarized-dark',
        'nord', 'dracula',
    ].sort();

    it('요구명세의 9개 프리셋이 전부 있다', () => {
        expect(THEMES.map((t) => t.id).sort()).toEqual(EXPECTED);
    });

    for (const t of THEMES) {
        it(`${t.id} 가 11종을 다 갖고 값이 "r g b" 꼴이다`, () => {
            expect(Object.keys(t.palette).sort()).toEqual([...COLOR_TOKENS].sort());
            for (const tok of COLOR_TOKENS) {
                expect(t.palette[tok], `${t.id}.${tok}`).toMatch(TRIPLET);
            }
        });
    }

    it('짝(pairId)은 실제로 있는 프리셋을 가리킨다', () => {
        for (const t of THEMES) {
            if (t.pairId) expect(THEMES.some((p) => p.id === t.pairId), `${t.id}→${t.pairId}`).toBe(true);
        }
    });
});

describe('④ 모드 짝', () => {
    it('밝기 짝이 있는 테마는 mode 를 따라 바뀐다', () => {
        expect(presetForMode('notion-light', 'dark').id).toBe('notion-dark');
        expect(presetForMode('notion-dark', 'light').id).toBe('notion-light');
        expect(presetForMode('github-light', 'dark').id).toBe('github-dark');
    });
    it('같은 밝기면 그대로다', () => {
        expect(presetForMode('notion-light', 'light').id).toBe('notion-light');
    });
    it('짝이 없는 테마는 자기 밝기면 그대로, 밝기가 안 맞으면 노션 짝으로 떨어진다', () => {
        expect(presetForMode('nord', 'dark').id).toBe('nord');
        expect(presetForMode('nord', 'light').id).toBe('notion-light');
        expect(presetForMode('dracula', 'light').id).toBe('notion-light');
        expect(presetForMode('obsidian', 'light').id).toBe('notion-light');
    });
});

describe('⑤ 밀도·글자 크기 단계 (W11)', () => {
    it('밀도 4단계 — 빽빽은 옛 값 그대로, 나머지는 단계마다 커진다', () => {
        expect(DENSITIES.map((d) => d.id)).toEqual(['compact', 'normal', 'cozy', 'roomy']);
        expect(DENSITIES.map((d) => d.scale)).toEqual([0.85, 1.1, 1.22, 1.36]);
        expect(densityScale('cozy')).toBeGreaterThan(1);   // 옛 여유(1)보다 넓다
    });
    it('옛 저장값 cozy/compact 는 그대로 이어 읽고, 글자 크기 칸이 없으면 보통', () => {
        const a = normalizeThemeSettings({ mode: 'light', density: 'cozy', theme: 'dracula' });
        expect(a.density).toBe('cozy');
        expect(a.fontSize).toBe('normal');
        expect(normalizeThemeSettings({ density: 'compact' }).density).toBe('compact');
        expect(normalizeThemeSettings({ fontSize: '엉뚱' }).fontSize).toBe('normal');
        expect(normalizeThemeSettings({ fontSize: 'xlarge' }).fontSize).toBe('xlarge');
    });
    it('글자 4단계 배율 · 기본 보통(본문 14px × 1)', () => {
        expect(FONT_SIZES.map((f) => f.scale)).toEqual([0.9, 1, 1.15, 1.3]);
        expect(css).toMatch(/--fs-body:\s*calc\(14px \* var\(--fs-scale\)\)/);
    });
});
