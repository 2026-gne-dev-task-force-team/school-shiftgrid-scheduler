/**
 * 뷰가 일정 카드를 미리보기(peek)로 여는 손잡이 — open(id)/close().
 *   🔴 EditorArea 의 PeekHandle(show·hide)을 받아 card-peek 조종기로 감싼다 · 내용은 EventCardPeek 가 자족으로 그린다.
 *   🔴 뷰가 사라지면(탭 닫기·모드 전환) 열린 카드도 닫는다(유령 방지) — 언마운트 정리.
 *   ⭐ 컴포넌트(EventCardPeek)와 갈라 둔다 — 한 파일이 컴포넌트+훅을 같이 내보내면 fast-refresh 가 경고한다.
 */
import { useCallback, useEffect, useMemo } from 'react';
import type { PeekHandle } from '../../../pane-ui-system';
import { EventCardPeek } from './EventCardPeek';
import { makeCardPeek, type CardPeek } from './card-peek';

/** 미리보기 폭 가름 — 칸이 이보다 넓으면 오른쪽에서 밀고, 좁으면 아래에서 덮는다(EditorArea). */
const WIDE_MIN = 420;

export function useCardPeek(peek: PeekHandle): CardPeek {
    const { show, hide } = peek;
    const render = useCallback((id: string) => <EventCardPeek eventId={id} onClose={hide} />, [hide]);
    const ctrl = useMemo(() => makeCardPeek({ show, hide }, render, WIDE_MIN), [show, hide, render]);
    // 뷰가 사라지면(탭 닫기·모드 전환) 열린 카드도 닫는다
    useEffect(() => () => ctrl.close(), [ctrl]);
    return ctrl;
}
