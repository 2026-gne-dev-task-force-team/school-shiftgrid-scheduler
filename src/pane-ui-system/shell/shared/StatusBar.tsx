/**
 * 하단 상태바 — 전체 폭 아래 한 줄(높이 --s-statusbar). 판 A(쥔님 2026-11-01:
 *   *"하단에는 인포메이션 상태줄들이 있고"*). 틀이 자리만 그리고, 꽂을 항목은 앱이 넘긴다.
 *
 * 🔴 ⛔ 창틀은 무엇을 꽂을지(도메인) 모른다 — items 배열을 받아 side('left'|'right')로 갈라 양 끝에 둔다.
 *    항목은 글자(text)이거나 임의 노드(node)이고, onClick 이 있으면 눌리는 단추가 된다(없으면 그냥 글자).
 * 🔴 색은 토큰으로만(구조 검사 ①). 보임/숨김·좁은 화면 기본 숨김은 WorkbenchScreen 이 가른다 — 여긴 늘 그린다.
 */
import type { ReactNode } from 'react';
import { FOCUS_RING } from '../../primitives/focus';

/** 상태바에 앱이 꽂는 항목 하나 — text 나 node 중 하나. onClick 있으면 단추 */
export interface StatusItem {
    id: string;
    text?: string;
    node?: ReactNode;
    side: 'left' | 'right';
    onClick?: () => void;
}

function Item({ it }: { it: StatusItem }) {
    const content = it.node ?? it.text;
    if (it.onClick) {
        return (
            <button
                type="button"
                onClick={it.onClick}
                className={`shrink-0 px-1 rounded text-muted hover:text-text hover:bg-text/[0.06] transition-colors
                    ${FOCUS_RING} truncate max-w-[40vw]`}
            >
                {content}
            </button>
        );
    }
    return <span className="shrink-0 truncate max-w-[40vw]">{content}</span>;
}

export function StatusBar({ items }: { items: StatusItem[] }) {
    const left = items.filter((i) => i.side === 'left');
    const right = items.filter((i) => i.side === 'right');
    return (
        // 🔴 상태바는 사이드바 탭 줄과 같은 한 단 어두운 바탕(bg-side2) — 가운데 캔버스(bg-bg)와 갈린다.
        <div className="shrink-0 flex items-center gap-3 h-statusbar px-pad border-t border-line bg-side2 text-[11px] text-muted select-none">
            <div className="flex items-center gap-3 min-w-0">{left.map((it) => <Item key={it.id} it={it} />)}</div>
            <div className="flex-1 min-w-0" />
            <div className="flex items-center gap-3 min-w-0 justify-end">{right.map((it) => <Item key={it.id} it={it} />)}</div>
        </div>
    );
}
