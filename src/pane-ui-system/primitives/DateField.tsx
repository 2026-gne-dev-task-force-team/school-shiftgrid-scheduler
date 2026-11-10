/**
 * DateField — 눌러서 DatePicker 팝오버를 띄우는 날짜 칸(브라우저 기본 date 입력 대신 쓰는 공용 부품).
 *   값 형식은 DatePicker 그대로: 'YYYY-MM-DD' · time 이면 'YYYY-MM-DDTHH:MM' · 비면 ''.
 *   날짜만이면 하나 고르면 닫히고, time 이면 시각을 고칠 수 있게 열어 둔다(바깥 클릭·Esc 로 닫힘).
 *   🔴 색·치수는 토큰 클래스로만.
 */
import { useState } from 'react';
import { DatePicker } from './DatePicker';
import { Popover } from './Popover';
import { FOCUS_RING, PRESS_STATE } from './focus';

export function DateField({
    value,
    onChange,
    time = false,
    placeholder = '날짜',
    className = '',
    label: labelProp,
    ariaLabel,
    disabled = false,
    openAt,
}: {
    /** 값이 비어 있을 때 달력이 먼저 보여 줄 달의 날(예: 끝 날짜 칸에 시작일) — 안 주면 오늘 */
    openAt?: string | null;
    value: string;
    onChange: (iso: string) => void;
    time?: boolean;
    placeholder?: string;
    className?: string;
    /** 스크린리더용 이름 */
    label?: string;
    /** @deprecated label */
    ariaLabel?: string;
    disabled?: boolean;
}) {
    const [anchor, setAnchor] = useState<DOMRect | null>(null);
    const shown = value ? (time ? value.replace('T', ' ') : value.slice(0, 10)) : '';
    return (
        <>
            <button
                type="button"
                aria-label={labelProp ?? ariaLabel}
                aria-haspopup="dialog"
                disabled={disabled}
                onClick={(e) => setAnchor(anchor ? null : e.currentTarget.getBoundingClientRect())}
                className={`text-left tabular-nums rounded-ctl ${PRESS_STATE} ${FOCUS_RING} ${shown ? 'text-text' : 'text-muted'} ${className}`}
            >
                {shown || placeholder}
            </button>
            {anchor && (
                <Popover anchor={anchor} width={260} onClose={() => setAnchor(null)}>
                    <DatePicker
                        value={value || null}
                        openAt={openAt}
                        time={time}
                        onChange={(iso) => { onChange(iso); if (!time) setAnchor(null); }}
                    />
                </Popover>
            )}
        </>
    );
}
