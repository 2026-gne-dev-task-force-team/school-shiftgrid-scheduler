/**
 * 전역 상호작용 가드 — 🔴 ⭐ 「UI 는 기본적으로 선택도 우클릭도 안 된다」를 한 곳에서 못 박는다
 *   (쥔님 2026-11-01, 두 번 지시: *"UI 텍스트 셀렉트나 우클릭 그것 좀 전역적으로 통제해 줘"* ·
 *    *"UI 기본적으로 마우스 셀렉트 안 되게 해 줘"* · *"우클릭도"*).
 *
 * 🔴 기본값을 뒤집는다 — 선택 차단은 index.css(html { user-select: none })가 쥐고,
 *    여기서는 「브라우저 기본 우클릭 메뉴」를 전역에서 막는다. 둘 다 예외 자리에서만 되살아난다.
 *
 * ⭐ 예외(옵트인) 자리는 단 하나의 셀렉터로 — ⛔ 자리마다 흩뿌리지 않는다(그게 「전역」이 깨지는 길이다):
 *   ① 입력칸: input · textarea · [contenteditable="true"] — 붙여넣기 메뉴가 떠야 한다
 *   ② 「문서·글 내용」임을 뷰가 밝힌 자리: .select-text · .view-body(옵트인 클래스)
 *      — 이 클래스를 아무 데나 켜지 못하게 구조 검사(structure.test.ts)가 예외 목록을 지킨다.
 *
 * ⛔ 이 셀렉터 문자열은 이 파일에만 산다 — 다른 데로 복사하면 전역 규칙이 두 벌로 낡는다.
 */

/** 글자 선택·기본 우클릭을 되살리는 옵트인 자리 — 입력칸 + 「본문 글자」 클래스 둘 */
export const SELECTABLE_SELECTOR =
    'input, textarea, [contenteditable="true"], [contenteditable=""], .select-text, .view-body';

/**
 * 전역 contextmenu 를 막는다 — 위 예외 자리 안에서는 기본 메뉴를 그대로 둔다(붙여넣기).
 *   🔴 우리 우클릭 메뉴(useContextTrigger·useDragLeaf)는 제 자리에서 이미 preventDefault 하고 뜬다 —
 *      이 가드는 「그 밖의 어디서도 기본 메뉴가 안 뜨게」 하는 바닥이다.
 * 되돌리는 손잡이(dispose)를 돌려준다 — 앱이 마운트에서 걸고 언마운트에서 뗀다.
 */
export function installContextMenuGuard(doc: Document = document): () => void {
    const onContextMenu = (e: MouseEvent) => {
        const t = e.target as Element | null;
        if (t && t.closest(SELECTABLE_SELECTOR)) return;   // 입력칸·본문 — 기본 메뉴 허용
        e.preventDefault();
    };
    doc.addEventListener('contextmenu', onContextMenu);
    return () => doc.removeEventListener('contextmenu', onContextMenu);
}
