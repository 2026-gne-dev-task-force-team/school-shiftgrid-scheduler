/**
 * IconButton — 아이콘 하나짜리 단추. 호버는 배경만 살짝(노션 룩), 활성일 때만 글자가 진해진다.
 * 🔴 색은 토큰으로만(여기서 쓴다). 포커스 테두리는 파랑 하나.
 */
import type { MouseEvent } from 'react';
import { Icon, type IconName } from './Icon';
import { FOCUS_RING } from './focus';

export function IconButton({
    icon,
    label,
    onClick,
    size = 16,
    active = false,
    className = '',
    title,
    rowId,
    data,
    disabled = false,
    onMouseDown,
}: {
    icon: IconName;
    /** 스크린리더용 이름 (title 이 없으면 툴팁으로도 쓴다) */
    label: string;
    onClick?: (e: MouseEvent) => void;
    size?: number;
    active?: boolean;
    className?: string;
    title?: string;
    /** data-row-id — 드래그/우클릭 위임이 어느 항목인지 더듬을 때(리본 아이콘). 값은 뜻 없는 식별자다 */
    rowId?: string;
    /** 임의 data-* 표식 — 리본이 「뷰냐 동작이냐」를 DOM 에 심을 때(뜻은 창틀이 모른다). 키는 'data-...' 통째로 */
    data?: Record<string, string | number | undefined>;
    disabled?: boolean;
    /** 눌러도 입력칸·표의 초점·선택을 뺏기지 않게 preventDefault 할 때(도구 줄) */
    onMouseDown?: (e: MouseEvent) => void;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            title={title ?? label}
            data-row-id={rowId}
            {...data}
            disabled={disabled}
            onMouseDown={onMouseDown}
            onClick={onClick}
            className={`grid place-items-center w-btn h-btn rounded shrink-0 transition-colors
                hover:bg-text/[0.06] ${FOCUS_RING} disabled:opacity-40 disabled:pointer-events-none
                ${active ? 'text-text bg-text/[0.06]' : 'text-muted hover:text-text'} ${className}`}
        >
            <Icon name={icon} size={size} />
        </button>
    );
}
