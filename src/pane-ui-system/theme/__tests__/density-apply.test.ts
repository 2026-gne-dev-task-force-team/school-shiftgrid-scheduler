// @vitest-environment jsdom
/** W11 — applyTheme 이 밀도·글자 배율을 루트에 꽂는다(단계별 변수 값) */
import { describe, it, expect } from 'vitest';
import { applyTheme } from '../apply';
import { defaultThemeSettings } from '../settings';
import { DENSITIES, FONT_SIZES } from '../tokens';

describe('단계별 변수 값', () => {
    it.each(DENSITIES)('밀도 $id → --density $scale', (d) => {
        applyTheme({ ...defaultThemeSettings(), density: d.id });
        expect(document.documentElement.style.getPropertyValue('--density')).toBe(String(d.scale));
        expect(document.documentElement.dataset.density).toBe(d.id);
    });
    it.each(FONT_SIZES)('글자 $id → --fs-scale $scale', (f) => {
        applyTheme({ ...defaultThemeSettings(), fontSize: f.id });
        expect(document.documentElement.style.getPropertyValue('--fs-scale')).toBe(String(f.scale));
    });
});
