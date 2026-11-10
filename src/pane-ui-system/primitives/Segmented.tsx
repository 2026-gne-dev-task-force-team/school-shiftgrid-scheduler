/**
 * Segmented — 붙어 있는 짧은 선택 단추 2~5개. 값 부품: `value` + `onChange(v)`.
 *   role=radiogroup · ←→ 로 옮긴다. label 은 그룹을 읽어 주는 이름.
 */
import type { KeyboardEvent } from 'react';
import { Button } from './Button';
import type { IconName } from './Icon';

export function Segmented<T extends string>({ options, value, onChange, size = 'sm', label, className = '' }: {
    options: { value: T; label: string; icon?: IconName }[];
    value: T;
    onChange: (v: T) => void;
    size?: 'sm' | 'md';
    label: string;
    className?: string;
}) {
    const move = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
        const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        const next = options[(i + d + options.length) % options.length];
        onChange(next.value);
        const sib = e.currentTarget.parentElement?.children[(i + d + options.length) % options.length] as HTMLElement | undefined;
        sib?.focus();
    };
    return (
        <div role="radiogroup" aria-label={label} className={`inline-flex rounded-ctl border border-line p-0.5 gap-0.5 ${className}`}>
            {options.map((o, i) => {
                const on = o.value === value;
                return (
                    <Button
                        key={o.value}
                        role="radio"
                        aria-checked={on}
                        tabIndex={on ? 0 : -1}
                        size={size}
                        variant={on ? 'solid' : 'ghost'}
                        icon={o.icon}
                        onClick={() => onChange(o.value)}
                        onKeyDown={(e) => move(e, i)}
                    >
                        {o.label}
                    </Button>
                );
            })}
        </div>
    );
}
