/**
 * 토큰의 단일 원본 — 색 11 · 치수 5 + 레일 1 · 테마 프리셋 묶음.
 *
 * 🔴 ⭐ 토큰 "이름" 은 여기가 원본이다. index.css 는 첫 화면 깜빡임을 막는 기본값(노션 밝게/어둡게)만 들고,
 *    tailwind.config.js 는 이름만 가져다 rgb(var(--c-…)) 로 감싼다. 두 벌이 따로 낡지 않게
 *    theme/__tests__/theme.test.ts 가 이 목록과 index.css 의 --c-*·--s-* 이름을 대조한다.
 *
 * 색 값은 "r g b" 세 수다(tailwind 의 /<alpha-value> 불투명도 문법이 그대로 먹게).
 * 노션 밝게/어둡게 값은 index.css 의 기본값과 "거울" 이어야 한다(검사는 이름만 지키니 값은 사람이 맞춘다).
 */

// ── 색 토큰 ───────────────────────────────────────────────────────────────
export const COLOR_TOKENS = [
    'bg', 'panel', 'panel2', 'line', 'text', 'muted',
    'accent', 'accenth', 'ok', 'bad', 'warn',
    // 🔴 사이드바 전용(판 A, 2026-11-01) — 사이드바를 에디터보다 한 단 어둡게/짙게 가른다.
    //    side=사이드바 바탕 · side2=사이드바 탭 줄 · edge=사이드바↔가운데 경계선(line 보다 한 단 진하게).
    'side', 'side2', 'edge',
] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];

/** 한 테마의 색 한 벌 — 11 토큰 전부를 "r g b" 로 */
export type Palette = Record<ColorToken, string>;

// ── 테마 프리셋 ────────────────────────────────────────────────────────────
// 🔴 ⭐ 각 프리셋은 색 11종을 한 벌로 다 갖는다(검사가 강제한다). 설정 「모양」에서 고른다.
//    base = 이 팔레트의 밝기 · pairId = 밝기만 다른 짝(있으면 mode 가 짝을 따라 바뀐다).
//    짝이 없는 테마(obsidian·nord·dracula)는 mode 와 무관하다.
export interface ThemePreset {
    id: string;
    name: string;
    base: 'light' | 'dark';
    /** 밝기만 다른 짝 프리셋 id — mode(밝게/어둡게/시스템)가 이걸 따라 바뀐다 */
    pairId?: string;
    palette: Palette;
}

export const THEMES: ThemePreset[] = [
    {
        id: 'notion-light', name: '노션 밝게', base: 'light', pairId: 'notion-dark',
        palette: {
            bg: '255 255 255', panel: '247 247 245', panel2: '241 241 239', line: '223 223 220',
            text: '55 53 47', muted: '117 116 112', accent: '25 107 189', accenth: '24 115 204',
            ok: '27 121 67', bad: '197 48 48', warn: '145 96 25',
            side: '236 236 233', side2: '229 229 226', edge: '206 206 202',
        },
    },
    {
        id: 'notion-dark', name: '노션 어둡게', base: 'dark', pairId: 'notion-light',
        palette: {
            bg: '25 25 25', panel: '32 32 32', panel2: '37 37 37', line: '60 60 60',
            text: '235 235 235', muted: '172 172 172', accent: '49 142 240', accenth: '80 160 245',
            ok: '47 159 92', bad: '222 103 103', warn: '217 164 65',
            side: '20 20 20', side2: '28 28 28', edge: '78 78 78',
        },
    },
    {
        id: 'obsidian', name: '옵시디언', base: 'dark',
        palette: {
            bg: '30 30 30', panel: '32 32 32', panel2: '38 38 38', line: '54 54 54',
            text: '220 221 222', muted: '138 138 138', accent: '168 130 255', accenth: '190 160 255',
            ok: '68 178 124', bad: '228 101 101', warn: '224 180 80',
            side: '24 24 24', side2: '32 32 32', edge: '72 72 72',
        },
    },
    {
        id: 'github-light', name: 'GitHub 밝게', base: 'light', pairId: 'github-dark',
        palette: {
            bg: '255 255 255', panel: '246 248 250', panel2: '234 238 242', line: '208 215 222',
            text: '31 35 40', muted: '101 109 118', accent: '9 101 211', accenth: '5 80 174',
            ok: '24 120 52', bad: '204 33 45', warn: '143 95 0',
            side: '231 234 238', side2: '223 227 232', edge: '190 197 207',
        },
    },
    {
        id: 'github-dark', name: 'GitHub 어둡게', base: 'dark', pairId: 'github-light',
        palette: {
            bg: '13 17 23', panel: '22 27 34', panel2: '33 38 45', line: '48 54 61',
            text: '230 237 243', muted: '125 133 144', accent: '65 140 248', accenth: '88 166 255',
            ok: '63 185 80', bad: '248 82 74', warn: '210 153 34',
            side: '9 12 17', side2: '18 22 28', edge: '66 72 80',
        },
    },
    {
        id: 'solarized-light', name: 'Solarized 밝게', base: 'light', pairId: 'solarized-dark',
        palette: {
            bg: '253 246 227', panel: '238 232 213', panel2: '233 226 204', line: '219 212 190',
            text: '101 123 131', muted: '147 161 161', accent: '28 101 153', accenth: '31 111 168',
            ok: '90 103 0', bad: '188 34 32', warn: '122 93 0',
            side: '228 221 200', side2: '221 214 193', edge: '200 193 170',
        },
    },
    {
        id: 'solarized-dark', name: 'Solarized 어둡게', base: 'dark', pairId: 'solarized-light',
        palette: {
            bg: '0 43 54', panel: '7 54 66', panel2: '10 64 77', line: '20 74 88',
            text: '131 148 150', muted: '147 161 161', accent: '95 172 226', accenth: '74 163 223',
            ok: '152 175 0', bad: '235 137 135', warn: '208 157 0',
            side: '0 36 46', side2: '6 50 61', edge: '34 90 104',
        },
    },
    {
        id: 'nord', name: 'Nord', base: 'dark',
        palette: {
            bg: '46 52 64', panel: '59 66 82', panel2: '67 76 94', line: '76 86 106',
            text: '236 239 244', muted: '138 147 165', accent: '145 197 212', accenth: '129 161 193',
            ok: '172 196 151', bad: '223 177 181', warn: '235 203 139',
            side: '40 46 58', side2: '54 61 76', edge: '92 102 124',
        },
    },
    {
        id: 'dracula', name: 'Dracula', base: 'dark',
        palette: {
            bg: '40 42 54', panel: '33 34 44', panel2: '52 55 70', line: '68 71 90',
            text: '248 248 242', muted: '128 132 168', accent: '189 147 249', accenth: '255 121 198',
            ok: '80 250 123', bad: '255 118 118', warn: '241 250 140',
            side: '30 31 40', side2: '46 48 62', edge: '84 88 110',
        },
    },
];

