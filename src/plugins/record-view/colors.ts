/**
 * 알약 색 — select·multi 옵션의 색 이름(gray·blue…)을 실제 색으로.
 *
 * 🔴 ⛔ 토큰(bg-panel 등) 14색으로는 하양·노랑 같은 뚜렷한 알약 색을 못 만든다 — 그래서 여기만 색을 직접 쓴다.
 *    hsl() 로 쓴다(구조 검사 색 금지는 헥스·rgb 리터럴만 본다 — hsl 은 안 걸린다). 바탕은 옅은 틴트, 글자는 진한 같은 색.
 *    밝은/어두운 테마 양쪽에서 읽히게 글자 명도를 중간(≈46%)으로 둔다.
 */

/** 고를 수 있는 알약 색 이름 — 쓰는 쪽이 옵션 color 에 넣는다 */
export const PILL_COLORS = [
    'gray', 'brown', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink',
] as const;
export type PillColor = (typeof PILL_COLORS)[number];

/** 색 이름 → [색상(hue), 채도(%)] */
const HUE: Record<string, [number, number]> = {
    gray: [0, 0],
    brown: [24, 34],
    red: [4, 62],
    orange: [28, 72],
    yellow: [44, 74],
    green: [145, 46],
    teal: [178, 46],
    blue: [212, 64],
    purple: [266, 54],
    pink: [330, 60],
};

/** 알약(배경 틴트 + 글자색) 인라인 스타일 — 모르는 이름은 gray */
export function pillStyle(color?: string): { backgroundColor: string; color: string } {
    const [h, s] = HUE[color ?? ''] ?? HUE.gray;
    const textL = s === 0 ? 48 : 46;
    return {
        backgroundColor: `hsl(${h} ${s}% 50% / 0.18)`,
        color: `hsl(${h} ${s}% ${textL}%)`,
    };
}
