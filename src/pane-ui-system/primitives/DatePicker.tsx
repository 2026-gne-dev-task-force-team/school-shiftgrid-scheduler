/**
 * DatePicker — 작은 월 그리드 하나로 날짜를 「고르는」 제어 컴포넌트. 인라인이다(팝오버는 쓰는 쪽이 감싼다).
 *
 * 🔴 색·치수는 토큰 클래스로만(bg-accent·text-muted…). 외부 라이브러리 0 — date-grid(순수 Date) 위에 그린다.
 * 🔑 기간 선택(range)·팝오버는 여기 얹는다 — 설계 m3.3(*"왼쪽 위 달력 — 기간을 쭉 끌어 골라 큰 틀을 설정"*).
 *    지금은 하루 고르기까지만. ⛔ 일정 추가·min/max·시간은 안 만든다(쥔님 지시 2026-11-01 *"월그리드만 해"*).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { IconButton } from './IconButton';
import { FOCUS_RING } from './focus';
import { monthGrid, monthLabel, shiftMonth, isoOf, type DayCell } from './date-grid';

/** 'YYYY-MM-DD' → {y,m,d} 또는 못 읽으면 null */
function parseIso(s: string | null | undefined): { y: number; m: number; d: number } | null {
    if (!s) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

// 요일 머리 — 한국어 고정(로케일 선택 안 만든다). 짧은 꼴과 aria 용 긴 꼴.
const WD_SHORT = ['일', '월', '화', '수', '목', '금', '토'];
const WD_LONG = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

export function DatePicker({
    value,
    onChange,
    weekStart = 0,
    className = '',
}: {
    /** 고른 날 'YYYY-MM-DD' (없으면 null) */
    value: string | null;
    onChange: (iso: string) => void;
    /** 0=일요일 시작(기본) · 1=월요일 시작 */
    weekStart?: number;
    className?: string;
}) {
    const today = useMemo(() => new Date(), []);
    const start = useMemo(() => {
        const p = parseIso(value);
        return p ?? { y: today.getFullYear(), m: today.getMonth() + 1, d: today.getDate() };
    }, [value, today]);

    // 보고 있는 달(내부 state) · 포커스된 칸(iso) — 키보드 이동이 여기를 민다
    const [view, setView] = useState<{ y: number; m: number }>({ y: start.y, m: start.m });
    const [focused, setFocused] = useState<string>(isoOf(start.y, start.m, start.d));

    // 🔴 value 가 바뀌면 그 달로 따라간다(쓰는 쪽이 값을 되돌려줄 때 · 바깥에서 날을 바꿀 때)
    useEffect(() => {
        const p = parseIso(value);
        if (p) {
            setView({ y: p.y, m: p.m });
            setFocused(isoOf(p.y, p.m, p.d));
        }
    }, [value]);

    // 키보드로 옮겼을 때만 DOM 포커스를 따라 옮긴다 — 마운트·value 변경엔 포커스를 안 뺏는다
    const gridRef = useRef<HTMLDivElement>(null);
    const moveFocusRef = useRef(false);
    useEffect(() => {
        if (!moveFocusRef.current) return;
        moveFocusRef.current = false;
        const el = gridRef.current?.querySelector<HTMLElement>(`[data-iso="${focused}"]`);
        el?.focus();
    }, [focused]);

    const cells = monthGrid(view.y, view.m, weekStart, today);
    // 요일 머리를 weekStart 만큼 돌린다(월요일 시작이면 월~일)
    const weekdayIdx = Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7);

    // 포커스된 날에서 deltaDays 만큼 옮긴다 — 달 경계를 넘으면 보는 달도 넘어간다
    const moveDays = (deltaDays: number) => {
        const p = parseIso(focused);
        if (!p) return;
        const dt = new Date(p.y, p.m - 1, p.d + deltaDays);
        const ny = dt.getFullYear();
        const nm = dt.getMonth() + 1;
        moveFocusRef.current = true;
        setView({ y: ny, m: nm });
        setFocused(isoOf(ny, nm, dt.getDate()));
    };

    const stepMonth = (delta: number) => {
        const [ny, nm] = shiftMonth(view.y, view.m, delta);
        setView({ y: ny, m: nm });
    };

    const pick = (cell: DayCell) => {
        setView({ y: cell.y, m: cell.m });   // 이웃 달 칸을 누르면 그 달로 넘어간다
        setFocused(cell.iso);
        onChange(cell.iso);
    };

    const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
        switch (e.key) {
            case 'ArrowLeft': e.preventDefault(); moveDays(-1); break;
            case 'ArrowRight': e.preventDefault(); moveDays(1); break;
            case 'ArrowUp': e.preventDefault(); moveDays(-7); break;
            case 'ArrowDown': e.preventDefault(); moveDays(7); break;
            case 'PageUp': e.preventDefault(); stepMonth(-1); break;
            case 'PageDown': e.preventDefault(); stepMonth(1); break;
            case 'Enter':
            case ' ': {
                e.preventDefault();
                const p = parseIso(focused);
                if (p) onChange(focused);
                break;
            }
            default: break;
        }
    };

    return (
        <div className={`select-none text-text ${className}`}>
            {/* 머리줄 — ◀ 2026년 11월 ▶ */}
            <div className="flex items-center justify-between gap-1 px-1 pb-1">
                <IconButton icon="left" label="이전 달" size={15} onClick={() => stepMonth(-1)} />
                <span className="flex-1 text-center text-[13px] font-semibold leading-none">
                    {monthLabel(view.y, view.m)}
                </span>
                <IconButton icon="right" label="다음 달" size={15} onClick={() => stepMonth(1)} />
            </div>

            {/* 요일 머리 */}
            <div className="grid grid-cols-7">
                {weekdayIdx.map((wd) => (
                    <div key={wd} className="grid place-items-center text-[11px] text-muted leading-none py-1">
                        {WD_SHORT[wd]}
                    </div>
                ))}
            </div>

            {/* 날짜 칸 — 7×6. role=grid 로 보조기기가 격자로 읽는다 */}
            <div
                ref={gridRef}
                role="grid"
                aria-label={monthLabel(view.y, view.m)}
                onKeyDown={onKeyDown}
                className="grid grid-cols-7"
            >
                {cells.map((cell) => {
                    const selected = cell.iso === value;
                    const wd = new Date(cell.y, cell.m - 1, cell.d).getDay();
                    // 선택 칸은 accent 바탕 · 오늘은(선택 아닐 때) accent 테두리 · 이웃 달은 흐리게
                    const tone = selected
                        ? 'bg-accent text-bg'
                        : cell.inMonth
                            ? 'text-text hover:bg-text/[0.06]'
                            : 'text-muted hover:bg-text/[0.04]';
                    const todayRing = cell.isToday && !selected ? 'border border-accent' : 'border border-transparent';
                    return (
                        <div
                            key={cell.iso}
                            role="gridcell"
                            aria-selected={selected}
                            aria-label={`${cell.y}년 ${cell.m}월 ${cell.d}일 ${WD_LONG[wd]}`}
                            data-iso={cell.iso}
                            tabIndex={cell.iso === focused ? 0 : -1}
                            onClick={() => pick(cell)}
                            className={`grid place-items-center aspect-square rounded text-[12px] leading-none cursor-pointer
                                transition-colors ${tone} ${todayRing}
                                ${FOCUS_RING}`}
                        >
                            {cell.d}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
