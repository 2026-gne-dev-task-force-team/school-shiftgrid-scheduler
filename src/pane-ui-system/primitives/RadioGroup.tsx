/**
 * RadioGroup — 이름표가 긴 하나 고르기(풀이 hint 한 줄 가능). 값 부품: `value` + `onChange(v)`.
 *   짧은 2~5개면 Segmented. label 은 그룹을 읽어 주는 이름.
 */
import { useId } from 'react';
import { FOCUS_RING } from './focus';

export function RadioGroup<T extends string>({ options, value, onChange, label, direction = 'col', className = '' }: {
    options: { value: T; label: string; hint?: string }[];
    value: T;
    onChange: (v: T) => void;
    label: string;
    direction?: 'col' | 'row';
    className?: string;
}) {
    const name = useId();
    return (
        <div role="radiogroup" aria-label={label} className={`flex ${direction === 'row' ? 'flex-row flex-wrap gap-x-4 gap-y-1' : 'flex-col gap-1.5'} ${className}`}>
            {options.map((o) => (
                <label key={o.value} className="inline-flex items-start gap-2 cursor-pointer text-body text-text">
                    <input
                        type="radio" name={name} value={o.value}
                        checked={o.value === value}
                        onChange={() => onChange(o.value)}
                        className={`mt-1 shrink-0 accent-accent cursor-pointer ${FOCUS_RING}`}
                    />
                    <span className="flex flex-col">
                        {o.label}
                        {o.hint && <span className="text-note text-muted">{o.hint}</span>}
                    </span>
                </label>
            ))}
        </div>
    );
}
