import { describe, expect, it } from 'vitest';
import { PEEK_OVERLAY_MIN, PEEK_PUSH_MIN, peekModeFor } from './PeekLayer';

describe('peekModeFor — 밀기 / 겹침 / 아래 시트', () => {
    it('넓으면 밀고, 중간이면 오른쪽에 겹치고, 좁을 때만 아래 시트', () => {
        expect(peekModeFor(PEEK_PUSH_MIN + 100)).toBe('push');
        expect(peekModeFor(PEEK_PUSH_MIN - 1)).toBe('overlay');
        expect(peekModeFor(PEEK_OVERLAY_MIN)).toBe('overlay');
        expect(peekModeFor(PEEK_OVERLAY_MIN - 1)).toBe('bottom');
        expect(peekModeFor(390)).toBe('bottom');
    });
    it('뷰가 wideMin 을 크게 주면 그 폭까지는 밀지 않고 겹친다', () => {
        expect(peekModeFor(900, 1000)).toBe('overlay');
    });
});
