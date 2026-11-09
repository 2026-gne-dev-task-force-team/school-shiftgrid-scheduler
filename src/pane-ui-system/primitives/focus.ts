/**
 * 포커스 링 — 키보드 탭으로 왔을 때만 파란 테두리 하나. 창틀·플러그인이 공유하는 단일 원본.
 * 🔴 ⛔ 완성된 클래스 문자열이어야 Tailwind 가 정적으로 읽는다 — 동적 조립(변수 이어붙이기) 금지.
 */
export const FOCUS_RING = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

/** 여러 줄짜리 카드·목록 줄을 「눌리는 칸」으로 — 고정 높이 Button 이 안 맞을 때. Enter·Space 로도 눌린다. */
export function pressProps(fn: () => void) {
    return {
        role: 'button' as const,
        tabIndex: 0,
        onClick: fn,
        onKeyDown: (e: { key: string; preventDefault(): void }) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } },
    };
}
