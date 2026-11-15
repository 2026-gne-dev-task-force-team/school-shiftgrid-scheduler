import { describe, it, expect } from 'vitest';
import { tabWidthCls } from './tab-width';

describe('탭 폭 규칙', () => {
    it('사이드바 탭은 줄어들지 않는다(shrink-0) — 밀도가 커져도 「속..」으로 잘리지 않게', () => {
        const c = tabWidthCls(true).split(' ');
        expect(c).toContain('shrink-0');
        expect(c).not.toContain('shrink');
        expect(c).not.toContain('min-w-0');
    });
    it('긴 제목은 160px 에서 줄임표로 자른다', () => {
        expect(tabWidthCls(true)).toContain('max-w-[160px]');
    });
    it('가운데 탭 규칙은 그대로', () => {
        expect(tabWidthCls(false)).toBe('min-w-[96px] max-w-[200px] shrink-0');
    });
});
