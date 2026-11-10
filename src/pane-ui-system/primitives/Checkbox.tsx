/**
 * Checkbox — 네모 칸. 값 부품: `checked` + `onChange(b)`. label 은 옆 글자(눌러도 같이 토글).
 *   indeterminate 는 「일부만 선택」 모양. Field 안에서는 Field 의 이름표를 쓰므로 label 을 생략해도 된다.
 */
import { useEffect, useRef } from 'react';
import { FOCUS_RING } from './focus';
import { useFieldCtx } from './Field';

export function Checkbox({ checked, onChange, label, 'aria-label': ariaLabel, indeterminate = false, size = 'md', disabled = false, id, className = '' }: {
    checked: boolean;
    onChange: (v: boolean) => void;
    label?: string;
    /** 이름표를 안 보일 때(표 칸 등) 읽어 주는 이름 */
    'aria-label'?: string;
    indeterminate?: boolean;
    size?: 'sm' | 'md';
    disabled?: boolean;
    id?: string;
    className?: string;
}) {
    const f = useFieldCtx();
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
    const box = (
        <input
            ref={ref}
            id={id ?? f?.id}
            type="checkbox"
            checked={checked}
            disabled={disabled}
            aria-label={label ? undefined : ariaLabel}
            aria-describedby={f?.describedBy}
            onChange={(e) => onChange(e.target.checked)}
            className={`shrink-0 accent-accent ${size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${FOCUS_RING}`}
        />
    );
    if (!label) return box;
    return (
        <label className={`inline-flex items-center gap-2 ${size === 'sm' ? 'text-small' : 'text-body'} text-text ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${className}`}>
            {box}{label}
        </label>
    );
}
