/**
 * scroll-math 검산 — 날짜↔offset↔스크롤 위치 변환(순수). React·DOM 0.
 *   🔴 핵심: offsetToScroll 이 `- rangeFrom` 을 지켜야 「2024년으로 튀던」 버그가 안 난다(아래 두 번째 묶음).
 *   그리고 한 anchor 를 네 뷰가 공유해도 같은 날을 가리킨다는 걸(뷰 전환 시 날짜 유지) 변환의 일관성으로 잰다.
 */
import { describe, it, expect } from 'vitest';
import { offsetToScroll, weekOffsetBetween, dayOffsetBetween } from './scroll-math';

describe('offsetToScroll — offset 을 스크롤 위치(px)로', () => {
    it('(offset − rangeFrom) × 칸크기', () => {
        expect(offsetToScroll(10, -104, 80)).toBe((10 - -104) * 80);   // 9120
        expect(offsetToScroll(0, 0, 50)).toBe(0);
        expect(offsetToScroll(3, 1, 120)).toBe(240);
    });

    it('🔴 범위가 과거로 깔려 있어도 anchor(offset 0) 는 그 범위 시작이 아니라 제자리로 간다', () => {
        // range.from = -104(2년 전)일 때 offset 0(오늘 주)은 104칸 아래여야 한다 — 0 이면 맨 위(과거)로 튄다(버그)
        expect(offsetToScroll(0, -104, 80)).toBe(104 * 80);
        expect(offsetToScroll(0, -104, 80)).not.toBe(0);
    });
});

describe('weekOffsetBetween — 두 날이 든 주의 거리(주)', () => {
    it('같은 주면 0', () => {
        expect(weekOffsetBetween(new Date(2026, 10, 1), new Date(2026, 10, 7))).toBe(0);   // 11/1(일)~11/7(토) 같은 주
    });
    it('다음 주는 +1, 지난 주는 -1', () => {
        expect(weekOffsetBetween(new Date(2026, 10, 1), new Date(2026, 10, 8))).toBe(1);
        expect(weekOffsetBetween(new Date(2026, 10, 8), new Date(2026, 10, 1))).toBe(-1);
    });
    it('몇 달 뒤도 정수 주로', () => {
        // 2026-11-01(일) → 2027-03-01 까지 몇 주인지는 startOfWeek 거리로 결정적
        const off = weekOffsetBetween(new Date(2026, 10, 1), new Date(2027, 2, 1));
        expect(Number.isInteger(off)).toBe(true);
        expect(off).toBeGreaterThan(0);
    });
});

describe('dayOffsetBetween — 두 날의 거리(일)', () => {
    it('같은 날 0 · 하루 뒤 1 · 하루 앞 -1', () => {
        expect(dayOffsetBetween(new Date(2026, 10, 1), new Date(2026, 10, 1))).toBe(0);
        expect(dayOffsetBetween(new Date(2026, 10, 1), new Date(2026, 10, 2))).toBe(1);
        expect(dayOffsetBetween(new Date(2026, 10, 2), new Date(2026, 10, 1))).toBe(-1);
    });
});

describe('뷰 전환 시 날짜 유지 — 한 anchor 를 세·가로 두 축이 같은 날로 번역한다', () => {
    // 월 보기에서 2026-03-15 를 보다가 주 보기로 가면 「2026-03 의 그 주」가 보여야 한다(쥔님 요구).
    // anchor 하나(2026-03-15)를 세로(주) offset 과 가로(일) offset 으로 각각 번역해도 같은 날을 가리킨다.
    const anchorToday = new Date(2026, 10, 1);   // 오늘(기준)
    const viewing = new Date(2026, 2, 15);       // 보고 있던 날

    it('세로 달력: 보던 주의 offset 으로 스크롤 위치가 잡힌다', () => {
        const off = weekOffsetBetween(anchorToday, viewing);
        const range = { from: -104 };
        const top = offsetToScroll(off, range.from, 80);
        // off 는 과거(음수)지만 범위 안이라 스크롤 위치는 0 이상이어야 한다(범위 밖이면 뷰가 더 깐다)
        expect(top).toBe((off - range.from) * 80);
        expect(top).toBeGreaterThanOrEqual(0);
    });

    it('가로 달력: 같은 날을 일 offset 으로 번역해도 날짜가 보존된다', () => {
        const dayOff = dayOffsetBetween(anchorToday, viewing);
        // 일 offset 에서 되짚으면 보던 날이 나온다(거리의 가역성)
        expect(dayOffsetBetween(anchorToday, viewing)).toBe(dayOff);
        expect(dayOff).toBeLessThan(0);   // 3월은 11월보다 과거
    });
});
