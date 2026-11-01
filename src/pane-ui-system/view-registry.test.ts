/**
 * 뷰 등록소 — 등록·재정의·조회·리본 정렬.
 *   ① 등록하면 getView·listViews 로 보인다
 *   ② 같은 id 로 또 등록하면 덮어쓴다(중복이 안 쌓인다)
 *   ③ 리본은 ribbon 이 있는 것만, order 순 · 같으면 등록 순(안정)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { ComponentType } from 'react';
import {
    registerView, getView, listViews, listRibbonViews, clearViews,
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

describe('③ 리본 정렬', () => {
    it('ribbon 이 있는 것만 order 순으로 — false·생략은 빠진다', () => {
        registerView({ id: 'x', title: 'X', Component: Dummy, ribbon: { order: 2 } });
        registerView({ id: 'y', title: 'Y', Component: Dummy, ribbon: { order: 1 } });
        registerView({ id: 'z', title: 'Z', Component: Dummy, ribbon: false });
        registerView({ id: 'w', title: 'W', Component: Dummy });   // 생략
        expect(listRibbonViews().map((v) => v.id)).toEqual(['y', 'x']);
    });
    it('order 가 같으면 등록 순서가 남는다(안정 정렬)', () => {
        registerView({ id: 'first', title: '1', Component: Dummy, ribbon: {} });
        registerView({ id: 'second', title: '2', Component: Dummy, ribbon: {} });
        expect(listRibbonViews().map((v) => v.id)).toEqual(['first', 'second']);
    });
});

describe('④ 자리 제한 — placement 세 축(areas·split·singleton)', () => {
    it('areas 를 안 주면 어디든 놓을 수 있다 · 주면 그것만', () => {
        registerView({ id: 'any', title: 'A', Component: Dummy });
        expect(canPlace('any', 'left')).toBe(true);
        expect(canPlace('any', 'center')).toBe(true);
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

    it('split=false 면 못 가른다 · 생략/true 면 가른다', () => {
        registerView({ id: 'nosplit', title: 'N', Component: Dummy, placement: { split: false } });
        registerView({ id: 'yessplit', title: 'Y', Component: Dummy, placement: { split: true } });
        registerView({ id: 'plain', title: 'P', Component: Dummy });
        expect(canSplit('nosplit')).toBe(false);
        expect(canSplit('yessplit')).toBe(true);
        expect(canSplit('plain')).toBe(true);
    });

    it('singleton 은 isSingleton=true · 🔴 복제가 곧 둘이라 canSplit 이 자동으로 막는다', () => {
        registerView({ id: 'one', title: 'O', Component: Dummy, placement: { singleton: true } });
        expect(isSingleton('one')).toBe(true);
        expect(canSplit('one')).toBe(false);   // split 을 명시 안 해도 싱글턴이면 못 가른다
    });

    it('singleton + split:true 를 같이 줘도 가르기는 막힌다(싱글턴이 이긴다)', () => {
        registerView({ id: 'onesplit', title: 'OS', Component: Dummy, placement: { singleton: true, split: true } });
        expect(isSingleton('onesplit')).toBe(true);
        expect(canSplit('onesplit')).toBe(false);
    });
});
