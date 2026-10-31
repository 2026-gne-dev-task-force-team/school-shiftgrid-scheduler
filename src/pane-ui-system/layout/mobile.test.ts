/**
 * 좁은 화면 손짓·하단 바 배치 — 순수 계산 검산.
 *   ① 방향 잠금: 데드존 안이면 판정 보류 · 가로가 세로보다 커야 'horizontal'
 *   ② 가장자리 띠: 20px 안쪽에서만 서랍이 잡힌다
 *   ③ 진행도: side·열기/닫기에 따라 부호가 맞고 0..1 로 갇힌다
 *   ④ 절반 확정: 0.5 이상이면 열림(버그 심기 지점)
 *   ⑤ 바 항목 가르기: pinned 는 오른쪽 고정, 순서 보존
 */
import { describe, it, expect } from 'vitest';
import {
    SWIPE_EDGE, SWIPE_DEADZONE,
    classifySwipe, edgeStart, swipeProgress, settleOpen, splitBarItems,
} from './mobile';

describe('① 방향 잠금(세로 스크롤과 안 싸우게)', () => {
    it('데드존 안에서는 아직 판정하지 않는다', () => {
        expect(classifySwipe(0, 0)).toBe('none');
        expect(classifySwipe(SWIPE_DEADZONE - 1, SWIPE_DEADZONE - 1)).toBe('none');
    });
    it('가로가 세로보다 크면 가로 스와이프', () => {
        expect(classifySwipe(20, 5)).toBe('horizontal');
        expect(classifySwipe(-20, 5)).toBe('horizontal');
    });
    it('세로가 더 크면(또는 같으면) 세로 스크롤 — 서랍이 안 잡힌다', () => {
        expect(classifySwipe(5, 20)).toBe('vertical');
        expect(classifySwipe(12, 12)).toBe('vertical');   // 애매하면 스크롤 쪽으로
    });
});

describe('② 가장자리 띠는 20px 만', () => {
    const W = 390;
    it('왼쪽 끝 20px 안', () => {
        expect(edgeStart(0, W)).toBe('left');
        expect(edgeStart(SWIPE_EDGE, W)).toBe('left');
    });
    it('오른쪽 끝 20px 안', () => {
        expect(edgeStart(W, W)).toBe('right');
        expect(edgeStart(W - SWIPE_EDGE, W)).toBe('right');
    });
    it('가운데(띠 바깥)는 아무것도 아니다 — 본문·시트를 안 가로챈다', () => {
        expect(edgeStart(200, W)).toBeNull();
        expect(edgeStart(SWIPE_EDGE + 1, W)).toBeNull();
    });
});

describe('③ 진행도 — side·열기/닫기 부호', () => {
    const W = 300;
    it('왼쪽 열기: 오른쪽으로 끌수록 는다', () => {
        expect(swipeProgress('left', true, 0, W)).toBe(0);
        expect(swipeProgress('left', true, 150, W)).toBeCloseTo(0.5);
        expect(swipeProgress('left', true, 600, W)).toBe(1);   // 1 초과는 갇힌다
    });
    it('오른쪽 열기: 왼쪽으로 끌수록 는다', () => {
        expect(swipeProgress('right', true, -150, W)).toBeCloseTo(0.5);
        expect(swipeProgress('right', true, 150, W)).toBe(0);  // 반대로 끌면 0
    });
    it('왼쪽 닫기: 바깥(왼쪽)으로 끌수록 1 에서 준다', () => {
        expect(swipeProgress('left', false, 0, W)).toBe(1);
        expect(swipeProgress('left', false, -150, W)).toBeCloseTo(0.5);
    });
    it('폭을 아직 못 재면(0) 지금 상태를 지킨다 — NaN 안 난다', () => {
        expect(swipeProgress('left', true, 100, 0)).toBe(0);
        expect(swipeProgress('left', false, 100, 0)).toBe(1);
    });
});

describe('④ 절반 확정', () => {
    it('0.5 이상이면 열림', () => {
        expect(settleOpen(0.5)).toBe(true);
        expect(settleOpen(0.8)).toBe(true);
    });
    it('0.5 미만이면 되돌아간다(닫힘)', () => {
        expect(settleOpen(0.49)).toBe(false);
        expect(settleOpen(0)).toBe(false);
    });
});

describe('⑤ 바 항목 가르기(고정/스크롤)', () => {
    it('pinned 는 오른쪽 묶음, 나머지는 스크롤 묶음 — 순서 보존', () => {
        const items = [
            { id: 'a' },
            { id: 'b', pinned: true },
            { id: 'c' },
            { id: 'd', pinned: true },
        ];
        const { scroll, pinned } = splitBarItems(items);
        expect(scroll.map((i) => i.id)).toEqual(['a', 'c']);
        expect(pinned.map((i) => i.id)).toEqual(['b', 'd']);
    });
    it('고정이 없으면 전부 스크롤', () => {
        const plain: { id: string; pinned?: boolean }[] = [{ id: 'x' }, { id: 'y' }];
        const { scroll, pinned } = splitBarItems(plain);
        expect(scroll).toHaveLength(2);
        expect(pinned).toHaveLength(0);
    });
});
