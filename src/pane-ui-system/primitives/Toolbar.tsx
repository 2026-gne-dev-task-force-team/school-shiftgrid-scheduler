/**
 * Toolbar — 뷰 안쪽 도구 줄. 높이는 머리줄 토큰(h-header)이라 탭 줄·패널 머리와 단차가 안 난다.
 *   왼쪽은 children, 오른쪽은 end. 단추는 IconButton·Button 을 그대로 넣는다.
 */
import type { ReactNode } from 'react';

export function Toolbar({ children, end, label = '도구 줄', className = '', scroll = false, wrap = false }: {
    children?: ReactNode;
    end?: ReactNode;
    label?: string;
    className?: string;
    /** 단추가 많아 좁은 폭에서 넘칠 때 가로 스크롤(떠오르는 메뉴가 안에 있으면 켜지 말 것 — 잘린다). */
    scroll?: boolean;
    /** 좁으면 묶음 단위로 두 줄로 내려앉는다(가로 스크롤 없음). 높이는 최소 머리줄. scroll 보다 앞선다. */
    wrap?: boolean;
}) {
    return (
        <div role="toolbar" aria-label={label} className={`shrink-0 flex items-center gap-1 ${wrap ? 'min-h-header flex-wrap py-0.5' : 'h-header'} px-pad border-b border-line bg-panel ${className}`}>
            <div className={`flex items-center gap-1 min-w-0${wrap ? ' flex-wrap gap-x-3' : scroll ? ' overflow-x-auto' : ''}`}>{children}</div>
            <div className={wrap ? 'flex-1' : 'flex-1 min-w-0'} />
            {end && <div className="flex items-center gap-1 shrink-0">{end}</div>}
        </div>
    );
}
