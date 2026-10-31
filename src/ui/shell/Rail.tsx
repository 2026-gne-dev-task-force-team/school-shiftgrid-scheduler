/**
 * 왼쪽 아이콘 레일(최소판) — 사이드바 "바깥 왼쪽" 세로 띠. 폭은 치수 토큰(--s-rail).
 *
 * 🔴 ⛔ 이번 판은 "설정 아이콘이 살 자리" 를 만드는 것이 목적이다 — 드래그 재배치·패널 등록은
 *    하지 않는다(요구명세 W8 몫). 지금 올리는 것은: 위에 사이드바 토글 둘(자리표시) · 맨 아래 ⚙ 설정.
 * ⚠️ 좁은 화면에서는 이 레일을 안 그린다(WorkbenchScreen 이 narrow 로 가른다) — 하단 바는 W10 몫.
 *    설정은 좁은 화면에서도 열 수 있게 탭 줄에 ⚙ 를 하나 붙여 둔다(Tabs.tsx).
 * 🔴 색은 토큰으로만.
 */
import { IconButton } from '../primitives/IconButton';

export function Rail({
    leftOpen, rightOpen, onToggleLeft, onToggleRight, onOpenSettings,
}: {
    leftOpen: boolean;
    rightOpen: boolean;
    onToggleLeft: () => void;
    onToggleRight: () => void;
    onOpenSettings: () => void;
}) {
    return (
        <nav className="shrink-0 w-rail bg-panel border-r border-line flex flex-col items-center py-2 gap-1">
            {/* 위: 자리표시 — 좌·우 사이드바 토글 */}
            <IconButton icon="panelLeft" label="왼쪽 사이드바 접기/펴기" active={leftOpen} onClick={onToggleLeft} />
            <IconButton icon="panelRight" label="오른쪽 사이드바 접기/펴기" active={rightOpen} onClick={onToggleRight} />

            {/* 가운데는 비워 둔다 — 나중에 패널 아이콘이 쌓일 자리(W8) */}
            <div className="flex-1" />

            {/* 맨 아래 고정: 설정 */}
            <IconButton icon="gear" label="설정 열기" onClick={onOpenSettings} />
        </nav>
    );
}
