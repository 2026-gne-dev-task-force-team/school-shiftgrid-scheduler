/**
 * 달력 툴바 한 벌 — 각 뷰의 머리줄(제목 · 이동 · 오늘 · 보기 전환)을 창틀 Toolbar 로 그린다(Q10 W6).
 *   Frame 안(저장소 범위)이면 Frame 의 toolbar 자리(머리 아래 · 본문 스크롤 밖)에 포털로 꽂고,
 *   자리가 아직 없으면 뷰 맨 위에 그대로 그린다. 꾸러미는 단추만 넘긴다.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { Toolbar, FrameToolbarPortal } from '../../../pane-ui-system';

export const CalBarHost = createContext<HTMLElement | null>(null);

export function CalBar({ children, end }: { children?: ReactNode; end?: ReactNode }) {
    const host = useContext(CalBarHost);
    return <FrameToolbarPortal host={host}><Toolbar label="달력 도구" end={end}>{children}</Toolbar></FrameToolbarPortal>;
}
