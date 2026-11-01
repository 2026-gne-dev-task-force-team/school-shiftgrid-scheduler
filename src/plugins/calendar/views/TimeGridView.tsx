/**
 * 시간축 뷰 — 구글 캘린더의 주(7)/3일(3)/하루(1) 보기. **열 개수(days)만 다른 한 컴포넌트**.
 *   쥔님 2026-11-01 17:06: *"주간뷰 3일뷰 하루 스케줄 뷰도 필요하네"*.
 *   🔴 ⛔ 일정 데이터·칸 클릭·드래그·저장 없음(쥔님 *"일정 추가 하지마"*) — 눈금(가로 날짜축 + 세로 시간축)만 그린다.
 *   🔴 색은 토큰 클래스로만(구조 검사 ①) · 날짜 산수는 창틀 부품(배럴)과 한 벌.
 *
 *   📌 17:20 쥔님 *"주 3 하루 이거 좌우 스크롤 그것도 해줘"* → 날이 **좌우로 끝없이 이어지는** 스크롤(useDayScroller).
 *      세로는 0~24시 시간축 — 두 축이 한 스크롤러. 열 머리는 위에 sticky · 시간 눈금은 왼쪽에 sticky · 모서리는 둘 다.
 *   📌 17:23 「분기 뷰」(설정 옵션, 기본 꺼짐) — 같은 컴포넌트에 days=14. 쥔님: *"주보다 열의 칸이 좁은거지, 시간도 다 보이고 …
 *      시간의 패턴을 좀더 오밀조밀하게 보기 위함"*. 분기 단위로 자르는 게 아니라 이름만 그렇다.
 *
 *   trailing: 머리줄 오른쪽 끝에 그대로 그린다 — 메인이 전환 단추를 여기 꽂는다.
 */
import { memo, useEffect, useState, type ReactNode } from 'react';
// 🔑 날짜 계산은 창틀 부품(primitives/date-grid)과 한 벌 — 플러그인 안에 사본을 두지 않는다
import { IconButton, isoOf, startOfWeek } from '../../../pane-ui-system';
import { dayColumns, rangeStart, rangeLabel, hourLabel, minutesOfDay } from './time-grid';
import { useDayScroller, dayAt, offsetOf } from './useDayScroller';

const WEEK_START = 0;                 // 주 시작 요일 일요일 고정(월 보기와 같다 — 설정으로 뺄 자리)
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const HOURS = 24;                     // 0시~24시
const HOUR_H = 48;                    // 한 시간 = 48px(상수)
const GUTTER = 56;                    // 왼쪽 시간 눈금 열 폭(px)
const HDR_H = 52;                     // 열 머리 높이(px) — 요일 + 날짜 두 줄
const START_HOUR = 7;                 // 처음 열 때 맨 위에 오는 시각 — 오전 7시
const HOUR_LINES = Array.from({ length: HOURS + 1 }, (_, h) => h);   // 0~24

/** 「이 날이 보이게」 할 때 맨 왼쪽에 둘 날 — 7의 배수(주·분기)면 그 주 일요일, 아니면 그날 */
function alignFor(days: number): (d: Date) => Date {
    return (d) => (days % 7 === 0 ? startOfWeek(d, WEEK_START) : rangeStart(d, days === 3 ? 3 : 1, WEEK_START));
}

/** 열 머리 한 칸 — 요일 + 날짜(오늘은 accent 동그라미) · 1일은 「n월 1일」 */
const DayHeader = memo(function DayHeader({ offset, left, width, todayIso }: { offset: number; left: number; width: number; todayIso: string }) {
    const d = dayAt(offset);
    const iso = isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
    const isToday = iso === todayIso;
    const label = d.getDate() === 1 ? `${d.getMonth() + 1}월 1일` : d.getDate();
    return (
        <div
            className="absolute top-0 flex flex-col items-center justify-center gap-0.5 border-l border-line select-none overflow-hidden"
            style={{ left, width, height: HDR_H }}
        >
            <span className="text-[11px] text-muted">{WEEKDAYS[d.getDay()]}</span>
            {isToday ? (
                <span className="grid place-items-center min-w-6 h-6 px-1 rounded-full bg-accent text-bg text-[13px] font-semibold tabular-nums">{label}</span>
            ) : (
                <span className="leading-6 text-[13px] text-text tabular-nums">{label}</span>
            )}
        </div>
    );
});

