/**
 * Select — 고르기 상자(브라우저 기본 select 를 토큰 꼴로). options 로 받는다. 글자 부품이라 onChange(e) 는 네이티브 그대로.
 *   placeholder 가 있으면 맨 앞에 빈 값 option. Field 안에 두면 id·aria·invalid 를 받는다.
 */
import type { SelectHTMLAttributes } from 'react';
import { FOCUS_FIELD, INVALID } from './focus';
import { useFieldCtx } from './Field';
import { FIELD_BASE, FIELD_SIZE, INPUT_DISABLED } from './TextInput';

export function Select({ options, size = 'md', invalid, placeholder, label, className = '', id, ...rest }: {
    options: { value: string; label: string; disabled?: boolean }[];
    size?: 'sm' | 'md';
    invalid?: boolean;
    placeholder?: string;
    label?: string;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'>) {
    const f = useFieldCtx();
    const bad = invalid ?? f?.invalid ?? false;
    return (
        <select
            id={id ?? f?.id}
            aria-label={label}
            aria-invalid={bad || undefined}
            aria-describedby={f?.describedBy}
            className={`${FIELD_SIZE[size]} ${FIELD_BASE} ${INPUT_DISABLED} ${FOCUS_FIELD} ${bad ? INVALID : ''} ${className}`}
            {...rest}
        >
            {placeholder !== undefined && <option value="">{placeholder}</option>}
            {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
        </select>
    );
}
