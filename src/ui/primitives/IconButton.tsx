/**
 * IconButton — 아이콘 하나짜리 단추. 호버는 배경만 살짝(노션 룩), 활성일 때만 글자가 진해진다.
 * 🔴 색은 토큰으로만(여기서 쓴다). 포커스 테두리는 파랑 하나.
 */
import type { MouseEvent } from 'react';
import { Icon, type IconName } from './Icon';

export function IconButton({
    icon,
    label,
    onClick,
    size = 16,
    active = false,
    className = '',
    title,
}: {
    icon: IconName;
    /** 스크린리더용 이름 (title 이 없으면 툴팁으로도 쓴다) */
    label: string;
    onClick?: (e: MouseEvent) => void;
    size?: number;
    active?: boolean;
    className?: string;
    title?: string;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            title={title ?? label}
            onClick={onClick}
            className={`grid place-items-center w-btn h-btn rounded shrink-0 transition-colors
                hover:bg-text/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent
                ${active ? 'text-text bg-text/[0.06]' : 'text-muted hover:text-text'} ${className}`}
        >
            <Icon name={icon} size={size} />
        </button>
    );
}
