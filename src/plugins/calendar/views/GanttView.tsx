/**
 * 간트 뷰 — 설정 옵션(기본 꺼짐). 행은 항목, 열은 날(좁게). 쥔님 2026-11-01 17:23:
 *   *"행이 정말 일반적인 간트차트를 위한 뷰이고 … 간트차트 뷰는 일정을 저 오밀조밀하게 보기 위함이고"*
 *   🔴 ⛔ 일정 없음 — 지금은 **빈 행과 날 눈금**뿐이다. 행 이름 칸도 비어 있다(항목이 생기면 거기 들어간다).
 *   날이 좌우로 끝없이 이어진다(useDayScroller · 열 폭 고정 36px) · 열 머리는 두 줄(달 띠 + 날짜) · 토·일 열은 한 단 어둡게 · 오늘 열은 accent 띠.
 *   🔴 색은 토큰 클래스로만(구조 검사 ①).
 *
 *   trailing: 머리줄 오른쪽 끝 — 메인이 전환 단추를 꽂는다.
 */
import { memo, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { IconButton, isoOf, monthLabel } from '../../../pane-ui-system';
import { useDayScroller, dayAt, offsetOf } from './useDayScroller';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const LABEL_W = 160;     // 왼쪽 행 이름 칸 폭(px)
const COL_W = 36;        // 날 열 폭(px) — 좁게, 고정
const MONTH_H = 20;      // 열 머리 윗줄 — 달 띠
const DAY_H = 28;        // 열 머리 아랫줄 — 날짜
const HDR_H = MONTH_H + DAY_H;
const ROW_H = 28;        // 행 높이(px)
const MIN_ROWS = 24;     // 최소 행 수 — 화면이 더 높으면 채울 만큼 늘린다

/** 날 열 머리 — 달 띠(1일 또는 보이는 첫 열에 달 이름) + 날짜·요일 */
const DayHeader = memo(function DayHeader({ offset, left, width, todayIso, showMonth }: {
    offset: number; left: number; width: number; todayIso: string; showMonth: boolean;
}) {
    const d = dayAt(offset);
    const isToday = isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate()) === todayIso;
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    return (
        <div className="absolute top-0 select-none" style={{ left, width, height: HDR_H }}>
            {/* 달 띠 — 글자는 칸을 넘어 오른쪽으로 흐른다(좁은 칸이라) */}
            <div className="relative border-l border-line" style={{ height: MONTH_H }}>
                {showMonth && (
                    <span className="absolute left-1 top-0 whitespace-nowrap text-[11px] font-medium text-text leading-5">
                        {monthLabel(d.getFullYear(), d.getMonth() + 1)}
                    </span>
                )}
            </div>
            <div
                className={`flex flex-col items-center justify-center border-l border-t border-line ${weekend ? 'bg-panel2' : ''}`}
                style={{ height: DAY_H }}
            >
                {isToday ? (
                    <span className="grid place-items-center w-5 h-5 rounded-full bg-accent text-bg text-[11px] font-semibold tabular-nums">{d.getDate()}</span>
                ) : (
                    <span className="text-[11px] leading-none text-text tabular-nums">{d.getDate()}</span>
                )}
                <span className="text-[9px] leading-none text-muted mt-0.5">{WEEKDAYS[d.getDay()]}</span>
            </div>
        </div>
    );
});

/** 날 열 본문 — 세로선 하나 · 토·일은 바탕 · 오늘은 accent 띠 */
const DayColumn = memo(function DayColumn({ offset, left, width, height, todayIso }: {
    offset: number; left: number; width: number; height: number; todayIso: string;
}) {
    const d = dayAt(offset);
    const isToday = isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate()) === todayIso;
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    return (
        <div
            className={`absolute top-0 border-l border-line ${isToday ? 'bg-accent/[0.08]' : weekend ? 'bg-panel2' : ''}`}
            style={{ left, width, height }}
        />
    );
});

