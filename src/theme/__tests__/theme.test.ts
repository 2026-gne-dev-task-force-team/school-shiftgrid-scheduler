/**
 * 테마 층 검사.
 *   ① 토큰 대조 — tokens.ts 의 토큰 이름과 index.css 의 --c-*·--s-* 가 "정확히" 같다
 *      (두 벌이 따로 낡는 것을 막는다 — 이름이 하나라도 어긋나면 빨간불)
 *   ② 설정 받아들이기 — 모양 틀린 저장값은 그 칸만 기본값으로 떨어진다
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COLOR_TOKENS, SIZE_TOKENS } from '../tokens';
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
        const s = normalizeThemeSettings({ mode: 'dark', density: '엉뚱', accent: '없는색' });
        expect(s.mode).toBe('dark');              // 성한 칸은 산다
        expect(s.density).toBe(defaultThemeSettings().density);  // 틀린 칸 → 기본
        expect(s.accent).toBe(defaultThemeSettings().accent);   // 모르는 프리셋 → 기본
    });
    it('아는 프리셋 id 는 받는다', () => {
        expect(normalizeThemeSettings({ accent: 'green' }).accent).toBe('green');
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
        const once: ThemeSettings = normalizeThemeSettings({ mode: 'light', density: 'compact', accent: 'red' });
        expect(normalizeThemeSettings(once)).toEqual(once);
    });
});