export const DEFAULT_THEME_ID = 'notion-light';

export function findTheme(id: string): ThemePreset {
    return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/**
 * mode(밝기)에 맞는 실제 프리셋 — 🔴 고른 테마가 밝기 짝을 가지면 그 짝으로 바뀐다(W10).
 *   짝이 없는 테마(옵시디언·Nord·Dracula)는 mode 와 무관하게 그대로 쓴다.
 */
export function presetForMode(id: string, resolved: 'light' | 'dark'): ThemePreset {
    const t = findTheme(id);
    if (t.base === resolved) return t;
    if (t.pairId) {
        const pair = THEMES.find((p) => p.id === t.pairId);
        if (pair) return pair;
    }
    // 짝 없음(Nord 등 단일 테마) — 밝기가 안 맞으면 기본 테마(노션)의 그 밝기 짝으로 떨어진다.
    // ⛔ 「mode 무관」으로 두지 않는다: 시스템/밝게/어둡게를 골라도 안 따라가는 것으로 보인다(쥔님 겪음 2026-11-10)
    return THEMES.find((p) => p.base === resolved && p.id.startsWith(DEFAULT_THEME_ID.split('-')[0])) ?? t;
}

// ── 치수 토큰 ─────────────────────────────────────────────────────────────
// 🔴 이름만 index.css 와 맞으면 된다. 실제 px·밀도·손가락 바닥은 index.css 가 쥔다(그 주석 참조).
// 🔴 titlebar·statusbar 는 판 A(2026-11-01)가 더한 틀 두 줄 — 전체 폭 상단 타이틀바·하단 상태바 높이.
export const SIZE_TOKENS = ['topbar', 'header', 'row', 'btn', 'pad', 'rail', 'railbtn', 'titlebar', 'statusbar', 'field'] as const;
export type SizeToken = (typeof SIZE_TOKENS)[number];

// 🔴 모서리 토큰 — --r-ctl(단추·입력칸). 값은 index.css 가 쥔다.
export const RADIUS_TOKENS = ['ctl'] as const;
export type RadiusToken = (typeof RADIUS_TOKENS)[number];

// ── 밀도 ──────────────────────────────────────────────────────────────────
// 치수 토큰에 곱하는 배율. index.css 가 max(바닥, 기본 × 밀도) 로 쓴다.
export type DensityId = 'compact' | 'normal' | 'cozy' | 'roomy';

export interface DensityDef {
    id: DensityId;
    name: string;
    scale: number;
}

// 🔴 4단계(W11, 쥔님 2026-11-10 *"어른들이 보기엔 이미 여유도 그렇게 여유롭지 않아"*).
//    빽빽 = 옛 값 그대로 · 여유(cozy) = 옛 「편안」 id 를 이어받되 값이 1→1.22 로 넓어졌다 · 보통 = 새 기본 · 넉넉 = 한 단계 더.
//    ⛔ 옛 'cozy' id 를 지우지 않는다 — 저장된 값이 그대로 읽혀야 한다.
export const DENSITIES: DensityDef[] = [
    { id: 'compact', name: '빽빽', scale: 0.85 },
    { id: 'normal', name: '보통', scale: 1.1 },
    { id: 'cozy', name: '여유', scale: 1.22 },
    { id: 'roomy', name: '넉넉', scale: 1.36 },
];

export const DEFAULT_DENSITY: DensityId = 'normal';

export function densityScale(id: DensityId): number {
    return DENSITIES.find((d) => d.id === id)?.scale ?? 1.1;
}

// ── 글자 크기 ─────────────────────────────────────────────────────────────
// 단계 토큰(--fs-micro~lead)에 곱하는 배율 --fs-scale. 밀도와 따로 고른다.
export type FontSizeId = 'small' | 'normal' | 'large' | 'xlarge';

export interface FontSizeDef {
    id: FontSizeId;
    name: string;
    scale: number;
}

export const FONT_SIZES: FontSizeDef[] = [
    { id: 'small', name: '작게', scale: 0.9 },
    { id: 'normal', name: '보통', scale: 1 },
    { id: 'large', name: '크게', scale: 1.15 },
    { id: 'xlarge', name: '아주 크게', scale: 1.3 },
];

export const DEFAULT_FONT_SIZE: FontSizeId = 'normal';

export function fontScale(id: FontSizeId): number {
    return FONT_SIZES.find((f) => f.id === id)?.scale ?? 1;
}
