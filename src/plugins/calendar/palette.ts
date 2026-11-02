/**
 * 달력 저장소 색 팔레트 — 저장소 「순서」로 돌리는 토큰 색(쥔님 🙋 1 기본: *"팔레트 순환"*).
 *   🔴 ⛔ 임의 hex 금지(구조 검사 ①) — 뜻색 토큰(accent·ok·warn·bad·accenth)만 돈다.
 *   🔴 Tailwind JIT 는 「글자 그대로 쓰인 클래스」만 컴파일한다 — 그래서 `bg-${token}` 조립 대신 리터럴로 적는다.
 */

/** 색 한 벌 — 종일 막대(bar)·점(dot)·연한 바탕(soft)·왼쪽 띠(border). */
export interface PaletteEntry {
    /** 종일 일정 막대 — 채운 바탕 + 대비 글자 */
    bar: string;
    /** 시간 일정·년/작은 달력의 점 */
    dot: string;
    /** 연한 바탕(시간 그리드 카드 등) */
    soft: string;
    /** 왼쪽 띠(카드 왼쪽 2px) */
    border: string;
    /** 글자색만(표 등) */
    text: string;
}

export const PALETTE: PaletteEntry[] = [
    { bar: 'bg-accent text-bg', dot: 'bg-accent', soft: 'bg-accent/[0.18]', border: 'border-accent', text: 'text-accent' },
    { bar: 'bg-ok text-bg', dot: 'bg-ok', soft: 'bg-ok/[0.18]', border: 'border-ok', text: 'text-ok' },
    { bar: 'bg-warn text-bg', dot: 'bg-warn', soft: 'bg-warn/[0.18]', border: 'border-warn', text: 'text-warn' },
    { bar: 'bg-bad text-bg', dot: 'bg-bad', soft: 'bg-bad/[0.18]', border: 'border-bad', text: 'text-bad' },
    { bar: 'bg-accenth text-bg', dot: 'bg-accenth', soft: 'bg-accenth/[0.18]', border: 'border-accenth', text: 'text-accenth' },
];

export const PALETTE_LEN = PALETTE.length;

/** 저장소 순서 i 의 색 한 벌(음수·초과 모두 순환). */
export function paletteAt(i: number): PaletteEntry {
    return PALETTE[((i % PALETTE_LEN) + PALETTE_LEN) % PALETTE_LEN];
}
