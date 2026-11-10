// @vitest-environment jsdom
/**
 * 테마 색 변환 + 사용자 테마 가져오기/내보내기 받아들이기.
 *   ① 색 변환 — "#rrggbb" ↔ "r g b" · 틀린 값 방어
 *   ② importThemeJSON — 🔴 틀린 색 칸을 버리고 몇 개 버렸는지 센다(버그 심기 지점) · 모르는 키는 안 들인다
 *   ③ normalizeUserThemes — 이름 없는 것은 버린다 · 모르는 base 는 기본
 *   ④ exportThemeJSON — name·base·colors 만 담는다
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isTriplet, rgbToHex, hexToRgb } from '../color';
import {
    importThemeJSON, exportThemeJSON, normalizeUserThemes,
    addUserTheme, removeUserTheme, restoreUserTheme,
} from '../user-themes';
import { __resetSettingsSaveFailForTest } from '../../layout/save-fail';
import { getNotifications, __resetNotifyForTest } from '../../plugin/notify';
import { DEFAULT_THEME_ID } from '../tokens';

describe('① 색 변환', () => {
    it('isTriplet — 0~255 세 수만', () => {
        expect(isTriplet('10 20 30')).toBe(true);
        expect(isTriplet('255 0 128')).toBe(true);
        expect(isTriplet('256 0 0')).toBe(false);   // 255 초과
        expect(isTriplet('10 20')).toBe(false);
        expect(isTriplet('빨강')).toBe(false);
        expect(isTriplet(42)).toBe(false);
    });
    it('rgbToHex', () => {
        expect(rgbToHex('255 255 255')).toBe('#ffffff');
        expect(rgbToHex('0 0 0')).toBe('#000000');
        expect(rgbToHex('35 131 226')).toBe('#2383e2');
    });
    it('rgbToHex — 틀린 값은 검정으로 떨어진다', () => {
        expect(rgbToHex('엉뚱')).toBe('#000000');
    });
    it('hexToRgb — #rrggbb·#rgb, 틀리면 null', () => {
        expect(hexToRgb('#2383e2')).toBe('35 131 226');
        expect(hexToRgb('#fff')).toBe('255 255 255');
        expect(hexToRgb('2383e2')).toBe('35 131 226');   // # 없어도
        expect(hexToRgb('zzz')).toBeNull();
    });
    it('roundtrip', () => {
        expect(hexToRgb(rgbToHex('12 34 56'))).toBe('12 34 56');
    });
});

describe('② importThemeJSON — 틀린 색은 버리고 센다', () => {
    it('성한 색만 들이고 skipped 를 센다', () => {
        const json = JSON.stringify({
            name: '내 색',
            base: 'notion-dark',
            colors: {
                accent: '10 20 30',     // 성함
                bg: '빨강',             // 값이 "r g b" 꼴 아님 → 버림
                없는토큰: '0 0 0',       // 모르는 토큰 이름 → 버림
                text: '255 255 255',    // 성함
            },
        });
        const r = importThemeJSON(json);
        expect(r.theme).not.toBeNull();
        expect(r.theme!.colors).toEqual({ accent: '10 20 30', text: '255 255 255' });
        expect(r.skipped).toBe(2);   // bg(값 틀림) + 없는토큰(이름 틀림)
    });
    it('모르는 base 는 기본 테마로', () => {
        const r = importThemeJSON(JSON.stringify({ name: 'x', base: '없는테마', colors: {} }));
        expect(r.theme!.base).toBe(DEFAULT_THEME_ID);
    });
    it('⛔ name·base·colors 밖의 키는 안 들인다(평문 그 외 없음)', () => {
        const r = importThemeJSON(JSON.stringify({
            name: 'x', base: 'nord', colors: { accent: '1 2 3' },
            token: 'secret!!', extra: { a: 1 },
        }));
        expect(Object.keys(r.theme!)).toEqual(['id', 'name', 'base', 'colors']);
        expect(JSON.stringify(r.theme)).not.toContain('secret');
    });
    it('이름이 없으면 기본 이름을 붙인다', () => {
        const r = importThemeJSON(JSON.stringify({ colors: { accent: '1 2 3' } }));
        expect(r.theme!.name).toBe('가져온 테마');
    });
    it('JSON 이 깨지면 theme=null + error', () => {
        const r = importThemeJSON('{이건 JSON 이 아니다');
        expect(r.theme).toBeNull();
        expect(r.error).toBeTruthy();
    });
});

describe('③ normalizeUserThemes', () => {
    it('이름 없는 것은 버린다', () => {
        const list = normalizeUserThemes([
            { id: 'a', name: '좋음', base: 'nord', colors: { accent: '1 2 3' } },
            { id: 'b', base: 'nord', colors: {} },          // 이름 없음 → 버림
            { name: '   ', base: 'nord', colors: {} },       // 빈 이름 → 버림
            '엉뚱',
        ]);
        expect(list.map((t) => t.name)).toEqual(['좋음']);
    });
    it('배열이 아니면 빈 목록', () => {
        expect(normalizeUserThemes(null)).toEqual([]);
        expect(normalizeUserThemes('x')).toEqual([]);
    });
});

describe('④ exportThemeJSON — name·base·colors 만', () => {
    it('그 세 칸만 담는다', () => {
        const s = exportThemeJSON({ name: '내 색', base: 'nord', colors: { accent: '1 2 3' } });
        expect(JSON.parse(s)).toEqual({ name: '내 색', base: 'nord', colors: { accent: '1 2 3' } });
    });
});

describe('⑤ 사용자 테마 지우기 되돌리기 · 저장 실패 알림(R3-S)', () => {
    beforeEach(() => { localStorage.clear(); __resetNotifyForTest(); __resetSettingsSaveFailForTest(); });

    it('restoreUserTheme — 지운 테마가 원래 자리(index)로 돌아온다 · 이미 있으면 겹치지 않는다', () => {
        const a = addUserTheme({ name: '가', base: 'light', colors: {} });
        const b = addUserTheme({ name: '나', base: 'light', colors: {} });
        const c = addUserTheme({ name: '다', base: 'light', colors: {} });
        const saved = JSON.parse(localStorage.getItem(Object.keys(localStorage)[0])!) as { id: string }[];
        expect(saved.map((t) => t.id)).toEqual([a, b, c]);
        const mid = saved[1] as never;
        removeUserTheme(b);
        restoreUserTheme(mid, 1);
        restoreUserTheme(mid, 1);   // 두 번 눌러도 한 벌
        const after = JSON.parse(localStorage.getItem(Object.keys(localStorage)[0])!) as { id: string }[];
        expect(after.map((t) => t.id)).toEqual([a, b, c]);
        [a, b, c].forEach(removeUserTheme);
    });

    it('저장이 실패하면 조용히 삼키지 않고 오류 알림을 띄운다', async () => {
        const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
        const id = addUserTheme({ name: '실패', base: 'light', colors: {} });
        await vi.waitFor(() => { expect(getNotifications().items.some((n) => n.level === 'error' && /사용자 테마/.test(n.body ?? ''))).toBe(true); });
        spy.mockRestore();
        removeUserTheme(id);
    });
});
