/**
 * Badge — 뜻이 있는 작은 상태 글자(neutral·accent·danger). 사용자가 고른 장식 색은 Pill.
 */
import type { ReactNode } from 'react';

const TONE = {
    soft: { neutral: 'bg-text/[0.06] text-text', accent: 'bg-accent/10 text-accent', danger: 'bg-bad/10 text-bad' },
    outline: { neutral: 'border-line text-muted', accent: 'border-accent/50 text-accent', danger: 'border-bad/50 text-bad' },
} as const;

export function Badge({ tone = 'neutral', variant = 'soft', children, className = '' }: {
    tone?: 'neutral' | 'accent' | 'danger';
    variant?: 'soft' | 'outline';
    children?: ReactNode;
    className?: string;
}) {
    return (
        <span className={`inline-flex items-center px-1.5 h-[1.125rem] rounded-ctl border border-transparent text-small leading-none max-w-full truncate ${TONE[variant][tone]} ${className}`}>
            {children}
        </span>
    );
}
