/**
 * 떠 있는 층의 Esc 줄 — Dialog·Popover·ContextMenu 가 열릴 때 제 닫기를 올리고, 닫힐 때 내린다.
 *   Esc 한 번은 「맨 위(가장 나중에 연) 층」 하나만 닫는다 — 대화창 안 팝오버에서 Esc 를 누르면 팝오버만 닫힌다.
 *   🔴 왜 줄이 필요한가: 층마다 window capture 리스너를 따로 걸면 「먼저 건 쪽(바깥 대화창)」이 먼저 불려 둘 다 닫힌다.
 *      그래서 리스너는 하나만 걸고, 그 안에서 맨 위만 부른 뒤 stopImmediatePropagation 으로 다른 Esc 처리기를 막는다.
 */
type Closer = () => void;
const stack: Closer[] = [];
let installed = false;

function onKey(e: KeyboardEvent) {
    if (e.key !== 'Escape' || stack.length === 0) return;
    e.stopPropagation();
    e.stopImmediatePropagation();
    stack[stack.length - 1]();
}

/** 층 하나를 올린다. 돌려받은 함수로 내린다(useEffect 정리에서). */
export function pushEscapeLayer(close: Closer): () => void {
    if (!installed && typeof window !== 'undefined') {
        window.addEventListener('keydown', onKey, true);
        installed = true;
    }
    stack.push(close);
    return () => {
        const i = stack.lastIndexOf(close);
        if (i >= 0) stack.splice(i, 1);
    };
}
