/**
 * ViewHeader — 뷰 맨 위 머리 한 줄: 앞(icon) · 제목(title) · 뒤(actions). 노드 머리(아이콘+제목)의 바탕 부품.
 *   title 은 글자든 입력(TitleField 등)이든 노드로 받는다. 높이는 머리줄 토큰.
 */
import type { ReactNode } from 'react';

export function ViewHeader({ icon, title, actions, className = '' }: {
    icon?: ReactNode;
    title: ReactNode;
    actions?: ReactNode;
    className?: string;
}) {
    return (
        <div className={`shrink-0 flex items-center gap-2 min-h-header px-pad border-b border-line ${className}`}>
            {icon && <div className="shrink-0 flex items-center">{icon}</div>}
            <div className="flex-1 min-w-0 text-lead font-semibold text-text truncate">{title}</div>
            {actions && <div className="shrink-0 flex items-center gap-1">{actions}</div>}
        </div>
    );
}
