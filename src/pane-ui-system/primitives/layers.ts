/**
 * 떠 있는 층의 Esc 줄 — Dialog·Popover·ContextMenu 가 열릴 때 제 닫기를 올리고, 닫힐 때 내린다.
 *   Esc 한 번은 「맨 위 층」 하나만 닫는다 — 대화창 안 팝오버에서 Esc 를 누르면 팝오버만 닫힌다.
 *   🔴 왜 줄이 필요한가: 층마다 window capture 리스너를 따로 걸면 「먼저 건 쪽(바깥 대화창)」이 먼저 불려 둘 다 닫힌다.
 *      그래서 리스너는 하나만 걸고, 그 안에서 맨 위만 부른 뒤 stopImmediatePropagation 으로 다른 Esc 처리기를 막는다.
 *   ⭐ 「맨 위」 = 안에 열린 층이 없는 층 중 가장 나중에 올린 것. 같이 마운트되면 자식 효과가 부모보다 먼저 돌아
 *      올린 순서만으로는 뒤집히므로, React 트리의 부모 층(LayerContext)을 함께 적어 둔다.
 */
import { createContext, useContext, useState } from 'react';

type Closer = () => void;
export interface LayerToken { parent: LayerToken | null }
interface Entry { close: Closer; token: LayerToken | null }

const stack: Entry[] = [];
let installed = false;

/** 떠 있는 층이 제 자식에게 「내가 부모 층이다」를 알린다 */
export const LayerContext = createContext<LayerToken | null>(null);

/** 이 층의 표 — 부모 층을 기억한다. 층 컴포넌트는 children 을 <LayerContext.Provider value={token}> 로 감싼다. */
export function useLayerToken(): LayerToken {
    const parent = useContext(LayerContext);
    const [token] = useState<LayerToken>(() => ({ parent }));
    token.parent = parent;
    return token;
}

function hasOpenChild(token: LayerToken | null): boolean {
    if (!token) return false;
    return stack.some((e) => {
        for (let p = e.token?.parent ?? null; p; p = p.parent) if (p === token) return true;
        return false;
    });
}

function onKey(e: KeyboardEvent) {
    if (e.key !== 'Escape' || stack.length === 0) return;
    for (let i = stack.length - 1; i >= 0; i--) {
        if (hasOpenChild(stack[i].token)) continue;
        e.stopPropagation();
        e.stopImmediatePropagation();
        stack[i].close();
        return;
    }
}

/** 층 하나를 올린다. 돌려받은 함수로 내린다(useEffect 정리에서). */
export function pushEscapeLayer(close: Closer, token: LayerToken | null = null): () => void {
    if (!installed && typeof window !== 'undefined') {
        window.addEventListener('keydown', onKey, true);
        installed = true;
    }
    const entry: Entry = { close, token };
    stack.push(entry);
    return () => {
        const i = stack.indexOf(entry);
        if (i >= 0) stack.splice(i, 1);
    };
}
