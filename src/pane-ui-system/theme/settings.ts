/**
 * 테마 설정 모델 + 기기별 보관.
 *
 * 🔴 기기별 localStorage 에 둔다 — ⛔ 프로젝트 파일에 안 넣는다. 테마는 화면(기기)의 성질이지
 *    자료의 성질이 아니다. 폰에서 고른 어두운 테마가 사무실 PC 로 따라가면 안 된다(패널 폭과 같은 이유).
 *
 * 받아들이기는 panels.ts 의 normalizePanels 와 같은 성질이다 — 모양이 틀린 "그 칸만" 기본값으로
 * 떨어뜨린다(통째로 버리지 않는다).
 */
import {
    DEFAULT_THEME_ID, DEFAULT_DENSITY, DEFAULT_FONT_SIZE, THEMES, COLOR_TOKENS, DENSITIES as DENSITY_DEFS, FONT_SIZES,
    type ColorToken, type DensityId, type FontSizeId,
} from './tokens';
import { storageKey } from '../storage';
import { reportSettingsSaveFail } from '../layout/save-fail';

export type ThemeMode = 'system' | 'light' | 'dark';

export interface ThemeSettings {
    mode: ThemeMode;
    density: DensityId;
    /** 글자 크기 단계 — 밀도와 따로 고른다(W11) */
    fontSize: FontSizeId;
    /** 고른 테마 프리셋 id (tokens.ts 의 THEMES) */
    theme: string;
    /** 🔴 나중 자리 — 사용자가 토큰을 직접 덮는 자유 테마. 모양 틀린 칸은 버린다 */
    custom?: Partial<Record<ColorToken, string>>;
}

/**
 * 🔴 ⛔ 상수로 굳히지 않는다 — 모듈을 import 하는 순간 값이 박혀서
 *    앱이 setStoragePrefix 를 부르기 전에 'pane-ui-system.*' 로 고정된다(실제로 그렇게 짰다가 잡았다).
 *    쓸 때마다 부른다. 이게 「먼저 읽히는 것」과 「나중에 설정되는 것」이 부딪히는 전형이다.
 */
export const themeKey = () => storageKey('theme');

const MODES: ThemeMode[] = ['system', 'light', 'dark'];
const DENSITIES: DensityId[] = DENSITY_DEFS.map((d) => d.id);
const FONT_IDS: FontSizeId[] = FONT_SIZES.map((f) => f.id);

export function defaultThemeSettings(): ThemeSettings {
    return { mode: 'system', density: DEFAULT_DENSITY, fontSize: DEFAULT_FONT_SIZE, theme: DEFAULT_THEME_ID };
}

/** "r g b" 세 수인가 — custom 토큰 값 받아들이기용 */
function isTriplet(v: unknown): v is string {
    return typeof v === 'string' && /^\s*\d{1,3}\s+\d{1,3}\s+\d{1,3}\s*$/.test(v);
}

/** custom 에서 아는 토큰 + 성한 값만 추린다(모르는 키·틀린 값은 버린다) */
function normalizeCustom(raw: unknown): Partial<Record<ColorToken, string>> | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const o = raw as Record<string, unknown>;
    const out: Partial<Record<ColorToken, string>> = {};
    let any = false;
    for (const t of COLOR_TOKENS) {
        if (isTriplet(o[t])) { out[t] = o[t] as string; any = true; }
    }
    return any ? out : undefined;
}

export function normalizeThemeSettings(raw: unknown): ThemeSettings {
    const d = defaultThemeSettings();
    if (!raw || typeof raw !== 'object') return d;
    const o = raw as Record<string, unknown>;
    return {
        mode: MODES.includes(o.mode as ThemeMode) ? (o.mode as ThemeMode) : d.mode,
        density: DENSITIES.includes(o.density as DensityId) ? (o.density as DensityId) : d.density,
        fontSize: FONT_IDS.includes(o.fontSize as FontSizeId) ? (o.fontSize as FontSizeId) : d.fontSize,
        // 아는 테마 프리셋 id 만 받는다 — 없으면 기본 테마
        theme: THEMES.some((t) => t.id === o.theme) ? (o.theme as string) : d.theme,
        custom: normalizeCustom(o.custom),
    };
}

export function loadThemeSettings(): ThemeSettings {
    try {
        if (typeof localStorage === 'undefined') return defaultThemeSettings();
        const s = localStorage.getItem(themeKey());
        if (!s) return defaultThemeSettings();
        return normalizeThemeSettings(JSON.parse(s));
    } catch { return defaultThemeSettings(); }
}

export function saveThemeSettings(s: ThemeSettings): void {
    try {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(themeKey(), JSON.stringify(s));
    } catch (e) { reportSettingsSaveFail('테마 설정', e); }
}
