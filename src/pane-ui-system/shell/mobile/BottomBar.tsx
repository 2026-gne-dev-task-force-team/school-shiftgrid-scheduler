/**
 * 하단 플로팅 바(좁은 화면) — 데스크톱의 「왼쪽 세로 띠」가 폰에선 이 가로 바가 된다(아이콘 배열 하나, 두 모양).
 *   기본 3개: ◧ 왼쪽 서랍 · ▦ 탭 전환(열린 탭 수 뱃지) · ◨ 오른쪽 서랍.
 *   그 외 항목은 앱이 꽂는다(items) — ⛔ 창틀은 무엇을 넣을지 모른다.
 *
 * 🔴 쥔님 2026-10-31: *"플로팅 · 가운데 하단 · 마진 여백 충분히 · 넘치면 가로 스크롤 ·
 *    오른쪽에 스크롤 안 하는 고정 버튼"*.
 *   - 가운데(앱 항목) 영역만 가로로 스크롤한다 · pinned 항목은 오른쪽에 고정(splitBarItems)
 *   - ◧ 는 왼쪽 고정, ▦·◨ 는 오른쪽 고정 — 많이 꽂혀도 손잡이가 안 밀려난다
 * 🔴 키보드가 올라오면 바를 숨긴다(visualViewport) — 키보드 위에 뜨면 화면 절반이 바가 된다.
 */
import { useEffect, useState } from 'react';
import { Icon, type IconName } from '../../primitives/Icon';
import { FOCUS_RING } from '../../primitives/focus';
import { splitBarItems } from '../../layout/mobile';

/** 앱이 바에 꽂는 항목 하나 — 아이콘·동작만. pinned 면 오른쪽에 고정(스크롤 안 함) */
export interface BarItem {
    id: string;
    icon: IconName;
    label: string;
    onClick: () => void;
    /** ▦ 처럼 숫자 뱃지 */
    badge?: number;
    /** 오른쪽 고정(가로 스크롤에서 빠진다) */
    pinned?: boolean;
}

/** 키보드(가상 뷰포트 축소)가 올라왔나 — 올라오면 바를 숨긴다 */
function useKeyboardOpen(): boolean {
    const [open, setOpen] = useState(false);
    useEffect(() => {
        const vv = typeof window !== 'undefined' ? window.visualViewport : null;
        if (!vv) return;
        const on = () => setOpen(window.innerHeight - vv.height > 150);
        vv.addEventListener('resize', on);
        on();
        return () => vv.removeEventListener('resize', on);
    }, []);
    return open;
}

function BarButton({ icon, label, onClick, badge }: Omit<BarItem, 'id' | 'pinned'>) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            onClick={onClick}
            className={`relative grid place-items-center w-btn h-btn rounded-full shrink-0 transition-colors
                text-muted hover:text-text hover:bg-text/[0.06]
                ${FOCUS_RING}`}
        >
            <Icon name={icon} size={18} />
            {badge != null && badge > 0 && (
                <span
                    aria-hidden="true"
                    className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-[3px] grid place-items-center
                        rounded-full bg-accent text-bg text-[10px] leading-none font-medium"
                >
                    {badge > 99 ? '99+' : badge}
                </span>
            )}
        </button>
    );
}

export function BottomBar({
    items, tabCount, onOpenLeft, onOpenRight, onOpenTabs, onOpenRibbon, aboveStatusBar = false,
}: {
    /** 앱이 꽂는 그 외 항목 — ⛔ 창틀은 무엇인지 모른다 */
    items: BarItem[];
    /** ▦ 뱃지 — 열린 탭 수 */
    tabCount: number;
    onOpenLeft: () => void;
    onOpenRight: () => void;
    onOpenTabs: () => void;
    /** 🔴 ▤ 리본 — 누르면 리본 시트(RibbonSheet)를 연다(쥔님 2026-11-01 ⑤). 안 주면 ▤ 를 안 그린다 */
    onOpenRibbon?: () => void;
    /** 🔴 좁은 화면 상태바가 켜져 있으면 그 높이(--s-statusbar)만큼 더 띄운다 — 바가 상태바를 덮지 않게(판 A) */
    aboveStatusBar?: boolean;
}) {
    const keyboard = useKeyboardOpen();
    if (keyboard) return null;   // 키보드 위에 안 띄운다

    const { scroll, pinned } = splitBarItems(items);

    return (
        // 가운데 하단 · 플로팅 · 마진 여백(좌우 + 하단 안전 영역) · 넘치면 pill 이 화면을 안 벗어나게 max-w
        <nav
            aria-label="하단 바"
            className="ui-chrome-nodrag fixed left-1/2 -translate-x-1/2 z-[120]
                flex items-center gap-1 max-w-[calc(100vw-1.5rem)]
                bg-panel border border-line rounded-full shadow-lg px-1.5 py-1"
            style={{ bottom: `calc(env(safe-area-inset-bottom) + 14px${aboveStatusBar ? ' + var(--s-statusbar)' : ''})` }}
        >
            {/* ◧ 왼쪽 서랍 — 왼쪽 고정 */}
            <BarButton icon="panelLeft" label="왼쪽 사이드바" onClick={onOpenLeft} />

            {/* ▤ 리본 — 왼쪽 고정(◧ 바로 옆). 누르면 리본 시트가 올라온다(⑤). 데스크톱은 세로 리본(Rail)이 그 몫 */}
            {onOpenRibbon && <BarButton icon="menu" label="리본" onClick={onOpenRibbon} />}

            {/* 가운데: 앱 항목만 가로 스크롤(넘칠 때) */}
            {scroll.length > 0 && (
                <div className="flex items-center gap-1 min-w-0 overflow-x-auto tab-scroll">
                    {scroll.map((it) => (
                        <BarButton key={it.id} icon={it.icon} label={it.label} onClick={it.onClick} badge={it.badge} />
                    ))}
                </div>
            )}

            {/* 오른쪽 고정: 앱 pinned 항목 → ▦ 탭 전환 → ◨ 오른쪽 서랍 */}
            {pinned.map((it) => (
                <BarButton key={it.id} icon={it.icon} label={it.label} onClick={it.onClick} badge={it.badge} />
            ))}
            <BarButton icon="copy" label="탭 전환" onClick={onOpenTabs} badge={tabCount} />
            <BarButton icon="panelRight" label="오른쪽 사이드바" onClick={onOpenRight} />
        </nav>
    );
}
