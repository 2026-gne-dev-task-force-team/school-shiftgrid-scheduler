/**
 * TextInput — 한 줄 입력칸. size sm = h-btn · md = h-field(단추와 같은 size 면 같은 높이).
 *   input prop 은 그대로 넘긴다(type·value·onChange·placeholder …). 숫자 오른쪽 정렬은 className 으로.
 *   onEnter / onEscape — 확정·취소 키. 🔴 한글 조합 중 Enter 는 onEnter 를 부르지 않는다(isImeEnter).
 *   Field 안에 두면 id·aria·invalid 를 받는다. 🔴 `size` 는 이제 모양(sm|md)이다 — 네이티브 size(글자 수)는 안 받는다.
 */
import type { InputHTMLAttributes, KeyboardEvent } from 'react';
import { FOCUS_FIELD, INVALID } from './focus';
import { useFieldCtx } from './Field';
import { isImeEnter } from './ime';

/** 입력류 공통 disabled — 흐리게 · 금지 커서 · hover 테두리 변화 없음 */
export const INPUT_DISABLED = 'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-line';

/** 입력류 공통 몸 — 크기 표(완성 문자열) */
export const FIELD_SIZE = { sm: 'h-btn px-2 text-small', md: 'h-field px-2.5 text-body' } as const;
export const FIELD_BASE = 'rounded-ctl border border-line bg-bg text-text transition-colors duration-fast hover:border-muted';

export function TextInput({ className = '', size = 'md', invalid, label, onEnter, onEscape, onKeyDown, id, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
    size?: 'sm' | 'md';
    invalid?: boolean;
    /** Field 밖일 때 읽어 주는 이름 */
    label?: string;
    /** Enter 확정(조합 중 Enter 는 무시) — 지금 입력칸 값을 넘긴다 */
    onEnter?: (value: string, e: KeyboardEvent<HTMLInputElement>) => void;
    /** Esc 취소 */
    onEscape?: (e: KeyboardEvent<HTMLInputElement>) => void;
}) {
    const f = useFieldCtx();
    const bad = invalid ?? f?.invalid ?? false;
    return (
        <input
            id={id ?? f?.id}
            aria-label={label}
            aria-invalid={bad || undefined}
            aria-describedby={f?.describedBy}
            className={`${FIELD_SIZE[size]} ${FIELD_BASE} ${INPUT_DISABLED} ${FOCUS_FIELD} ${bad ? INVALID : ''} ${className}`}
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
