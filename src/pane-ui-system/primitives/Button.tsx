/**
 * Button — 글자 텍스트 단추 하나. 설정 판·플러그인이 쓰던 같은 보일러플레이트(h-btn·border·focus 링)를 한 곳에.
 *   variant ghost = 테두리만(옛 border-line·text-muted 꼴) · accent = 강조(옛 「설정 가기」 꼴).
 *   size sm = px-2 text-[12px] · md = px-3 text-[13px].
 * 🔴 색은 토큰으로만 · 포커스 링은 FOCUS_RING 하나로. 그 외 button prop 은 그대로 넘긴다.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { FOCUS_RING } from './focus';

const VARIANT = {
    ghost: 'border-line text-muted hover:text-text hover:bg-text/[0.04]',
    accent: 'border-accent text-text bg-text/[0.06] hover:bg-text/[0.1]',
} as const;

const SIZE = {
    sm: 'px-2 text-[12px]',
    md: 'px-3 text-[13px]',
} as const;

export function Button({
    variant = 'ghost',
    size = 'md',
    className = '',
    type = 'button',
    children,
    ...rest
}: {
    variant?: 'ghost' | 'accent';
    size?: 'sm' | 'md';
    children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            type={type}
            className={`h-btn ${SIZE[size]} rounded border ${VARIANT[variant]} transition-colors ${FOCUS_RING} ${className}`}
            {...rest}
        >
            {children}
        </button>
    );
}
