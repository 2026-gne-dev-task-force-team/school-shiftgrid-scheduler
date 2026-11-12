/**
 * 움직이는 사용법 — 색·좌표 헬퍼(순수 데이터, 컴포넌트 없음).
 *  색은 CSS 변수만 읽는다: rgb(var(--c-…)) — 두 테마에서 뜻이 그대로 산다.
 *  뜻: accent 파랑=전담/선택 · ok 초록=옮길 수 있음/완료 · warn 노랑=권장 · bad 빨강=필수/불가 · line/panel2=빈 칸·격자.
 */
export const C = {
    accent: 'rgb(var(--c-accent))',
    ok: 'rgb(var(--c-ok))',
    bad: 'rgb(var(--c-bad))',
    warn: 'rgb(var(--c-warn))',
    line: 'rgb(var(--c-line))',
    panel: 'rgb(var(--c-panel))',
    panel2: 'rgb(var(--c-panel2))',
    text: 'rgb(var(--c-text))',
    muted: 'rgb(var(--c-muted))',
    /** 담임 칸 — 연한 파랑 */
    home: 'rgb(var(--c-accent) / 0.12)',
} as const;

/** 뜻색을 투명도와 함께: fillA('ok', 0.35) → "rgb(var(--c-ok) / 0.35)" */
export function fillA(name: 'accent' | 'ok' | 'bad' | 'warn', a: number): string {
    return `rgb(var(--c-${name}) / ${a})`;
}

/** 격자 한 칸 기본 크기 */
export const CW = 40;
export const CH = 24;
/** 격자 머리(요일 줄) 높이 */
export const HEAD = 16;

/** 칸의 왼쪽 위 x — 격자 왼쪽 gx 에서 col 번째 */
export function cellX(gx: number, col: number, cw = CW): number {
    return gx + col * cw;
}
/** 칸의 왼쪽 위 y — 격자 위 gy(머리 포함)에서 row 번째 */
export function cellY(gy: number, row: number, ch = CH, head = HEAD): number {
    return gy + head + row * ch;
}

/** 요일 이름 */
export const DAYS5 = ['월', '화', '수', '목', '금'] as const;
