/**
 * 빈 자리 — 사이드바에 트리가 없을 때(left/right 가 null) 그리는 빈 면.
 * ⛔ 더미 패널을 미리 채우지 않는다 — 빈 면 + 한 줄 안내만. 내용은 끌어오거나 메뉴로 보낸다.
 *
 * 🔴 창틀은 자리가 무엇인지(도메인) 모른다 — 안내 글귀는 뜻 없는 「여기」 뿐이다.
 * ⭐ 비어도 접기·📌 는 있어야 한다(쥔님이 빈 사이드바를 접을 길이 없으면 갇힌다) — 머리줄에 둔다.
 */
import { IconButton } from '../primitives/IconButton';
import type { RootChrome } from './WorkspaceView';

export function EmptyArea({
    chrome,
    onContextMenu,
}: {
    /** 접기·📌 꼭지 — 넓은 화면 사이드바에서만 온다(좁은 화면·가운데는 없음) */
    chrome?: RootChrome;
    /** 빈 면 우클릭(손가락은 길게) — 뷰 고르기 메뉴 (③) */
    onContextMenu?: (x: number, y: number) => void;
}) {
    const isLeft = chrome?.side === 'left';
    const collapseBtn = chrome && (
        <IconButton
            icon={isLeft ? 'left' : 'right'}
            label="사이드바 접기"
            onClick={chrome.onCollapse}
            className="shrink-0"
        />
    );
    return (
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
            {chrome && (
                <div className="shrink-0 flex items-center gap-1 h-topbar px-pad border-b border-line bg-panel2">
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
            <div
                className="flex-1 min-h-0 grid place-items-center bg-bg px-6 text-center"
                onContextMenu={onContextMenu
                    ? (e) => { e.preventDefault(); onContextMenu(e.clientX, e.clientY); }
                    : undefined}
            >
                <p className="text-[13px] text-muted/80 select-none leading-relaxed">
                    비어 있습니다.<br />여기로 끌어오거나 메뉴로 보내세요.
                </p>
            </div>
        </div>
    );
}
