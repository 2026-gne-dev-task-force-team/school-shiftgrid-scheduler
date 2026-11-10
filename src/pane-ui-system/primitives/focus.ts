/**
 * 포커스 링 — 키보드 탭으로 왔을 때만 파란 테두리 하나. 창틀·플러그인이 공유하는 단일 원본.
 * 🔴 ⛔ 완성된 클래스 문자열이어야 Tailwind 가 정적으로 읽는다 — 동적 조립(변수 이어붙이기) 금지.
 */
export const FOCUS_RING = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

/** 눌리는 칸 공통 상태 — hover 배경 · disabled 흐림(IconButton·Button 과 같은 값). 포커스는 FOCUS_RING 을 따로 붙인다 */
export const PRESS_STATE = 'transition-colors duration-fast hover:bg-text/[0.06] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent';

/** 여러 줄짜리 카드·목록 줄을 「눌리는 칸」으로 — 고정 높이 Button 이 안 맞을 때. Enter·Space 로도 눌린다. */
export function pressProps(fn: () => void) {
    return {
        role: 'button' as const,
        tabIndex: 0,
        onClick: fn,
        onKeyDown: (e: { key: string; preventDefault(): void }) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } },
    };
}

/**
 * 방금 연 화면이 그려질 때까지(최대 ~1초) 기다렸다가 selector 칸에 초점을 준다 — 새 페이지·새 시트가 BODY 에 초점을 남기지 않게(#49).
 * 그 사이 쥔님이 다른 입력칸으로 옮겼으면(초점이 body 가 아니면) 가만둔다.
 */
export function focusWhenReady(selector: string, select = false): void {
    if (typeof document === 'undefined') return;
    let tries = 0;
    const go = () => {
        const a = document.activeElement;
        if (a && a !== document.body && tries > 0 && !a.matches(selector) && a.matches('input, textarea, [contenteditable]')) return;
        const el = Array.from(document.querySelectorAll<HTMLElement>(selector)).find((e) => e.offsetParent !== null || e.getClientRects().length > 0);
        if (el) { el.focus({ preventScroll: true }); if (select && el instanceof HTMLInputElement) el.select(); return; }
        if (++tries < 30) setTimeout(go, 30);
    };
    setTimeout(go, 0);
}

/**
 * 입력칸 초점 — 마우스로 눌러도 보인다(입력은 커서 자리라). 테두리가 강조색으로 + 옅은 바깥 고리.
 * 🔴 ⛔ 완성된 클래스 문자열(Tailwind 정적 스캔) — 이어붙이기 금지.
 */
export const FOCUS_FIELD = 'focus:border-accent focus:outline focus:outline-2 focus:outline-accent/30 outline-offset-0';

/** 입력칸 잘못된 값 모양 — 테두리·초점 고리가 경고색. FOCUS_FIELD 뒤에 붙여 이기게 한다 */
export const INVALID = 'border-bad focus:border-bad focus:outline-bad/30';
