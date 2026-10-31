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
