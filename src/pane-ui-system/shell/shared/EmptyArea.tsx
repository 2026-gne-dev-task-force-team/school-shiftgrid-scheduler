/**
 * 빈 자리 — 사이드바에 트리가 없을 때(left/right 가 null) 그리는 빈 면.
 * ⛔ 더미 패널을 미리 채우지 않는다 — 빈 면 + 한 줄 안내만. 내용은 끌어오거나 메뉴로 보낸다.
 *
 * 🔴 창틀은 자리가 무엇인지(도메인) 모른다 — 안내 글귀는 뜻 없는 「여기」 뿐이다. 뷰 이름은 등록소가 준다.
 * ⭐ 비어도 접기·📌 는 있어야 한다(쥔님이 빈 사이드바를 접을 길이 없으면 갇힌다) — 머리줄에 둔다.
 * ⭐ 빈 면 우클릭(손가락은 길게) → 뷰 등록소 목록에서 「여기에 열기」.
 */
import { useCallback, useState } from 'react';
import { IconButton } from '../../primitives/IconButton';
import { ContextMenu, type MenuEntry } from '../../primitives/ContextMenu';
import { useContextTrigger } from '../../primitives/useContextTrigger';
import { listViews } from '../../view-registry';
import type { RootChrome } from './WorkspaceView';

export function EmptyArea({
    chrome,
    onPick,
}: {
    /** 접기·📌 꼭지 — 넓은 화면 사이드바에서만 온다(좁은 화면·가운데는 없음) */
    chrome?: RootChrome;
    /** 뷰 고르기에서 하나를 골랐을 때 — 그 뷰를 이 자리에 연다 */
    onPick?: (viewId: string) => void;
}) {
    const isLeft = chrome?.side === 'left';
    const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
    const trigger = useContextTrigger((x, y) => { if (onPick) setMenu({ x, y }); });

    const items: MenuEntry[] = [
        { label: '여기에 열기', disabled: true },
        ...listViews().map((v) => ({ label: v.title, icon: v.icon, onClick: () => onPick?.(v.id) })),
    ];

    const collapseBtn = chrome && (
        <IconButton
            icon={isLeft ? 'left' : 'right'}
            label="사이드바 접기"
            onClick={chrome.onCollapse}
            className="shrink-0"
        />
    );
    const close = useCallback(() => setMenu(null), []);

    return (
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
            {chrome && (
                <div className="shrink-0 flex items-center gap-1 h-topbar px-pad border-b border-line bg-side2">
                    {isLeft && collapseBtn}
                    <div className="flex-1" />
                    <IconButton
                        icon="pin"
                        label={chrome.pinned ? '사이드바 고정 해제' : '사이드바 고정'}
                        active={chrome.pinned}
                        onClick={chrome.onTogglePin}
                    />
                    {!isLeft && collapseBtn}
                </div>
            )}
            {/* 🔴 data-empty-area — 드롭이 여기로 떨어지면 그 자리(left/right) 이름으로 moveLeaf(resolveDropAt) */}
            <div className="flex-1 min-h-0 grid place-items-center bg-side px-8 py-6 text-center" data-empty-area={chrome?.side} {...trigger}>
                {/* 🔴 상자 배경 없이 글자만 · 좁아도 자연스럽게 줄바꿈(max-w + text-balance) · 세로 가운데(항목 3) */}
                <p className="max-w-[15rem] text-[13px] text-muted/80 select-none leading-relaxed text-balance">
                    비어 있습니다. 여기로 끌어오거나 메뉴로 보내세요.
                </p>
            </div>
            {menu && <ContextMenu x={menu.x} y={menu.y} items={items} onClose={close} />}
        </div>
    );
}
