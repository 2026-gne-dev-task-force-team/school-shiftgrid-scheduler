/**
 * Select — 고르기 상자(브라우저 기본 select 를 토큰 꼴로). options 로 받는다.
 */
import type { SelectHTMLAttributes } from 'react';
import { FOCUS_RING } from './focus';
import { INPUT_DISABLED } from './TextInput';

export function Select({ options, className = '', ...rest }: {
    options: { value: string; label: string }[];
} & SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select className={`h-btn px-1.5 rounded border border-line bg-bg text-text text-body transition-colors duration-fast hover:border-muted ${INPUT_DISABLED} ${FOCUS_RING} ${className}`} {...rest}>
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
    );
}
