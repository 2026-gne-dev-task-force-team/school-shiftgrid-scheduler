/**
 * DateField — 눌러서 DatePicker 팝오버를 띄우는 날짜 칸(브라우저 기본 date 입력 대신 쓰는 공용 부품).
 *   값 형식은 DatePicker 그대로: 'YYYY-MM-DD' · time 이면 'YYYY-MM-DDTHH:MM' · 비면 ''.
 *   날짜만이면 하나 고르면 닫히고, time 이면 시각을 고칠 수 있게 열어 둔다(바깥 클릭·Esc 로 닫힘).
 *   🔴 색·치수는 토큰 클래스로만.
 */
import { useState } from 'react';
import { DatePicker } from './DatePicker';
import { Popover } from './Popover';

export function DateField({
    value,
    onChange,
    time = false,
    placeholder = '날짜',
    className = '',
    ariaLabel,
}: {
    value: string;
    onChange: (iso: string) => void;
    time?: boolean;
    placeholder?: string;
    className?: string;
    ariaLabel?: string;
}) {
    const [anchor, setAnchor] = useState<DOMRect | null>(null);
    const label = value ? (time ? value.replace('T', ' ') : value.slice(0, 10)) : '';
    return (
        <>
            <button
                type="button"
                aria-label={ariaLabel}
                aria-haspopup="dialog"
                onClick={(e) => setAnchor(anchor ? null : e.currentTarget.getBoundingClientRect())}
                className={`text-left tabular-nums ${label ? 'text-text' : 'text-muted'} ${className}`}
            >
                {label || placeholder}
            </button>
            {anchor && (
                <Popover anchor={anchor} width={260} onClose={() => setAnchor(null)}>
                    <DatePicker
                        value={value || null}
                        time={time}
                        onChange={(iso) => { onChange(iso); if (!time) setAnchor(null); }}
                    />
                </Popover>
            )}
        </>
    );
}
