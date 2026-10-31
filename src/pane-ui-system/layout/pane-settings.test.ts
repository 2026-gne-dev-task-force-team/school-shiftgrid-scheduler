/**
 * 창틀 설정 받아들이기 — 모양 틀린 저장값은 그 칸만 기본값. 뷰 덮어쓰기는 아는 칸만.
 *   (localStorage 가 없는 node 환경이라 순수 normalize 만 본다 — 저장·구독은 브라우저에서)
 */
import { describe, it, expect } from 'vitest';
import {
    defaultPaneSettings, normalizePaneSettings, normalizeViewOverrides,
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