/** 날 열 하나 — 시간마다 가로선 · 오늘이면 지금 시각 선 */
const DayColumn = memo(function DayColumn({ offset, left, width, todayIso, nowMin }: {
    offset: number; left: number; width: number; todayIso: string; nowMin: number;
}) {
    const d = dayAt(offset);
    const isToday = isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate()) === todayIso;
    return (
        <div className="absolute top-0 border-l border-line" style={{ left, width, height: HOURS * HOUR_H }}>
            {HOUR_LINES.map((h) => (
                <div key={h} className="absolute left-0 right-0 border-t border-line" style={{ top: h * HOUR_H }} />
            ))}
            {isToday && (
                <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top: nowMin * (HOUR_H / 60) }}>
                    <div className="h-0.5 bg-accent" />
                    <div className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-accent" />
                </div>
            )}
        </div>
    );
});

export function TimeGridView({ days, value, onChange, trailing }: { days: number; value: Date; onChange: (d: Date) => void; trailing?: ReactNode }) {
    const now = new Date();
    const todayIso = isoOf(now.getFullYear(), now.getMonth() + 1, now.getDate());

    const s = useDayScroller({
        days,
        gutter: GUTTER,
        align: alignFor(days),
        value,
        onChange,
        // 처음 열 때 오전 7시가 맨 위 — 선 위에 걸친 「07:00」 글자가 열 머리에 안 깔리게 14px 여유(쥔님 17:27 *"요부분이 좀 어색해"*)
        onInit: (el) => { el.scrollTop = START_HOUR * HOUR_H - 14; },
    });

    // 지금 시각 선 — 1분마다
    const [nowMin, setNowMin] = useState(() => minutesOfDay(new Date()));
    useEffect(() => {
        const id = setInterval(() => setNowMin(minutesOfDay(new Date())), 60_000);
        return () => clearInterval(id);
    }, []);

    // ◀ ▶ 는 days 만큼 · 「오늘」은 오늘이 든 범위로
    const go = (dir: number) => s.scrollToOffset(s.headOff + dir * days);
    const goToday = () => s.scrollToOffset(offsetOf(alignFor(days)(new Date())));

    const cols = dayColumns(dayAt(s.headOff), days, now);

    return (
        <div className="h-full flex flex-col bg-bg select-text">
            {/* 머리줄 — 왼쪽 범위 글자 · 오른쪽 이동(◀ 오늘 ▶) + 전환 단추(trailing) */}
            <header className="flex items-center justify-between px-pad py-2 shrink-0 gap-2">
                <div className="text-base font-semibold text-text truncate">{rangeLabel(cols)}</div>
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

            {/* 두 축 스크롤러 — 가로는 날, 세로는 시간 */}
            <div
                ref={s.scrollerRef}
                onScroll={s.onScroll}
                className="flex-1 min-h-0 overflow-auto overscroll-contain border-t border-line"
            >
                <div className="relative" style={{ width: s.contentW, height: HDR_H + HOURS * HOUR_H }}>
                    {/* 열 머리 줄(sticky top) — 모서리는 sticky left */}
                    <div className="sticky top-0 z-20 bg-bg border-b border-line" style={{ height: HDR_H, width: s.contentW }}>
                        <div className="sticky left-0 z-30 bg-bg" style={{ width: GUTTER, height: HDR_H }} aria-hidden="true" />
                        {s.offsets.map((o) => (
                            <DayHeader key={o} offset={o} left={s.leftOf(o)} width={s.colW} todayIso={todayIso} />
                        ))}
                    </div>
                    {/* 본문 — 시간 눈금(sticky left) + 날 열들 */}
                    <div className="relative" style={{ height: HOURS * HOUR_H, width: s.contentW }}>
                        <div className="sticky left-0 z-10 bg-bg border-r border-line" style={{ width: GUTTER, height: HOURS * HOUR_H }}>
                            {HOUR_LINES.filter((h) => h > 0 && h < 24).map((h) => (
                                <span
                                    key={h}
                                    className="absolute left-1 -translate-y-1/2 text-[11px] text-muted tabular-nums select-none"
                                    style={{ top: h * HOUR_H }}
                                >
                                    {hourLabel(h)}
                                </span>
                            ))}
                        </div>
                        {s.offsets.map((o) => (
                            <DayColumn key={o} offset={o} left={s.leftOf(o)} width={s.colW} todayIso={todayIso} nowMin={nowMin} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
