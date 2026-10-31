/**
 * 옆 패널 폭·접힘 — 순수 계산 검산.
 *   ① 폭은 상·하한 안에 갇힌다 (끌다가 패널이 사라지거나 화면을 먹지 않는다)
 *   ② 왼쪽·오른쪽이 서로 반대 방향으로 자란다
 *   ③ 망가진 저장값을 먹어도 기본값으로 선다
 *   ④ 좁은 화면에선 서랍이 한 번에 하나만 열린다
 */
import { describe, it, expect } from 'vitest';
import {
    MIN_PANEL, MAX_PANEL, DEFAULT_LEFT, DEFAULT_RIGHT,
    clampWidth, defaultPanels, normalizePanels, openOne, widthFromDrag,
} from './panels';

describe('① 폭 가두기', () => {
    it('하한 아래로는 안 내려간다', () => {
        expect(clampWidth(0)).toBe(MIN_PANEL);
        expect(clampWidth(-500)).toBe(MIN_PANEL);
    });
    it('상한 위로는 안 올라간다', () => {
        expect(clampWidth(99999)).toBe(MAX_PANEL);
    });
    it('가운데 값은 그대로(반올림)', () => {
        expect(clampWidth(240.4)).toBe(240);
    });
    it('숫자가 아니면 기본 폭', () => {
        expect(clampWidth(Number.NaN)).toBe(DEFAULT_LEFT);
    });
});

describe('② 끄는 방향', () => {
    it('왼쪽 패널은 오른쪽으로 끌면 넓어진다', () => {
        expect(widthFromDrag('left', 200, +50)).toBe(250);
        expect(widthFromDrag('left', 200, -50)).toBe(150);
    });
    it('오른쪽 패널은 왼쪽으로 끌면 넓어진다 (방향이 뒤집힌다)', () => {
        expect(widthFromDrag('right', 200, -50)).toBe(250);
        expect(widthFromDrag('right', 200, +50)).toBe(150);
    });
    it('끌다 넘겨도 가둬진다', () => {
        expect(widthFromDrag('left', 200, -9999)).toBe(MIN_PANEL);
        expect(widthFromDrag('right', 200, -9999)).toBe(MAX_PANEL);
    });
});

describe('③ 저장값 받아들이기', () => {
    it('빈 값·엉뚱한 값은 기본값', () => {
        expect(normalizePanels(null)).toEqual(defaultPanels());
        expect(normalizePanels('열림')).toEqual(defaultPanels());
        expect(normalizePanels(42)).toEqual(defaultPanels());
    });
    it('칸 하나만 성하면 그 칸만 살린다', () => {
        const s = normalizePanels({ leftW: 300, rightOpen: 'yes' });
        expect(s.leftW).toBe(300);
        expect(s.rightW).toBe(DEFAULT_RIGHT);   // 없는 칸 → 기본
        expect(s.rightOpen).toBe(true);          // 모양이 틀린 칸 → 기본
    });
    it('말도 안 되는 폭이 저장돼 있어도 가둬서 읽는다', () => {
        expect(normalizePanels({ leftW: 5000 }).leftW).toBe(MAX_PANEL);
    });
});

describe('④ 좁은 화면 — 한 번에 하나', () => {
    const both = { ...defaultPanels(), leftOpen: true, rightOpen: true };
    it('왼쪽을 열면 오른쪽이 닫힌다', () => {
        const s = openOne(both, 'left', true);
        expect(s.leftOpen).toBe(true);
        expect(s.rightOpen).toBe(false);
    });
    it('오른쪽을 열면 왼쪽이 닫힌다', () => {
        const s = openOne(both, 'right', true);
        expect(s.rightOpen).toBe(true);
        expect(s.leftOpen).toBe(false);
    });
    it('닫을 때는 다른 쪽을 안 건드린다', () => {
        const s = openOne(both, 'left', false);
        expect(s.leftOpen).toBe(false);
        expect(s.rightOpen).toBe(true);
    });
    it('폭은 여닫기로 안 바뀐다', () => {
        const s = openOne(both, 'left', false);
        expect(s.leftW).toBe(both.leftW);
        expect(s.rightW).toBe(both.rightW);
    });
});
