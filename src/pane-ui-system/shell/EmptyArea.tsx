/**
 * 빈 자리 — 사이드바에 트리가 없을 때(left/right 가 null) 그리는 빈 면.
 * ⛔ 더미 패널을 미리 채우지 않는다 — 빈 면 + 한 줄 안내만. 내용은 끌어오거나 메뉴로 보낸다.
 *
 * 🔴 창틀은 자리가 무엇인지(도메인) 모른다 — 안내 글귀는 뜻 없는 「여기」 뿐이다.
 * ② 에서 접기·📌 꼭지가, ③ 에서 우클릭 뷰 고르기가 이 위에 올라붙는다.
 */
import type { ReactNode } from 'react';

export function EmptyArea({
    chrome,
    onContextMenu,
}: {
    /** 접기·📌 를 담는 얇은 머리줄 — 사이드바가 비어도 접고 고정할 수 있어야 한다 */
    chrome?: ReactNode;
    /** 빈 면 우클릭(손가락은 길게) — 뷰 고르기 메뉴 (③) */
    onContextMenu?: (x: number, y: number) => void;
}) {
    return (
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
            {chrome}
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
