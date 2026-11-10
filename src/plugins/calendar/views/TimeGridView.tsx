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
import { CalBar } from './CalBar';
import { DayLabel } from './DayLabel';
import { memo, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
// 🔑 날짜 계산은 창틀 부품(primitives/date-grid)과 한 벌 — 플러그인 안에 사본을 두지 않는다
import { Button, ContextMenu, Icon, IconButton, useContextTrigger, isoOf, startOfWeek, monthLabel, type MenuEntry, type PeekHandle } from '../../../pane-ui-system';
import { dayColumns, rangeStart, rangeLabel, hourLabel, minutesOfDay, quarterLabel, columnBoundary, shouldShowMonth, type ColBoundary } from './time-grid';
import { useDayScroller, dayAt, offsetOf } from './useDayScroller';
import { useCalendarData } from '../useEvents';
import { createEvent, removeEvent } from '../nodes';
import { buildDayIndex, hhmm, isoMinuteOf, type CalEvent } from '../events';
import { paletteAt } from '../palette';
import { useCardPeek } from './useCardPeek';
import { focusPeekTitle } from './focus-title';
import { mergeBind } from './ctx-bind';
import { useRangeSelect, type RangeHit } from './useRangeSelect';
import { timeSelection, timeSliceForDay, floorToSnap, eventFromSelection, type CalSelection } from '../selection';

const SNAP_MIN = 30;   // 시간 칸 스냅 — 더블클릭 생성(onGridDouble)과 같은 30분 단위

const WEEK_START = 0;                 // 주 시작 요일 일요일 고정(월 보기와 같다 — 설정으로 뺄 자리)
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const HOURS = 24;                     // 0시~24시
const HOUR_H = 48;                    // 한 시간 = 48px(상수)
const GUTTER = 56;                    // 왼쪽 시간 눈금 열 폭(px)
const ALLDAY_BAND = 22;               // 종일 일정 띠 — 열 머리 아래 고정(세로로 스크롤해도 안 가려진다 · R6-8)
const HDR_H = 52 + ALLDAY_BAND;       // 열 머리 높이(px) — 요일 + 날짜 두 줄 + 종일 띠
const MONTH_BAND = 18;                // 「분기 뷰」 전용 — 열 머리 위에 얹는 달 띠(간트와 같은 꼴, 쥔님 2026-11-01 22:51)
const START_HOUR = 7;                 // 처음 열 때 맨 위에 오는 시각 — 오전 7시
const DENSE_DAYS = 14;                // 「분기 뷰」 폭(2주). 이 폭일 때만 머리줄에 분기 표시 한 줄(쥔님 2026-11-01 22:17)
const HOUR_LINES = Array.from({ length: HOURS + 1 }, (_, h) => h);   // 0~24

/** 열 왼쪽 경계선 클래스 — 분기 뷰에서 달·분기 경계를 굵고 진하게(토큰만, ⛔ 임의 hex). 보통은 가는 line. */
function boundaryBorderClass(b: ColBoundary): string {
    if (b === 'quarter') return 'border-l-2 border-text';   // 분기 경계(1·4·7·10월 1일) — 가장 진하게
    if (b === 'month') return 'border-l-2 border-edge';      // 달 경계 — line 보다 한 단 진하고 굵게
    return 'border-l border-line';                           // 보통 열
}

/** 「이 날이 보이게」 할 때 맨 왼쪽에 둘 날 — 7의 배수(주·분기)면 그 주 일요일, 아니면 그날 */
function alignFor(days: number): (d: Date) => Date {
    return (d) => (days % 7 === 0 ? startOfWeek(d, WEEK_START) : rangeStart(d, days === 3 ? 3 : 1, WEEK_START));
}

/** 열 머리 한 칸 — 요일 + 날짜(오늘은 accent 동그라미) · 1일은 「n월 1일」.
 *   분기 뷰(dense)면 위에 달 띠 한 줄을 더 얹고(showMonth 열에만 달 이름), 달·분기 경계 열은 왼쪽 선을 굵게/진하게. */
const DayHeader = memo(function DayHeader(
    { offset, left, width, todayIso, dense, showMonth, boundary, height, allDay }:
    { offset: number; left: number; width: number; todayIso: string; dense: boolean; showMonth: boolean; boundary: ColBoundary; height: number; allDay: CalEvent[] },
) {
    const d = dayAt(offset);
    const iso = isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
    const isToday = iso === todayIso;
    const label = <DayLabel month={d.getMonth() + 1} day={d.getDate()} />;
    return (
        <div
            className={`absolute top-0 flex flex-col select-none overflow-hidden ${boundaryBorderClass(boundary)}`}
            style={{ left, width, height }}
        >
            {/* 달 띠(분기 뷰만) — 글자는 좁은 칸을 넘어 오른쪽으로 흐른다(간트와 같은 꼴) */}
            {dense && (
                <div className="relative shrink-0 border-b border-line" style={{ height: MONTH_BAND }}>
                    {showMonth && (
                        <span className="absolute left-1 top-0 whitespace-nowrap text-note font-medium text-text leading-[18px]">
                            {monthLabel(d.getFullYear(), d.getMonth() + 1)}
                        </span>
                    )}
                </div>
            )}
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-0.5">
                <span className="text-note text-muted">{WEEKDAYS[d.getDay()]}</span>
                {isToday ? (
                    <span className="grid place-items-center min-w-6 h-6 px-1 rounded-full bg-accent text-bg text-body font-semibold tabular-nums whitespace-nowrap">{label}</span>
                ) : (
                    <span className="leading-6 text-body text-text tabular-nums">{label}</span>
                )}
            </div>
            {/* 종일 띠 — 첫 일정 하나 + 나머지는 「+n」(클릭하면 그 일정 카드는 data-event-id 위임) */}
            <div className="shrink-0 px-0.5 flex items-center gap-0.5" style={{ height: ALLDAY_BAND }}>
                {allDay.slice(0, 1).map((e) => (
                    <div key={e.id} data-event-id={e.id} className={`min-w-0 flex-1 truncate rounded px-1 text-micro leading-4 cursor-pointer ${paletteAt(e.colorIdx).bar}`}>
                        {e.name || <span className="opacity-60">제목 없음</span>}
                    </div>
                ))}
                {allDay.length > 1 && <span className="shrink-0 text-micro text-muted tabular-nums">+{allDay.length - 1}</span>}
            </div>
        </div>
    );
});

/** 시간 일정 카드 하나 — 그 날 안에서 시작~끝 분으로 자리를 잡는다(겹침 1/n 은 1차 없음 — 그냥 겹친다). */
function TimedCard({ e, dayStartMs }: { e: CalEvent; dayStartMs: number }) {
    const pal = paletteAt(e.colorIdx);
    const startMin = Math.max(0, (e.startMs - dayStartMs) / 60_000);
    const endMin = Math.min(24 * 60, (e.endMs - dayStartMs) / 60_000);
    const top = startMin * (HOUR_H / 60);
    const height = Math.max(14, (endMin - startMin) * (HOUR_H / 60));
    return (
        <div
            data-event-id={e.id}
            className={`absolute left-0.5 right-0.5 z-20 overflow-hidden rounded border-l-2 px-1 cursor-pointer ${pal.soft} ${pal.border}`}
            style={{ top, height }}
        >
            <div className="truncate text-micro leading-4 text-text">{e.name || <span className="opacity-60">제목 없음</span>}</div>
            <div className="truncate text-micro leading-3 text-muted tabular-nums">{hhmm(e.startMs)}</div>
        </div>
    );
}

/** 날 열 하나 — 시간마다 가로선 · 오늘이면 지금 시각 선 · 달·분기 경계 열 왼쪽 선 굵게 · 종일 바(맨 위) + 시간 카드 */
const DayColumn = memo(function DayColumn({ offset, left, width, todayIso, nowMin, boundary, dayIndex, selection }: {
    offset: number; left: number; width: number; todayIso: string; nowMin: number; boundary: ColBoundary; dayIndex: Map<string, CalEvent[]>; selection: CalSelection;
}) {
    const d = dayAt(offset);
    const iso = isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
    const isToday = iso === todayIso;
    const dayStartMs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dayEvents = dayIndex.get(iso) ?? [];
    const timed = dayEvents.filter((e) => !e.allDay);
    // 고른 범위를 이 열에 자른 구간 — 알약 카드 아래 z(맨 앞 자식이라 뒤 형제들이 위에 그려진다) · 포인터 안 먹음
    const slice = timeSliceForDay(selection, dayStartMs, iso);
    return (
        <div data-day-offset={offset} className={`absolute top-0 ${boundaryBorderClass(boundary)}`} style={{ left, width, height: HOURS * HOUR_H }}>
            {slice && (
                <div
                    className="absolute left-0 right-0 pointer-events-none bg-accent/[0.14] ring-1 ring-inset ring-accent"
                    style={{ top: ((slice.startMs - dayStartMs) / 60_000) * (HOUR_H / 60), height: ((slice.endMs - slice.startMs) / 60_000) * (HOUR_H / 60) }}
                />
            )}
            {HOUR_LINES.map((h) => (
                <div key={h} className="absolute left-0 right-0 border-t border-line" style={{ top: h * HOUR_H }} />
            ))}
            {timed.map((e) => <TimedCard key={e.id} e={e} dayStartMs={dayStartMs} />)}
            {isToday && (
                <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top: nowMin * (HOUR_H / 60) }}>
                    <div className="h-0.5 bg-accent" />
                    <div className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-accent" />
                </div>
            )}
        </div>
    );
});

