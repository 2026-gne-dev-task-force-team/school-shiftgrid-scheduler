/**
 * 새 일정을 만든 직후 — 미리보기 안 제목 입력으로 초점을 옮기고 글자를 전부 고른다(R3-C).
 *   미리보기는 show() 뒤 한두 프레임 늦게 그려지므로 입력이 나타날 때까지 프레임마다 다시 본다(최대 20프레임).
 *   ⛔ 사용자가 그 사이 다른 입력칸으로 옮겼으면 뺏지 않는다.
 */
export function focusPeekTitle(frames = 20): void {
    if (typeof document === 'undefined') return;
    const start = document.activeElement;
    const tick = (left: number) => {
        const t = document.querySelector<HTMLInputElement>('[role="complementary"][aria-label="미리보기"] :is(input,textarea)[aria-label="제목"]');
        if (t) {
            const a = document.activeElement;
            // 처음 초점이 그대로이거나(BODY·열린 자리) 미리보기 안이면 덮는다 — 남의 입력칸이면 존중
            const mine = !a || a === document.body || a === start || t.closest('[role="complementary"]')?.contains(a);
            if (mine) { t.focus(); t.select(); }
            return;
        }
        if (left > 0) requestAnimationFrame(() => tick(left - 1));
    };
    tick(frames);
}
