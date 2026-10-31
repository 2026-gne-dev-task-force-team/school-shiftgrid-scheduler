/**
 * 왼쪽 아이콘 레일(리본) — 사이드바 "바깥 왼쪽" 세로 띠. 폭은 치수 토큰(--s-rail).
 *
 * 🔴 ⛔ 여기는 「앱 리본」이다 — 앱 기능(명령)·동작 아이콘이 사는 자리다(쥔님: *"엑셀 상단 리본처럼"*).
 *    ⛔ 사이드바 접기/펴기 아이콘을 여기 두지 말 것 (쥔님 판정 2026-10-31 22:12).
 *    사이드바를 접고 펴는 길은 이미 둘이다 — 폭 손잡이 두 번 누르기 · 가운데 탭 줄 끝의 ◧/◨.
 *
 * ⭐ 2026-11-01(W4): 아이콘을 하드코딩하지 않는다 — 뷰 등록소(listRibbonViews)를 읽어 order 순으로 줄 세운다.
 *    ⛔ 창틀은 그 아이콘이 무슨 뷰인지(도메인) 모른다 — 누르면 onOpenView(id) 로 앱에 넘긴다.
 *    「새 표 ＋」도 이제 sheet 뷰의 리본 등록일 뿐이다.
 * ⛔ 드래그 재배치는 하지 않는다(요구명세 W8 몫).
 * ⚠️ 좁은 화면에서는 이 레일을 안 그린다(WorkbenchScreen 이 narrow 로 가른다) — 하단 바는 W10 몫.
 * 🔴 색은 토큰으로만.
 */
import type { CSSProperties } from 'react';
import { IconButton } from '../primitives/IconButton';
import { listRibbonViews } from '../view-registry';

export function Rail({
    onOpenView, onOpenSettings,
}: {
    /** 리본 아이콘을 눌렀을 때 — 그 뷰를 defaultArea 에 연다(앱이 정한다) */
    onOpenView: (viewId: string) => void;
    onOpenSettings: () => void;
}) {
    const views = listRibbonViews();
    // ⭐ 리본 안에서만 아이콘 버튼이 커진다 — --s-btn 을 리본 값으로 바꿔치기한다(옵시디언 눈금).
    return (
        <nav
            className="shrink-0 w-rail bg-panel border-r border-line flex flex-col items-center py-2 gap-1"
            style={{ '--s-btn': 'var(--s-railbtn)' } as CSSProperties}
        >
            {/* 위: 등록된 리본 뷰들 — 아이콘·순서는 등록소가 준다 */}
            {views.map((v) => (
                <IconButton key={v.id} icon={v.icon ?? 'dot'} label={v.title} size={18} onClick={() => onOpenView(v.id)} />
            ))}

            {/* 가운데는 비워 둔다 — 나중에 명령 아이콘이 더 쌓일 자리(W8) */}
            <div className="flex-1" />

            {/* 맨 아래 고정: 설정 */}
            <IconButton icon="gear" label="설정 열기" size={18} onClick={onOpenSettings} />
        </nav>
    );
}