export function TimeGridView({ days, value, onChange, trailing, peek, selection, onSelect }: { days: number; value: Date; onChange: (d: Date) => void; trailing?: ReactNode; peek: PeekHandle; selection: CalSelection; onSelect: (s: CalSelection) => void }) {
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

    // 🔴 분기 뷰(14일)만 — 열 머리 위에 달 띠 한 줄(hdrH 가 그만큼 커진다) · 달·분기 경계 열 세로선 굵게
    const dense = days === DENSE_DAYS;
    const hdrH = dense ? HDR_H + MONTH_BAND : HDR_H;
    const allDayOf = (o: number): CalEvent[] => {
        const d = dayAt(o);
        return (dayIndex.get(isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate())) ?? []).filter((e) => e.allDay);
    };

    // 일정 — 열마다 카드로 그리고(dayIndex), 시간 칸 더블클릭 → 1시간 생성, 카드 클릭 → 미리보기 편집.
    const { events } = useCalendarData();
    const dayIndex = useMemo(() => buildDayIndex(events), [events]);
    // 🔴 일정 카드는 창틀의 미리보기(peek)에 띄운다 — 뷰 안 고정 패널이 아니다(EventCardPeek 가 담는다).
    const card = useCardPeek(peek);

    const onGridClick = (e: ReactMouseEvent) => {
        const id = (e.target as HTMLElement).closest('[data-event-id]')?.getAttribute('data-event-id');
        if (id) card.open(id);
    };
    const onGridDouble = (e: ReactMouseEvent) => newAt(e.target as HTMLElement, e.clientY);
    // R6 우클릭: 일정 → 열기·휴지통 · 시간 칸 → 새 일정(그 시각부터 1시간)
    const [ctx, setCtx] = useState<{ x: number; y: number; items: MenuEntry[] } | null>(null);
    const ctxTrigger = useContextTrigger((x, y, ev) => {
        const t = ev.target as HTMLElement;
        const evId = t.closest('[data-event-id]')?.getAttribute('data-event-id');
        if (evId) setCtx({ x, y, items: [{ label: '열기', icon: 'right', onClick: () => card.open(evId) }, { sep: true }, { label: '휴지통으로', icon: 'trash', danger: true, onClick: () => removeEvent(evId) }] });
        else if (t.closest('[data-day-offset]')) setCtx({ x, y, items: [{ label: '새 일정', icon: 'plus', onClick: () => newAt(t, y, true) }] });
    });
    function newAt(target: HTMLElement, clientY: number, useSelection = false) {
        const colEl = target.closest('[data-day-offset]') as HTMLElement | null;
        if (!colEl) return;
        const offset = Number(colEl.getAttribute('data-day-offset'));
        const rect = colEl.getBoundingClientRect();
        const raw = Math.floor(((clientY - rect.top) / HOUR_H) * 60);
        const min = Math.max(0, Math.min(23 * 60, Math.round(raw / 30) * 30));   // 30분 눈금 · 끝 1시간 여유
        const base = dayAt(offset);
        if (useSelection) {   // 우클릭 「새 일정」 — 고른 범위 안을 눌렀으면 범위 전체(W7)
            const span = eventFromSelection(selection, isoOf(base.getFullYear(), base.getMonth() + 1, base.getDate()), base.getTime() + min * 60_000);
            if (span) { const sid = createEvent(span, ''); if (sid) { card.open(sid); focusPeekTitle(); } return; }
        }
        const start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), Math.floor(min / 60), min % 60);
        const end = new Date(start.getTime() + 3_600_000);
        const id = createEvent({ start: isoMinuteOf(start), end: isoMinuteOf(end), allDay: false }, '');
        if (id) { card.open(id); focusPeekTitle(); }
    }
    // 툴바 「새 일정」 — 보이는 날 중 오늘(없으면 맨 왼쪽 날)의 종일 일정
    const newToday = () => {
        const col = cols.find((c) => c.isToday) ?? cols[0];
        if (!col) return;
        const st = new Date(col.y, col.m - 1, col.d);
        const id = createEvent({ start: isoMinuteOf(st), end: isoMinuteOf(new Date(col.y, col.m - 1, col.d + 1)), allDay: true }, '');
        if (id) { card.open(id); focusPeekTitle(); }
    };

    // 범위 선택 — 빈 시간 칸을 죽 끌어 [start,end) 를 고른다(일정 생성 아님). anchor 는 슬롯 시작 ms.
    const selAnchor = useRef<number | null>(null);
    const slotMs = (offset: number, slotMin: number) => dayAt(offset).getTime() + slotMin * 60_000;
    const resolveSlot = (x: number, y: number): RangeHit<{ offset: number; slotMin: number }> => {
        const el = document.elementFromPoint(x, y) as HTMLElement | null;
        if (!el) return { value: null, onEvent: false };
        const onEvent = !!el.closest('[data-event-id]');
        const colEl = el.closest('[data-day-offset]') as HTMLElement | null;
        if (!colEl) return { value: null, onEvent };
        const offset = Number(colEl.getAttribute('data-day-offset'));
        const rect = colEl.getBoundingClientRect();
        const rawMin = ((y - rect.top) / HOUR_H) * 60;
        return { value: { offset, slotMin: floorToSnap(rawMin, SNAP_MIN) }, onEvent };
    };
    const range = useRangeSelect<{ offset: number; slotMin: number }>({
        resolve: resolveSlot,
        onSet: (v, shift) => {
            const cur = slotMs(v.offset, v.slotMin);
            if (shift) {
                const a = selAnchor.current ?? (selection?.kind === 'time' ? selection.startMs : cur);
                selAnchor.current = a;
                onSelect(timeSelection(a, cur, SNAP_MIN));
            } else {
                selAnchor.current = cur;
                onSelect(timeSelection(cur, cur, SNAP_MIN));
            }
        },
        onExtend: (v) => {
            const cur = slotMs(v.offset, v.slotMin);
            onSelect(timeSelection(selAnchor.current ?? cur, cur, SNAP_MIN));
        },
    });

    return (
        <div className="relative h-full flex flex-col bg-bg">
            {/* 머리줄 — 왼쪽 범위 글자 · 오른쪽 이동(◀ 오늘 ▶) + 전환 단추(trailing) */}
            <CalBar end={<>
                    <Button size="sm" variant="plain" className="inline-flex items-center gap-1 text-muted" onClick={newToday}>
                        <Icon name="plus" size={13} /> 새 일정
                    </Button>
                    <IconButton icon="left" label="이전" onClick={() => go(-1)} />
                    <button
                        type="button"
                        onClick={goToday}
                        className="px-2 h-btn rounded text-small text-muted hover:text-text hover:bg-text/[0.06] active:bg-text/[0.1] transition-colors"
                    >
                        오늘
                    </button>
                    <IconButton icon="right" label="다음" onClick={() => go(1)} />
                    {trailing}
                </>}>
                <div className="min-w-0">
                    <div className="text-base font-semibold text-text truncate">{rangeLabel(cols)}</div>
                    {/* 「분기 뷰」(days=14)만 — 보고 있는 맨 왼쪽 날 기준 분기 한 줄(명목). 다른 폭엔 안 뜬다. */}
                    {days === DENSE_DAYS && cols.length > 0 && (
                        <div className="text-note text-muted truncate">{quarterLabel(cols[0].y, cols[0].m)}</div>
                    )}
                </div>
            </CalBar>

            {/* 두 축 스크롤러 — 가로는 날, 세로는 시간 */}
            <div
                ref={s.scrollerRef}
                onScroll={s.onScroll}
                className="flex-1 min-h-0 overflow-auto overscroll-contain border-t border-line"
            >
                <div className="relative" style={{ width: s.contentW, height: hdrH + HOURS * HOUR_H }}>
                    {/* 열 머리 줄(sticky top) — 모서리는 sticky left */}
                    <div className="sticky top-0 z-20 bg-bg border-b border-line" style={{ height: hdrH, width: s.contentW }} onClick={onGridClick} {...ctxTrigger}>
                        <div className="sticky left-0 z-30 bg-bg" style={{ width: GUTTER, height: hdrH }} aria-hidden="true" />
                        {s.offsets.map((o, i) => (
                            <DayHeader
                                key={o} offset={o} left={s.leftOf(o)} width={s.colW} todayIso={todayIso}
                                dense={dense} height={hdrH} allDay={allDayOf(o)}
                                showMonth={dense && shouldShowMonth(dayAt(o).getDate(), i)}
                                boundary={dense ? columnBoundary(dayAt(o).getMonth() + 1, dayAt(o).getDate()) : 'none'}
                            />
                        ))}
                    </div>
                    {/* 본문 — 시간 눈금(sticky left) + 날 열들. 시간 칸 더블클릭 → 1시간 일정(data-day-offset 위임) */}
                    <div className="relative" style={{ height: HOURS * HOUR_H, width: s.contentW }} onClick={onGridClick} onDoubleClick={onGridDouble} {...mergeBind(range.bind, ctxTrigger)}>
                        <div className="sticky left-0 z-10 bg-bg border-r border-line" style={{ width: GUTTER, height: HOURS * HOUR_H }}>
                            {HOUR_LINES.filter((h) => h > 0 && h < 24).map((h) => (
                                <span
                                    key={h}
                                    className="absolute left-1 -translate-y-1/2 text-note text-muted tabular-nums select-none"
                                    style={{ top: h * HOUR_H }}
                                >
                                    {hourLabel(h)}
                                </span>
                            ))}
                        </div>
                        {s.offsets.map((o) => (
                            <DayColumn
                                key={o} offset={o} left={s.leftOf(o)} width={s.colW} todayIso={todayIso} nowMin={nowMin}
                                boundary={dense ? columnBoundary(dayAt(o).getMonth() + 1, dayAt(o).getDate()) : 'none'}
                                dayIndex={dayIndex} selection={selection}
                            />
                        ))}
                    </div>
                </div>
            </div>
            {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={() => setCtx(null)} />}
        </div>
    );
}
