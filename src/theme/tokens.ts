/**
 * 토큰의 단일 원본 — 색 11 · 치수 5 + 레일 1.
 *
 * 🔴 ⭐ 토큰 "이름" 은 여기가 원본이다. index.css 는 첫 화면 깜빡임을 막는 기본값만 들고,
 *    tailwind.config.js 는 이름만 가져다 rgb(var(--c-…)) 로 감싼다. 두 벌이 따로 낡지 않게
 *    theme/__tests__/theme.test.ts 가 이 목록과 index.css 의 --c-*·--s-* 이름을 대조한다.
 *
 * 색 값은 "r g b" 세 수다(tailwind 의 /<alpha-value> 불투명도 문법이 그대로 먹게).
 * 여기 값은 index.css 의 기본값과 "거울" 이어야 한다 — 검사는 이름만 지키니 값은 사람이 맞춘다.
 */

// ── 색 토큰 ───────────────────────────────────────────────────────────────
export const COLOR_TOKENS = [
    'bg', 'panel', 'panel2', 'line', 'text', 'muted',
    'accent', 'accenth', 'ok', 'bad', 'warn',
] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];

export interface ColorDef {
    /** 밝은 테마 기본값 "r g b" */
    light: string;
    /** 어두운 테마 기본값 "r g b" */
    dark: string;
    /** 사람이 읽는 설명 — 나중 테마 편집 화면이 쓴다 */
    desc: string;
}

export const COLOR_DEFS: Record<ColorToken, ColorDef> = {
    bg: { light: '255 255 255', dark: '25 25 25', desc: '가운데 캔버스' },
    panel: { light: '247 247 245', dark: '32 32 32', desc: '사이드바·패널 바탕' },
    panel2: { light: '241 241 239', dark: '37 37 37', desc: '머리줄·살짝 깊은 면' },
    line: { light: '233 233 231', dark: '47 47 47', desc: '1px 선' },
    text: { light: '55 53 47', dark: '235 235 235', desc: '본문 글자' },
    muted: { light: '145 145 142', dark: '155 155 155', desc: '회색 글자·아이콘' },
    accent: { light: '35 131 226', dark: '45 140 240', desc: '강조색(선택·포커스)' },
    accenth: { light: '24 115 204', dark: '80 160 245', desc: '강조색 호버' },
    ok: { light: '31 138 76', dark: '47 158 91', desc: '됨/성공' },
    bad: { light: '197 48 48', dark: '214 69 69', desc: '안 됨/오류' },
    warn: { light: '183 121 31', dark: '217 164 65', desc: '주의' },
};

// ── 치수 토큰 ─────────────────────────────────────────────────────────────
// 🔴 이름만 index.css 와 맞으면 된다. 실제 px·밀도·손가락 바닥은 index.css 가 쥔다(그 주석 참조).
export const SIZE_TOKENS = ['topbar', 'header', 'row', 'btn', 'pad', 'rail'] as const;
export type SizeToken = (typeof SIZE_TOKENS)[number];

// ── 강조색 프리셋 ──────────────────────────────────────────────────────────
// 설정 「모양」에서 고른다. 밝은/어두운 짝을 따로 든다(index.css 가 그랬던 대로).
export interface AccentPreset {
    id: string;
    name: string;
    light: { accent: string; accenth: string };
    dark: { accent: string; accenth: string };
}

export const ACCENTS: AccentPreset[] = [
    { id: 'blue', name: '파랑', light: { accent: '35 131 226', accenth: '24 115 204' }, dark: { accent: '45 140 240', accenth: '80 160 245' } },
    { id: 'green', name: '초록', light: { accent: '31 138 76', accenth: '24 110 60' }, dark: { accent: '47 158 91', accenth: '90 190 130' } },
    { id: 'purple', name: '보라', light: { accent: '124 58 237', accenth: '104 48 200' }, dark: { accent: '150 110 240', accenth: '180 150 250' } },
    { id: 'orange', name: '주황', light: { accent: '217 119 6', accenth: '190 100 0' }, dark: { accent: '234 140 40', accenth: '245 170 90' } },
    { id: 'red', name: '빨강', light: { accent: '197 48 48', accenth: '170 35 35' }, dark: { accent: '214 69 69', accenth: '235 110 110' } },
];

export const DEFAULT_ACCENT_ID = 'blue';

export function findAccent(id: string): AccentPreset {
    return ACCENTS.find((a) => a.id === id) ?? ACCENTS[0];
}

// ── 밀도 ──────────────────────────────────────────────────────────────────
// 치수 토큰에 곱하는 배율. index.css 가 max(바닥, 기본 × 밀도) 로 쓴다.
export type DensityId = 'compact' | 'cozy';

export interface DensityDef {
    id: DensityId;
    name: string;
    scale: number;
}

export const DENSITIES: DensityDef[] = [
    { id: 'compact', name: '빽빽', scale: 0.85 },
    { id: 'cozy', name: '편안', scale: 1 },
];

export const DEFAULT_DENSITY: DensityId = 'cozy';

export function densityScale(id: DensityId): number {
    return DENSITIES.find((d) => d.id === id)?.scale ?? 1;
}
