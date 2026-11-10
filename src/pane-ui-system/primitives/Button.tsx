/**
 * Button — 글자 텍스트 단추 하나. 설정 판·플러그인이 쓰던 같은 보일러플레이트(h-btn·border·focus 링)를 한 곳에.
 *   variant ghost = 테두리만(옛 border-line·text-muted 꼴) · accent = 강조(옛 「설정 가기」 꼴).
 *   size sm = px-2 text-small · md = px-3 text-body.
 * 🔴 색은 토큰으로만 · 포커스 링은 FOCUS_RING 하나로. 그 외 button prop 은 그대로 넘긴다.
 * ⭐ 아이콘+글자는 한 줄 가운데 정렬(inline-flex — 아이콘이 block 이라 글자가 아래로 꺾이던 것) · 글자는 안 꺾이고(whitespace-nowrap) 좁은 줄에서도 안 눌린다(shrink-0) — 기본값이다(R1). 꾸러미가 덧대지 말 것.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { FOCUS_RING } from './focus';

/** 모든 변형 공통 disabled 모양 — 흐리게 · 금지 커서 · hover/active 배경 변화 없음 */
export const DISABLED = 'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:active:bg-transparent';

const VARIANT = {
    ghost: `border-line text-muted hover:text-text hover:bg-text/[0.04] active:bg-text/[0.1] ${DISABLED}`,
    accent: `border-accent text-text bg-text/[0.06] hover:bg-text/[0.1] active:bg-text/[0.14] ${DISABLED}`,
    // 도구 막대용 — 테두리 없이 글자만(표 도구 막대 등)
    plain: `border-transparent text-text hover:bg-text/[0.06] active:bg-text/[0.1] select-none ${DISABLED}`,
} as const;

const SIZE = {
    sm: 'px-2 text-small',
    md: 'px-3 text-body',
} as const;

export function Button({
    variant = 'ghost',
    size = 'md',
    className = '',
    type = 'button',
    children,
    ...rest
}: {
    variant?: 'ghost' | 'accent' | 'plain';
    size?: 'sm' | 'md';
    children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            type={type}
            className={`h-btn inline-flex items-center justify-center gap-1 whitespace-nowrap shrink-0 ${SIZE[size]} rounded border ${VARIANT[variant]} transition-colors duration-fast ${FOCUS_RING} ${className}`}
            {...rest}
        >
            {children}
        </button>
    );
}
