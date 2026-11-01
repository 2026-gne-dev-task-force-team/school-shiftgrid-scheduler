/**
 * 뷰 등록소 — 등록·재정의·조회·자리 제한.
 *   ① 등록하면 getView·listViews 로 보인다
 *   ② 같은 id 로 또 등록하면 덮어쓴다(중복이 안 쌓인다)
 *   ⛔ 「리본에 올릴지」는 뷰가 안 정한다 — 리본은 host.ribbon.add 로 꽂은 동작만(host-api.test.ts 가 본다).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { ComponentType } from 'react';
import {
    registerView, getView, listViews, clearViews,
    canPlace, canSplit, isSingleton,
    type ViewProps,
} from './view-registry';

const Dummy = (() => null) as ComponentType<ViewProps>;

beforeEach(() => clearViews());

describe('① 등록·조회', () => {
    it('등록하면 보인다', () => {
        registerView({ id: 'a', title: 'A', Component: Dummy });
        expect(getView('a')?.title).toBe('A');
        expect(listViews().map((v) => v.id)).toEqual(['a']);
    });
    it('없는 id 는 undefined', () => {
        expect(getView('없음')).toBeUndefined();
    });
});

describe('② 재정의(덮어쓰기)', () => {
    it('같은 id 로 또 등록하면 중복이 안 쌓이고 마지막이 산다', () => {
        registerView({ id: 'a', title: '처음', Component: Dummy });
        registerView({ id: 'a', title: '나중', Component: Dummy });
        expect(listViews().length).toBe(1);
        expect(getView('a')?.title).toBe('나중');
    });
});

describe('④ 자리 제한 — placement 세 축(areas·split·singleton)', () => {
    // 🔴 2026-11-01 19:34 쥔님 *"아예 막는 것보단 기본값으로 — 새로 생성하는 뷰들도 기본값은 비활성화"* → 기본이 보수적이 됐다
    it('areas 를 안 주면 defaultArea 하나뿐(기본 보수적) · 주면 그것만', () => {
        registerView({ id: 'any', title: 'A', Component: Dummy });   // defaultArea 생략 = center
        expect(canPlace('any', 'center')).toBe(true);
        expect(canPlace('any', 'left')).toBe(false);
        registerView({ id: 'side', title: 'S', Component: Dummy, defaultArea: 'left' });
        expect(canPlace('side', 'left')).toBe(true);
        expect(canPlace('side', 'center')).toBe(false);   // 패널 뷰는 탭 뷰로 못 간다
        registerView({ id: 'mid', title: 'M', Component: Dummy, placement: { areas: ['center'] } });
        expect(canPlace('mid', 'center')).toBe(true);
        expect(canPlace('mid', 'left')).toBe(false);
        expect(canPlace('mid', 'right')).toBe(false);
    });

    it('등록 안 된 뷰는 전부 허용(꺼진 플러그인 자리표시를 옮길 수 있어야)', () => {
        expect(canPlace('없음', 'left')).toBe(true);
        expect(canSplit('없음')).toBe(true);
        expect(isSingleton('없음')).toBe(false);
    });

    it('split 은 명시 true 만 가른 칸에 들어간다 · 생략/false 면 못 들어간다(기본 비활성)', () => {
        registerView({ id: 'nosplit', title: 'N', Component: Dummy, placement: { split: false } });
        registerView({ id: 'yessplit', title: 'Y', Component: Dummy, placement: { split: true } });
        registerView({ id: 'plain', title: 'P', Component: Dummy });
        expect(canSplit('nosplit')).toBe(false);
        expect(canSplit('yessplit')).toBe(true);
        expect(canSplit('plain')).toBe(false);
    });

    it('singleton 은 isSingleton=true · split 은 따로 간다(복제 개념이 없어져 싱글턴이 가르기를 막지 않는다)', () => {
        registerView({ id: 'one', title: 'O', Component: Dummy, placement: { singleton: true } });
        expect(isSingleton('one')).toBe(true);
        expect(canSplit('one')).toBe(false);   // 기본값(생략) 이라 false — 싱글턴 때문이 아니다
        registerView({ id: 'onesplit', title: 'OS', Component: Dummy, placement: { singleton: true, split: true } });
        expect(isSingleton('onesplit')).toBe(true);
        expect(canSplit('onesplit')).toBe(true);
    });
});
