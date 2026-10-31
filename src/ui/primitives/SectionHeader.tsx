/**
 * SectionHeader — 사이드바 칸 머리. 접기 삼각형 + 제목 + 끝단 단추 자리(슬롯).
 * ⛔ 끝단 단추는 늘 보인다 — Row 의 호버-숨김 판정을 여기로 복사하지 않는다(손가락 기기 함정).
 */
import type { ReactNode } from 'react';
import { Icon } from './Icon';

export function SectionHeader({
    title,
    collapsed = false,
    onToggle,
    end,
}: {
    title: string;
    collapsed?: boolean;
    onToggle?: () => void;
    /** 끝단 단추 자리 (예: + 단추). 늘 보인다 */
    end?: ReactNode;
}) {
    return (
        <div className="group flex items-center gap-1 h-7 px-2 shrink-0 select-none">
            <button
                type="button"
                onClick={onToggle}
                aria-label={collapsed ? `${title} 펴기` : `${title} 접기`}
                aria-expanded={!collapsed}
                className="grid place-items-center w-4 h-4 rounded text-muted hover:text-text transition-colors"
            >
                <Icon
                    name="right"
                    size={12}
                    className="transition-transform"
                    style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}
                />
            </button>
            <span className="flex-1 min-w-0 truncate text-[11px] font-semibold uppercase tracking-wide text-muted">
                {title}
            </span>
            {end && <span className="flex items-center shrink-0">{end}</span>}
        </div>
    );
}
