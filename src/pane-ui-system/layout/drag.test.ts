/**
 * 존 판정 순수 함수 검사 — 가장자리 25% 띠·탭 가운데 선·경계값을 두껍게 집는다.
 * 🔴 버그 심기 지점: paneZone 의 BAND 비교(안쪽/바깥쪽)를 뒤집으면 여기 경계 테스트가 깨진다.
 */
import { describe, it, expect } from 'vitest';
import { paneZone, tabDropSide, EDGE_BAND, type Rect } from './drag';

// 100×100 칸, 왼위 모서리 (0,0) — rx·ry 가 px·py 와 같아 읽기 쉽다
const R: Rect = { left: 0, top: 0, width: 100, height: 100 };

describe('paneZone — 가운데 50% 는 center', () => {
    it('정중앙', () => { expect(paneZone(50, 50, R)).toBe('center'); });
    it('안쪽(가운데 띠 안) 네 점이 전부 center', () => {
        expect(paneZone(30, 50, R)).toBe('center');   // rx 0.30 > 0.25
        expect(paneZone(70, 50, R)).toBe('center');
        expect(paneZone(50, 30, R)).toBe('center');
        expect(paneZone(50, 70, R)).toBe('center');
    });
});

describe('paneZone — 바깥 25% 띠는 4방', () => {
    it('왼쪽 띠', () => { expect(paneZone(10, 50, R)).toBe('left'); });
    it('오른쪽 띠', () => { expect(paneZone(90, 50, R)).toBe('right'); });
    it('위 띠', () => { expect(paneZone(50, 10, R)).toBe('up'); });
    it('아래 띠', () => { expect(paneZone(50, 90, R)).toBe('down'); });
});

describe('paneZone — 경계값(정확히 25%는 center, 미만은 가장자리)', () => {
    it('rx=0.25 정확히 → center (바깥 띠는 미만)', () => {
        expect(paneZone(25, 50, R)).toBe('center');
        expect(paneZone(75, 50, R)).toBe('center');
    });
    it('rx=0.249 → left · 0.751 → right (턱걸이로 가장자리)', () => {
        expect(paneZone(24.9, 50, R)).toBe('left');
        expect(paneZone(75.1, 50, R)).toBe('right');
    });
    it('ry 축도 같다', () => {
        expect(paneZone(50, 25, R)).toBe('center');
        expect(paneZone(50, 24.9, R)).toBe('up');
    });
});

describe('paneZone — 모서리는 더 가까운 변이 이긴다', () => {
    it('왼위 아주 구석 → 동률이면 left 우선', () => {
        expect(paneZone(5, 5, R)).toBe('left');     // dl=dt=0.05 동률 → left
    });
    it('왼쪽에 더 붙은 구석 → left', () => {
        expect(paneZone(3, 10, R)).toBe('left');    // dl=0.03 < dt=0.10
    });
    it('위에 더 붙은 구석 → up', () => {
        expect(paneZone(10, 3, R)).toBe('up');      // dt=0.03 < dl=0.10
    });
    it('오른아래 구석 → 동률이면 right 우선(right 가 down 보다 먼저)', () => {
        expect(paneZone(95, 95, R)).toBe('right');  // dr=db=0.05 → right
    });
});

describe('paneZone — 오프셋 사각형에서도 맞다(left/top 이 0 이 아닐 때)', () => {
    const O: Rect = { left: 200, top: 100, width: 400, height: 200 };
    it('가운데', () => { expect(paneZone(400, 200, O)).toBe('center'); });
    it('왼쪽 띠(200~300 사이가 25%)', () => { expect(paneZone(240, 200, O)).toBe('left'); });
    it('오른쪽 띠', () => { expect(paneZone(560, 200, O)).toBe('right'); });
    it('아래 띠', () => { expect(paneZone(400, 290, O)).toBe('down'); });
});

describe('paneZone — 망가진 사각형은 center(0 나눗셈 방어)', () => {
    it('폭 0', () => { expect(paneZone(5, 5, { left: 0, top: 0, width: 0, height: 100 })).toBe('center'); });
});

describe('tabDropSide — 가운데 선 기준 before/after', () => {
    const r = { left: 100, width: 80 };   // 100..180, 가운데 140
    it('왼쪽 절반 → before', () => { expect(tabDropSide(110, r)).toBe('before'); });
    it('오른쪽 절반 → after', () => { expect(tabDropSide(170, r)).toBe('after'); });
    it('경계: 정확히 가운데 → after(왼쪽은 미만)', () => { expect(tabDropSide(140, r)).toBe('after'); });
    it('경계: 가운데 직전 → before', () => { expect(tabDropSide(139.9, r)).toBe('before'); });
    it('폭 0 방어 → after', () => { expect(tabDropSide(0, { left: 0, width: 0 })).toBe('after'); });
});

describe('상수', () => {
    it('EDGE_BAND 는 0.25', () => { expect(EDGE_BAND).toBe(0.25); });
});
