/**
 * NumberInput — 숫자 입력칸. 값 부품이라 onChange(n | null) — 빈칸 = null. 오른쪽 정렬. suffix 는 단위 글자.
 *   글을 치는 동안은 칸 속 글자를 그대로 두고(예: 「1.」), 숫자로 읽히는 값만 위로 올린다.
 */
import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { FOCUS_FIELD, INVALID } from './focus';
import { useFieldCtx } from './Field';
import { FIELD_BASE, FIELD_SIZE, INPUT_DISABLED } from './TextInput';

const toText = (v: number | null) => (v === null || Number.isNaN(v) ? '' : String(v));

export function NumberInput({ value, onChange, min, max, step = 1, size = 'md', invalid, label, suffix, className = '', id, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'value' | 'onChange' | 'type' | 'min' | 'max' | 'step'> & {
    value: number | null;
    onChange: (n: number | null) => void;
    min?: number;
    max?: number;
    step?: number;
    size?: 'sm' | 'md';
    invalid?: boolean;
    label?: string;
    /** 단위 글자(칸 오른쪽) */
    suffix?: string;
}) {
    const f = useFieldCtx();
    const bad = invalid ?? f?.invalid ?? false;
    const [text, setText] = useState(toText(value));
    const last = useRef(value);
    useEffect(() => {
        if (value !== last.current) { last.current = value; setText(toText(value)); }
    }, [value]);
    const input = (
        <input
            {...rest}
            id={id ?? f?.id}
            type="number"
            inputMode="decimal"
            min={min} max={max} step={step}
            value={text}
            aria-label={label}
            aria-invalid={bad || undefined}
            aria-describedby={f?.describedBy}
            onChange={(e) => {
                const t = e.target.value;
                setText(t);
                const n = t === '' ? null : Number(t);
                if (n !== null && Number.isNaN(n)) return;
                last.current = n;
                onChange(n);
            }}
            className={`${FIELD_SIZE[size]} ${FIELD_BASE} ${INPUT_DISABLED} ${FOCUS_FIELD} ${bad ? INVALID : ''} text-right ${suffix ? 'w-20' : 'w-24'} ${className}`}
        />
    );
    if (!suffix) return input;
    return <span className="inline-flex items-center gap-1.5">{input}<span className="text-small text-muted">{suffix}</span></span>;
}
