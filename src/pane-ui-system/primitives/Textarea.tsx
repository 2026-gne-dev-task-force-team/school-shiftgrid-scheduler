/**
 * Textarea — 여러 줄 입력칸. autoGrow 면 글에 맞춰 늘어난다. onEnter = ⌘/Ctrl+Enter 확정(한글 조합 중 제외).
 *   Field 안에 두면 id·aria·invalid 를 받는다. `size` 는 모양(sm|md).
 */
import { useLayoutEffect, useRef, type KeyboardEvent, type TextareaHTMLAttributes } from 'react';
import { isMod } from '../platform-keys';
import { FOCUS_FIELD, INVALID } from './focus';
import { useFieldCtx } from './Field';
import { FIELD_BASE, INPUT_DISABLED } from './TextInput';

const PAD = { sm: 'px-2 py-1 text-small', md: 'px-2.5 py-1.5 text-body' } as const;

export function Textarea({ size = 'md', rows = 3, autoGrow = false, invalid, label, onEnter, onKeyDown, className = '', id, value, ...rest }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'> & {
    size?: 'sm' | 'md';
    autoGrow?: boolean;
    invalid?: boolean;
    label?: string;
    /** ⌘/Ctrl+Enter 확정 — 조합 중 Enter 는 무시 */
    onEnter?: (value: string, e: KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
    const f = useFieldCtx();
    const bad = invalid ?? f?.invalid ?? false;
    const ref = useRef<HTMLTextAreaElement>(null);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!autoGrow || !el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    }, [autoGrow, value]);
    return (
        <textarea
            ref={ref}
            id={id ?? f?.id}
            rows={rows}
            value={value}
            aria-label={label}
            aria-invalid={bad || undefined}
            aria-describedby={f?.describedBy}
            className={`${PAD[size]} ${FIELD_BASE} ${INPUT_DISABLED} ${FOCUS_FIELD} ${bad ? INVALID : ''} ${autoGrow ? 'resize-none overflow-hidden' : 'resize-y'} ${className}`}
            onKeyDown={(e) => {
                onKeyDown?.(e);
                if (e.defaultPrevented) return;
                if (e.key === 'Enter' && isMod(e) && onEnter && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    onEnter(e.currentTarget.value, e);
                }
            }}
            {...rest}
        />
    );
}
