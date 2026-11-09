/**
 * TextInput — 한 줄 입력칸. 설정·플러그인이 손으로 짜던 `h-btn px-2 rounded border …` 꼴 한 벌.
 *   input prop 은 그대로 넘긴다(type·value·onChange·placeholder …). 숫자 오른쪽 정렬은 className 으로.
 *   onEnter / onEscape — 확정·취소 키. 🔴 한글 조합 중 Enter 는 onEnter 를 부르지 않는다(isImeEnter).
 */
import type { InputHTMLAttributes, KeyboardEvent } from 'react';
import { FOCUS_RING } from './focus';
import { isImeEnter } from './ime';

export function TextInput({ className = '', onEnter, onEscape, onKeyDown, ...rest }: InputHTMLAttributes<HTMLInputElement> & {
    /** Enter 확정(조합 중 Enter 는 무시) — 지금 입력칸 값을 넘긴다 */
    onEnter?: (value: string, e: KeyboardEvent<HTMLInputElement>) => void;
    /** Esc 취소 */
    onEscape?: (e: KeyboardEvent<HTMLInputElement>) => void;
}) {
    return (
        <input
            className={`h-btn px-2 rounded border border-line bg-bg text-text text-body ${FOCUS_RING} ${className}`}
            onKeyDown={(e) => {
                onKeyDown?.(e);
                if (e.defaultPrevented) return;
                if (e.key === 'Enter' && onEnter) {
                    if (isImeEnter(e)) return;
                    e.preventDefault();
                    onEnter(e.currentTarget.value, e);
                } else if (e.key === 'Escape' && onEscape) {
                    e.preventDefault();
                    e.stopPropagation();
                    onEscape(e);
                }
            }}
            {...rest}
        />
    );
}