export function GanttView({ value, onChange, trailing }: { value: Date; onChange: (d: Date) => void; trailing?: ReactNode }) {
    const now = new Date();
    const todayIso = isoOf(now.getFullYear(), now.getMonth() + 1, now.getDate());

    const s = useDayScroller({
        days: 1,                 // fixedColW 가 있어 무시된다
        gutter: LABEL_W,
        align: (d) => d,         // value 날이 맨 왼쪽
        value,
        onChange,
        fixedColW: COL_W,
    });

    // 행 수 — 화면 높이를 채울 만큼(최소 MIN_ROWS). 일정이 없으니 전부 빈 행이다
    const [rows, setRows] = useState(MIN_ROWS);
    const bodyRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const el = s.scrollerRef.current;
        if (!el) return;
        const measure = () => setRows(Math.max(MIN_ROWS, Math.ceil((el.clientHeight - HDR_H) / ROW_H)));
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, [s.scrollerRef]);

    const bodyH = rows * ROW_H;
    const visibleCols = () => Math.max(1, Math.floor(((s.scrollerRef.current?.clientWidth ?? 0) - LABEL_W) / COL_W));
    const go = (dir: number) => s.scrollToOffset(s.headOff + dir * visibleCols());
    const goToday = () => s.scrollToOffset(offsetOf(new Date()));

    // 머리줄 글자 — 보이는 첫 날의 달 (끝 날이 다른 달이면 「– 12월」)
    const first = dayAt(s.headOff);
    const last = dayAt(s.headOff + visibleCols() - 1);
    const label = first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()
        ? monthLabel(first.getFullYear(), first.getMonth() + 1)
        : `${monthLabel(first.getFullYear(), first.getMonth() + 1)} – ${last.getFullYear() !== first.getFullYear() ? `${last.getFullYear()}년 ` : ''}${last.getMonth() + 1}월`;

    const rowLines = Array.from({ length: rows + 1 }, (_, i) => i);

    // 전역 선택 차단(구조 검사 ⑬)을 안 뚫는다 — 간트엔 고를 글자가 없어 선택 허용 클래스를 안 단다
    return (
        <div className="h-full flex flex-col bg-bg">
            <header className="flex items-center justify-between px-pad py-2 shrink-0 gap-2">
                <div className="text-base font-semibold text-text truncate">{label}</div>
                <div className="flex items-center gap-1 shrink-0">
                    <IconButton icon="left" label="이전" onClick={() => go(-1)} />
                    <button
                        type="button"
                        onClick={goToday}
                        className="px-2 h-btn rounded text-[12px] text-muted hover:text-text hover:bg-text/[0.06] transition-colors"
                    >
                        오늘
                    </button>
                    <IconButton icon="right" label="다음" onClick={() => go(1)} />
                    {trailing}
                </div>
            </header>

            {/* 두 축 스크롤러 — 가로는 날, 세로는 행. 열 머리 sticky top · 행 이름 칸 sticky left */}
            <div
                ref={s.scrollerRef}
                onScroll={s.onScroll}
                className="flex-1 min-h-0 overflow-auto overscroll-contain border-t border-line"
            >
                <div className="relative" style={{ width: s.contentW, height: HDR_H + bodyH }}>
                    <div className="sticky top-0 z-20 bg-bg border-b border-line" style={{ height: HDR_H, width: s.contentW }}>
                        <div className="sticky left-0 z-30 bg-bg border-r border-line" style={{ width: LABEL_W, height: HDR_H }} aria-hidden="true" />
                        {s.offsets.map((o, i) => (
                            <DayHeader
                                key={o} offset={o} left={s.leftOf(o)} width={s.colW} todayIso={todayIso}
                                showMonth={dayAt(o).getDate() === 1 || i === 0}
                            />
                        ))}
                    </div>
                    <div ref={bodyRef} className="relative" style={{ height: bodyH, width: s.contentW }}>
                        {/* 행 이름 칸 — 비어 있다(항목이 생기면 여기) */}
                        <div className="sticky left-0 z-10 bg-bg border-r border-line" style={{ width: LABEL_W, height: bodyH }}>
                            {rowLines.map((i) => (
                                <div key={i} className="absolute left-0 right-0 border-t border-line" style={{ top: i * ROW_H }} />
                            ))}
                        </div>
                        {s.offsets.map((o) => (
                            <DayColumn key={o} offset={o} left={s.leftOf(o)} width={s.colW} height={bodyH} todayIso={todayIso} />
                        ))}
                        {/* 행 가로선 — 열 위로 전체 폭 */}
                        {rowLines.map((i) => (
                            <div key={i} className="absolute left-0 right-0 border-t border-line pointer-events-none" style={{ top: i * ROW_H }} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
