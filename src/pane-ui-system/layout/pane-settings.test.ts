/**
 * 창틀 설정 받아들이기 — 모양 틀린 저장값은 그 칸만 기본값. 뷰 덮어쓰기는 아는 칸만.
 *   (localStorage 가 없는 node 환경이라 순수 normalize 만 본다 — 저장·구독은 브라우저에서)
 */
import { describe, it, expect } from 'vitest';
import {
    defaultPaneSettings, normalizePaneSettings, normalizeViewOverrides,
    defaultRibbon, normalizeRibbon, resolveRibbon, reorderIds, nudgeId,
} from './pane-settings';

describe('① PaneSettings 받아들이기', () => {
    it('빈 값·엉뚱한 값은 전부 기본값', () => {
        expect(normalizePaneSettings(null)).toEqual(defaultPaneSettings());
        expect(normalizePaneSettings('넓게')).toEqual(defaultPaneSettings());
        expect(normalizePaneSettings(7)).toEqual(defaultPaneSettings());
    });
    it('성한 칸만 살리고 나머지는 기본값', () => {
        const d = defaultPaneSettings();
        const s = normalizePaneSettings({ sidebarMinWidth: 200, autoClose: '예' });
        expect(s.sidebarMinWidth).toBe(200);        // 성한 칸은 산다
        expect(s.autoClose).toBe(d.autoClose);      // 모양 틀린 칸 → 기본
        expect(s.sidebarWidth).toBe(d.sidebarWidth); // 없는 칸 → 기본
    });
    it('말도 안 되는 폭은 가둬서 읽는다', () => {
        expect(normalizePaneSettings({ sidebarMinWidth: -50 }).sidebarMinWidth).toBe(1);
        expect(normalizePaneSettings({ sidebarMaxWidth: 1e9 }).sidebarMaxWidth).toBe(100000);
    });
    it('받아들인 값은 다시 넣어도 그대로다(멱등)', () => {
        const once = normalizePaneSettings({ sidebarWidth: 300, autoClose: false, narrowWidth: 900 });
        expect(normalizePaneSettings(once)).toEqual(once);
    });
});

describe('② ViewOverrides 받아들이기', () => {
    it('아는 칸·성한 값만 추린다', () => {
        const o = normalizeViewOverrides({
            sheet: { minWidth: 360, squeeze: 'scroll', 없는키: 1, collapseBelow: 'x' },
            bad: { squeeze: '엉뚱' },      // 아는 칸이 하나도 없음 → 통째로 빠진다
        });
        expect(o).toEqual({ sheet: { minWidth: 360, squeeze: 'scroll' } });
    });
    it('빈·엉뚱한 값은 빈 맵', () => {
        expect(normalizeViewOverrides(null)).toEqual({});
        expect(normalizeViewOverrides('x')).toEqual({});
    });
    it('음수 minWidth 는 0 으로 가둔다', () => {
        expect(normalizeViewOverrides({ v: { minWidth: -9 } })).toEqual({ v: { minWidth: 0 } });
    });
});

describe('③ Ribbon 받아들이기', () => {
    it('빈·엉뚱한 값은 기본({order:[],hidden:[]})', () => {
        expect(normalizeRibbon(null)).toEqual(defaultRibbon());
        expect(normalizeRibbon('x')).toEqual(defaultRibbon());
        expect(normalizeRibbon(3)).toEqual(defaultRibbon());
    });
    it('문자열 아닌 것·중복은 거른다 — 칸 하나가 틀려도 그 칸만 []', () => {
        expect(normalizeRibbon({ order: ['a', 'a', 1, 'b', null], hidden: 'nope' }))
            .toEqual({ order: ['a', 'b'], hidden: [] });
    });
    it('받아들인 값은 다시 넣어도 그대로다(멱등)', () => {
        const once = normalizeRibbon({ order: ['a', 'b'], hidden: ['c'] });
        expect(normalizeRibbon(once)).toEqual(once);
    });
});

describe('④ resolveRibbon — 등록 order → 저장 order 덮어쓰기 → hidden 제외', () => {
    const base = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

    it('저장 order 가 없으면 등록 순서 그대로, 전부 보임', () => {
        const r = resolveRibbon(base, defaultRibbon());
        expect(r.visible.map((v) => v.id)).toEqual(['a', 'b', 'c', 'd']);
        expect(r.hidden).toEqual([]);
    });
    it('저장 order 가 가리키는 것이 앞으로, 나머지 등록분은 뒤에(새 뷰가 안 사라진다)', () => {
        const r = resolveRibbon(base, { order: ['c', 'a'], hidden: [] });
        expect(r.ordered.map((v) => v.id)).toEqual(['c', 'a', 'b', 'd']);
    });
    it('저장 order 에 있지만 더는 등록 안 된 id 는 자동으로 빠진다', () => {
        const r = resolveRibbon(base, { order: ['없음', 'b'], hidden: [] });
        expect(r.ordered.map((v) => v.id)).toEqual(['b', 'a', 'c', 'd']);
    });
    it('hidden 은 visible 에서 빠지고 hidden 으로 모인다(순서는 유지)', () => {
        const r = resolveRibbon(base, { order: ['d', 'c', 'b', 'a'], hidden: ['c'] });
        expect(r.visible.map((v) => v.id)).toEqual(['d', 'b', 'a']);
        expect(r.hidden.map((v) => v.id)).toEqual(['c']);
    });
});

describe('⑤ reorderIds / nudgeId — 순서 한 수(순수)', () => {
    it('앞으로 꽂기', () => {
        expect(reorderIds(['a', 'b', 'c', 'd'], 'd', 'b', 'before')).toEqual(['a', 'd', 'b', 'c']);
    });
    it('뒤로 꽂기', () => {
        expect(reorderIds(['a', 'b', 'c', 'd'], 'a', 'c', 'after')).toEqual(['b', 'c', 'a', 'd']);
    });
    it('제자리·없는 target 은 그대로', () => {
        expect(reorderIds(['a', 'b'], 'a', 'a', 'before')).toEqual(['a', 'b']);
        expect(reorderIds(['a', 'b'], 'a', '없음', 'after')).toEqual(['a', 'b']);
    });
    it('nudge 위/아래 · 끝에서는 안 움직인다', () => {
        expect(nudgeId(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
        expect(nudgeId(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
        expect(nudgeId(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
        expect(nudgeId(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c']);
    });
});
