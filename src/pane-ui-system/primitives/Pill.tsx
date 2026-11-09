/**
 * Pill — 색 알약(고르기 옵션·상태 표시). 색 이름 → 틴트 배경 + 진한 글자(pill-colors). 크기는 글자 단계 토큰.
 */
import type { ReactNode } from 'react';
import { pillStyle } from './pill-colors';

export function Pill({ color, children, className = '' }: { color?: string; children?: ReactNode; className?: string }) {
    return (
        <span
            className={`inline-flex items-center px-1.5 h-[18px] rounded-[3px] text-small leading-none max-w-full truncate ${className}`}
            style={pillStyle(color)}
        >
            {children}
        </span>
    );
}
