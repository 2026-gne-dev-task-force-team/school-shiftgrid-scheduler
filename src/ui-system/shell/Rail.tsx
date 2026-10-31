/**
 * 왼쪽 아이콘 레일(최소판) — 사이드바 "바깥 왼쪽" 세로 띠. 폭은 치수 토큰(--s-rail).
 *
 * 🔴 ⛔ 여기는 「앱 리본」이다 — 앱 기능(명령)·패널 아이콘이 사는 자리다(쥔님: *"메뉴는 아까 앱리본이였고"*).
 *    ⛔ 사이드바 접기/펴기 아이콘을 여기 두지 말 것 (쥔님 판정 2026-10-31 22:12:
 *    *"저 사이드바 펼치고 접는 아이콘 저기 있으면 안되지 · 옵시디언 좀 참고해라"*).
 *    사이드바를 접고 펴는 길은 이미 둘이다 — 폭 손잡이 두 번 누르기 · 접힌 레일의 단추.
 * ⛔ 드래그 재배치·패널 등록은 하지 않는다(요구명세 W8 몫).
 * ⚠️ 좁은 화면에서는 이 레일을 안 그린다(WorkbenchScreen 이 narrow 로 가른다) — 하단 바는 W10 몫.
 *    설정은 좁은 화면에서도 열 수 있게 탭 줄에 ⚙ 를 하나 붙여 둔다(Tabs.tsx).
 * 🔴 색은 토큰으로만.
 */
import { IconButton } from '../primitives/IconButton';

export function Rail({
    onAdd, onOpenSettings,
}: {
    onAdd: () => void;
    onOpenSettings: () => void;
}) {
    return (
        <nav className="shrink-0 w-rail bg-panel border-r border-line flex flex-col items-center py-2.5 gap-2">
            {/* 위: 앱 기능(명령) 아이콘 — 지금은 「새 표」 하나뿐이다 */}
            <IconButton icon="plus" label="새 표" onClick={onAdd} />

            {/* 가운데는 비워 둔다 — 나중에 패널·명령 아이콘이 쌓일 자리(W8) */}
            <div className="flex-1" />

            {/* 맨 아래 고정: 설정 */}
            <IconButton icon="gear" label="설정 열기" onClick={onOpenSettings} />
        </nav>
    );
}
