/**
 * 폭 가두기 + 뷰 힌트 — 순수 계산 검산.
 *   ① 하한이 실제로 선다 (쥔님: "무한정 줄일 수 있게 하지 말고") — 🔴 버그 심기 지점
 *   ② 유효 최소폭 = 설정 최소와 뷰 최소 중 큰 값
 *   ③ collapse 판정은 squeeze·collapseBelow 둘 다 맞을 때만
 *   ④ 레이아웃 합치기 — 덮어쓰기는 준 칸만 덮는다
 *   ⑤ 스플릿 쌍 가두기 — px 최소를 비율로 환산해 두 칸 다 살린다
 */
import { describe, it, expect } from 'vitest';
import {
    effectiveMin, clampWidthTo, isCollapsed, mergeLayout, clampSplitPair,
    type ViewLayout,
} from './clamp';

describe('① 폭 가두기 — 하한·상한', () => {
    it('하한 아래로는 안 내려간다', () => {
        expect(clampWidthTo(0, 150, 520)).toBe(150);
        expect(clampWidthTo(-999, 150, 520)).toBe(150);
    });
    it('상한 위로는 안 올라간다', () => {
        expect(clampWidthTo(99999, 150, 520)).toBe(520);
    });
    it('가운데는 그대로(반올림)', () => {
        expect(clampWidthTo(240.4, 150, 520)).toBe(240);
    });
    it('숫자가 아니면 하한', () => {
        expect(clampWidthTo(Number.NaN, 150, 520)).toBe(150);
    });
    it('min>max 로 들어와도 서로 바꿔 방어한다', () => {
        expect(clampWidthTo(300, 520, 150)).toBe(300);
        expect(clampWidthTo(0, 520, 150)).toBe(150);
    });
});

describe('② 유효 최소폭', () => {
    it('뷰 힌트가 더 크면 뷰가 이긴다', () => {
        expect(effectiveMin(150, 300)).toBe(300);
    });
    it('뷰 힌트가 없거나 작으면 설정값', () => {
        expect(effectiveMin(150, undefined)).toBe(150);
        expect(effectiveMin(150, 100)).toBe(150);
    });
    it('설정값이 숫자가 아니면 0 취급', () => {
        expect(effectiveMin(Number.NaN, 120)).toBe(120);
    });
});

describe('③ collapse 판정', () => {
    const lay: ViewLayout = { squeeze: 'collapse', collapseBelow: 480 };
    it('collapse + 폭이 기준 아래면 접힌다', () => {
        expect(isCollapsed(lay, 400)).toBe(true);
    });
    it('기준 이상이면 안 접힌다', () => {
        expect(isCollapsed(lay, 480)).toBe(false);
        expect(isCollapsed(lay, 700)).toBe(false);
    });
    it('squeeze 가 collapse 가 아니면 절대 안 접힌다', () => {
        expect(isCollapsed({ squeeze: 'scroll', collapseBelow: 480 }, 100)).toBe(false);
        expect(isCollapsed({ squeeze: 'shrink' }, 10)).toBe(false);
        expect(isCollapsed(undefined, 10)).toBe(false);
    });
    it('collapseBelow 가 없으면 안 접힌다', () => {
        expect(isCollapsed({ squeeze: 'collapse' }, 10)).toBe(false);
    });
});

describe('④ 레이아웃 합치기', () => {
    it('덮어쓰기는 준 칸만 덮는다', () => {
        const base: ViewLayout = { minWidth: 200, squeeze: 'scroll', collapseBelow: 480 };
        const m = mergeLayout(base, { minWidth: 360 });
        expect(m).toEqual({ minWidth: 360, squeeze: 'scroll', collapseBelow: 480 });
    });
    it('undefined 덮어쓰기는 아래 값을 안 지운다', () => {
        const base: ViewLayout = { minWidth: 200 };
        expect(mergeLayout(base, undefined)).toEqual({ minWidth: 200 });
        expect(mergeLayout(base, {})).toEqual({ minWidth: 200 });
    });
    it('base 가 없어도 선다', () => {
        expect(mergeLayout(undefined, { squeeze: 'collapse' })).toEqual({ squeeze: 'collapse' });
    });
});

describe('⑤ 스플릿 쌍 가두기', () => {
    // 쌍 합 0.6 을 두 칸이 나눈다. 전체 1000px, 왼쪽 최소 300px(=0.3), 오른쪽 최소 200px(=0.2)
    it('왼쪽을 너무 키우면 오른쪽 최소에 막힌다', () => {
        const a = clampSplitPair(0.6, 0.55, 1000, 300, 200, 0.05);
        expect(a).toBeCloseTo(0.4);   // 0.6 − 0.2
    });
    it('왼쪽을 너무 줄이면 왼쪽 최소에 막힌다', () => {
        const a = clampSplitPair(0.6, 0.1, 1000, 300, 200, 0.05);
        expect(a).toBeCloseTo(0.3);
    });
    it('가운데면 그대로', () => {
        expect(clampSplitPair(0.6, 0.35, 1000, 300, 200, 0.05)).toBeCloseTo(0.35);
    });
    it('total 0 이하면 px 가둠을 건너뛰고 비율 하한만', () => {
        expect(clampSplitPair(0.6, 0.01, 0, 300, 200, 0.05)).toBeCloseTo(0.05);
    });
    it('두 최소가 합을 넘으면 반반으로(둘 다 살린다)', () => {
        expect(clampSplitPair(0.4, 0.1, 1000, 300, 200, 0.05)).toBeCloseTo(0.2);
    });
});
