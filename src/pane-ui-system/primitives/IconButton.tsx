/**
 * IconButton — 아이콘 하나짜리 단추. 호버는 배경만 살짝(노션 룩), 활성일 때만 글자가 진해진다.
 *   size 기본 sm(예외 — 도구 막대가 본업): sm = w-btn h-btn · 아이콘 16 / md = w-field h-field · 아이콘 18.
 *   variant ghost(기본)·soft · tone neutral·accent·danger. 그 밖 button prop(aria-*·data-*·id…)은 rest 로 통과한다.
 * ⚠️ 옛 별칭(deprecated, U-잠금b 에서 제거): size={숫자} → iconSize · data={{…}} → 그냥 data-* 를 직접.
 * 🔴 색은 토큰으로만(여기서 쓴다). 포커스 테두리는 파랑 하나.
 */
import type { ButtonHTMLAttributes, MouseEvent } from 'react';
import { Icon, type IconName } from './Icon';
import { FOCUS_RING } from './focus';

const BOX = {
    sm: 'w-btn h-btn',
    md: 'w-field h-field',
} as const;

const TABLE = {
    ghost: {
        neutral: 'text-muted hover:text-text hover:bg-text/[0.06] active:bg-text/[0.12]',
        accent: 'text-accent hover:bg-accent/10 active:bg-accent/15',
        danger: 'text-bad hover:bg-bad/10 active:bg-bad/15',
    },
    soft: {
        neutral: 'text-text bg-text/[0.06] hover:bg-text/[0.1] active:bg-text/[0.14]',
        accent: 'text-accent bg-accent/10 hover:bg-accent/15 active:bg-accent/20',
        danger: 'text-bad bg-bad/10 hover:bg-bad/15 active:bg-bad/20',
    },
} as const;

const ACTIVE = {
    neutral: 'text-text bg-text/[0.06]',
    accent: 'text-accent bg-accent/10',
    danger: 'text-bad bg-bad/10',
} as const;

export function IconButton({
    icon,
    label,
    onClick,
    size = 'sm',
    variant = 'ghost',
    tone = 'neutral',
    iconSize,
    active = false,
    className = '',
    title,
    rowId,
    data,
    disabled = false,
    onMouseDown,
    ...rest
}: {
    icon: IconName;
    /** 스크린리더용 이름 (title 이 없으면 툴팁으로도 쓴다) */
    label: string;
    onClick?: (e: MouseEvent) => void;
    /** sm | md. ⚠️ 숫자는 옛 별칭(= iconSize, deprecated) */
    size?: 'sm' | 'md' | number;
    variant?: 'ghost' | 'soft';
    tone?: 'neutral' | 'accent' | 'danger';
    /** 아이콘 그림 크기(기본 sm 16 · md 18) */
    iconSize?: number;
    active?: boolean;
    className?: string;
    title?: string;
    /** data-row-id — 드래그/우클릭 위임이 어느 항목인지 더듬을 때(리본 아이콘). 값은 뜻 없는 식별자다 */
    rowId?: string;
    /** @deprecated data-* 를 그냥 prop 으로 쓴다(rest 통과). 키는 'data-...' 통째로 */
    data?: Record<string, string | number | undefined>;
    disabled?: boolean;
    /** 눌러도 입력칸·표의 초점·선택을 뺏기지 않게 preventDefault 할 때(도구 줄) */
    onMouseDown?: (e: MouseEvent) => void;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'onMouseDown' | 'title' | 'disabled' | 'className' | 'type'>) {
    const box: 'sm' | 'md' = size === 'md' ? 'md' : 'sm';
    const px = iconSize ?? (typeof size === 'number' ? size : box === 'md' ? 18 : 16);
    const tip = title ?? label;
    const btn = (
        <button
            type="button"
            aria-label={label}
            title={tip}
            data-row-id={rowId}
            {...data}
            {...rest}
            disabled={disabled}
            onMouseDown={onMouseDown}
            onClick={onClick}
            className={`hit-44 relative grid place-items-center ${BOX[box]} rounded-ctl shrink-0 transition-colors
                duration-fast ${FOCUS_RING} disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none
                ${active ? ACTIVE[tone] : TABLE[variant][tone]} ${className}`}
        >
            <Icon name={icon} size={px} />
        </button>
    );
    // 꺼진 단추는 마우스 이벤트가 안 가 title 이 안 뜬다(pointer-events-none) — 감싸는 span 이 title 을 든다
    return disabled ? <span title={tip} className="inline-flex shrink-0">{btn}</span> : btn;
}
