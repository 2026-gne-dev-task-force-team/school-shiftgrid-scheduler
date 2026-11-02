/**
 * 카드 피크 조종기 — 일정 카드를 미리보기(peek)에 열고·교체하고·닫는 상태 전이 하나.
 *   🔴 창틀의 PeekHandle 은 ReactNode(show)를 받지만, 여기선 render(id)→node 로 갈라 React 없이 테스트된다.
 *   전이 셋뿐: open(id) = 그 일정 카드를 show(이미 떠 있으면 내용만 교체 — 새 창이 아니다) · close() = hide.
 *   「열린 id」 한 장만 쥔다. ⛔ 「자료에서 사라짐」은 여기서 안 본다 — 카드 안(EventCardPeek)이 제 구독으로 닫는다.
 */
import type { ReactNode } from 'react';

/** 피크 손잡이에서 이 조종기가 쓰는 것만 — show·hide 둘뿐(visible 은 안 본다). */
export interface MinimalPeek {
    show(node: ReactNode, opts?: { wideMin?: number }): void;
    hide(): void;
}

export interface CardPeek {
    /** 그 일정의 카드를 미리보기에 띄운다 — 이미 떠 있으면 내용만 바뀐다(새 창 아님). */
    open(id: string): void;
    /** 미리보기를 닫는다 — 이미 닫혀 있으면 아무 일 없음(hide 를 다시 안 부른다). */
    close(): void;
    /** 지금 열린 일정 id(없으면 null) */
    openId(): string | null;
}

export function makeCardPeek(peek: MinimalPeek, render: (id: string) => ReactNode, wideMin = 420): CardPeek {
    let id: string | null = null;
    return {
        open(next) { id = next; peek.show(render(next), { wideMin }); },
        close() { if (id === null) return; id = null; peek.hide(); },
        openId() { return id; },
    };
}
