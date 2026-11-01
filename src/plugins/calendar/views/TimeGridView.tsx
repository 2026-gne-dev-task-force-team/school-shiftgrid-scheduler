/**
 * 시간축 뷰 — 구글 캘린더의 주(7)/3일(3)/하루(1) 보기. **열 개수(days)만 다른 한 컴포넌트**.
 *   쥔님 2026-11-01 17:06: *"주간뷰 3일뷰 하루 스케줄 뷰도 필요하네"*.
 *   🔴 ⛔ 일정 데이터·칸 클릭·드래그·저장 없음(쥔님 *"일정 추가 하지마"*) — 눈금(가로 날짜축 + 세로 시간축)만 그린다.
 *   🔴 색은 토큰 클래스로만(구조 검사 ①) · 날짜 산수는 창틀 부품(배럴)과 한 벌.
 *
 *   📌 17:20 쥔님 *"주 3 하루 이거 좌우 스크롤 그것도 해줘"* → 월 보기(세로)와 같은 틀을 가로로 눕혔다:
 *      날이 **좌우로 끝없이 이어지는** 스크롤. 한 화면에 꼭 `days` 열이 들어오게 열 폭을 재고(폭 ÷ days),
 *      보이는 열 ±3 만 그린다. 세로는 0~24시 시간축 — 두 축이 한 스크롤러다.
 *      · 열 머리는 위에 sticky(세로 스크롤에 붙음) · 시간 눈금은 왼쪽에 sticky(가로 스크롤에 붙음) · 모서리는 둘 다
 *      · 머리줄의 범위 글자는 **가장 가까운 날 경계**에서 `days` 날을 읽는다
 *   📌 17:18 쥔님 *"주가 좀 틀어졌구나"* — 열 머리가 스크롤러 밖에 있어 스크롤바 폭만큼 틀어졌던 것. 이제 한 스크롤러 안이라 같은 폭이다.
 *
 *   trailing: 머리줄 오른쪽 끝에 그대로 그린다 — 메인이 「년·월·주·3일·하루」 전환 단추를 여기 꽂는다.
 */
import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
// 🔑 날짜 계산은 창틀 부품(primitives/date-grid)과 한 벌 — 플러그인 안에 사본을 두지 않는다
import { IconButton, addDays, isoOf } from '../../../pane-ui-system';
import { dayColumns, rangeStart, rangeLabel, hourLabel, minutesOfDay, daysBetween } from './time-grid';

const WEEK_START = 0;                 // 주 시작 요일 일요일 고정(월 보기와 같다 — 설정으로 뺄 자리)
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const HOURS = 24;                     // 0시~24시
const HOUR_H = 48;                    // 한 시간 = 48px(상수)
const GUTTER = 56;                    // 왼쪽 시간 눈금 열 폭(px)
const HDR_H = 52;                     // 열 머리 높이(px) — 요일 + 날짜 두 줄
const START_HOUR = 7;                 // 처음 열 때 맨 위에 오는 시각 — 오전 7시
const MIN_COL = 40;                   // 열 최소 폭
const INIT_DAYS = 365;                // 처음 까는 범위 — 앞뒤 1년
const CHUNK_DAYS = 90;                // 끝에 닿으면 석 달씩 더
const OVERSCAN = 3;                   // 보이는 열 좌우로 이만큼 더 그린다

/** 기준 날 — 이 뷰가 로드된 날(자정). 모든 열은 여기서 몇 날 떨어졌나(offset)로 센다 */
const ANCHOR = (() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); })();
const dayAt = (offset: number) => addDays(ANCHOR, offset);
const offsetOf = (d: Date) => daysBetween(ANCHOR, d);

const HOUR_LINES = Array.from({ length: HOURS + 1 }, (_, h) => h);   // 0~24

/** 열 머리 한 칸 — 요일 + 날짜(오늘은 accent 동그라미) · 1일은 「n월 1일」 */
const DayHeader = memo(function DayHeader({ offset, left, width, todayIso }: { offset: number; left: number; width: number; todayIso: string }) {
    const d = dayAt(offset);
    const iso = isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
    const isToday = iso === todayIso;
    const label = d.getDate() === 1 ? `${d.getMonth() + 1}월 1일` : d.getDate();
    return (
        <div
            className="absolute top-0 flex flex-col items-center justify-center gap-0.5 border-l border-line select-none"
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

export function TimeGridView({ days, trailing }: { days: 1 | 3 | 7; trailing?: ReactNode }) {
    const now = new Date();
    const todayIso = isoOf(now.getFullYear(), now.getMonth() + 1, now.getDate());

    // 깔린 날 범위 [from, to) — offset 단위
    const [range, setRange] = useState({ from: -INIT_DAYS, to: INIT_DAYS });
    const rangeRef = useRef(range);
    rangeRef.current = range;

    // 실제로 그리는 열 — range 안의 상대 인덱스 [start, end)
    const [vis, setVis] = useState({ start: 0, end: 0 });

    // 열 폭 — (보이는 폭 − 눈금) ÷ days. ResizeObserver 로 따라간다
    const [colW, setColW] = useState(120);
    const colWRef = useRef(colW);
    const scrollerRef = useRef<HTMLDivElement>(null);

    // 머리줄 글자용 — 가장 가까운 날 경계의 offset
    const [headOff, setHeadOff] = useState(() => offsetOf(rangeStart(now, days, WEEK_START)));

    const prevFrom = useRef(range.from);
    const keepLeftIdx = useRef<number | null>(null);     // 열 폭이 바뀔 때 맨 왼쪽 열을 그대로 두기 위해
    const pendingScrollTo = useRef<number | null>(null); // 범위를 늘린 뒤 가야 할 offset
    const didInit = useRef(false);
    const raf = useRef(0);

    // 지금 시각 선 — 1분마다
    const [nowMin, setNowMin] = useState(() => minutesOfDay(new Date()));
    useEffect(() => {
        const id = setInterval(() => setNowMin(minutesOfDay(new Date())), 60_000);
        return () => clearInterval(id);
    }, []);

    /** scrollLeft 에서 그릴 열·머리줄 날·범위 늘리기를 한 번에 */
    const syncFromScroll = () => {
        const el = scrollerRef.current;
        if (!el) return;
        const w = colWRef.current;
        const r = rangeRef.current;
        const total = r.to - r.from;
        const viewW = el.clientWidth - GUTTER;
        const first = Math.floor(el.scrollLeft / w);
        const last = Math.ceil((el.scrollLeft + viewW) / w);
        const start = Math.max(0, first - OVERSCAN);
        const end = Math.min(total, last + OVERSCAN);
        setVis((p) => (p.start === start && p.end === end ? p : { start, end }));
        const off = Math.round(el.scrollLeft / w) + r.from;
        setHeadOff((p) => (p === off ? p : off));
        if (first < CHUNK_DAYS / 3) setRange((p) => ({ ...p, from: p.from - CHUNK_DAYS }));
        else if (last > total - CHUNK_DAYS / 3) setRange((p) => ({ ...p, to: p.to + CHUNK_DAYS }));
    };

    // 폭 측정 → 열 폭
    useLayoutEffect(() => {
        const el = scrollerRef.current;
        if (!el) return;
        const measure = () => {
            const w = Math.max(MIN_COL, Math.floor((el.clientWidth - GUTTER) / days));
            if (w === colWRef.current) return;
            keepLeftIdx.current = el.scrollLeft / colWRef.current;
            colWRef.current = w;
            setColW(w);
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, [days]);

    // 열 폭이 바뀌면 맨 왼쪽 열 유지 · 처음엔 오늘(주면 이번 주 일요일)을 맨 왼쪽에, 오전 7시를 맨 위에
    useLayoutEffect(() => {
        const el = scrollerRef.current;
        if (!el) return;
        if (!didInit.current) {
            didInit.current = true;
            el.scrollLeft = (offsetOf(rangeStart(now, days, WEEK_START)) - rangeRef.current.from) * colW;
            el.scrollTop = START_HOUR * HOUR_H;
        } else if (keepLeftIdx.current !== null) {
            el.scrollLeft = keepLeftIdx.current * colW;
            keepLeftIdx.current = null;
        }
        syncFromScroll();
    }, [colW]); // eslint-disable-line react-hooks/exhaustive-deps

    // days 가 바뀌면(주 ↔ 3일 ↔ 하루) 보고 있던 날을 유지하되, 주면 그 주 일요일로 당긴다
    useLayoutEffect(() => {
        const el = scrollerRef.current;
        if (!el || !didInit.current) return;
        const cur = dayAt(Math.round(el.scrollLeft / colWRef.current) + rangeRef.current.from);
        const off = offsetOf(rangeStart(cur, days, WEEK_START));
        el.scrollLeft = (off - rangeRef.current.from) * colWRef.current;
        syncFromScroll();
    }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

    // 앞으로 늘어났으면 scrollLeft 를 밀어 화면이 안 튄다 · 가야 할 데가 있으면 간다
    useLayoutEffect(() => {
        const el = scrollerRef.current;
        if (!el) return;
        const delta = prevFrom.current - range.from;
        prevFrom.current = range.from;
        if (delta > 0) el.scrollLeft += delta * colWRef.current;
        if (pendingScrollTo.current !== null) {
            const off = pendingScrollTo.current;
            pendingScrollTo.current = null;
            el.scrollTo({ left: (off - range.from) * colWRef.current, behavior: 'smooth' });
        }
        syncFromScroll();
    }, [range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps

    const onScroll = () => {
        if (raf.current) return;
        raf.current = requestAnimationFrame(() => { raf.current = 0; syncFromScroll(); });
    };
    useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

    /** offset 날이 맨 왼쪽에 오게 부드럽게 — 범위 밖이면 먼저 깔고 간다 */
    const scrollToOffset = (off: number) => {
        const el = scrollerRef.current;
        if (!el) return;
        const r = rangeRef.current;
        if (off < r.from + 1 || off > r.to - days - 1) {
            pendingScrollTo.current = off;
            setRange({ from: Math.min(r.from, off - CHUNK_DAYS), to: Math.max(r.to, off + CHUNK_DAYS) });
        } else {
            el.scrollTo({ left: (off - r.from) * colWRef.current, behavior: 'smooth' });
        }
    };
    // ◀ ▶ 는 days 만큼(주=한 주·3일=3일·하루=하루) · 「오늘」은 오늘이 든 범위로
    const go = (dir: number) => scrollToOffset(headOff + dir * days);
    const goToday = () => scrollToOffset(offsetOf(rangeStart(new Date(), days, WEEK_START)));

    const cols = dayColumns(dayAt(headOff), days, now);
    const total = range.to - range.from;
    const contentW = GUTTER + total * colW;
    const offsets: number[] = [];
    for (let i = vis.start; i < vis.end; i++) offsets.push(range.from + i);
    const leftOf = (o: number) => GUTTER + (o - range.from) * colW;

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

            {/* 두 축 스크롤러 — 가로는 날, 세로는 시간. 열 머리는 위에·시간 눈금은 왼쪽에 sticky */}
            <div
                ref={scrollerRef}
                onScroll={onScroll}
                className="flex-1 min-h-0 overflow-auto overscroll-contain border-t border-line"
            >
                <div className="relative" style={{ width: contentW, height: HDR_H + HOURS * HOUR_H }}>
                    {/* 열 머리 줄(sticky top) — 모서리는 sticky left 로 눈금 위에 */}
                    <div className="sticky top-0 z-20 bg-bg border-b border-line" style={{ height: HDR_H, width: contentW }}>
                        <div className="sticky left-0 z-30 bg-bg" style={{ width: GUTTER, height: HDR_H }} aria-hidden="true" />
                        {offsets.map((o) => (
                            <DayHeader key={o} offset={o} left={leftOf(o)} width={colW} todayIso={todayIso} />
                        ))}
                    </div>
                    {/* 본문 — 시간 눈금(sticky left) + 날 열들 */}
                    <div className="relative" style={{ height: HOURS * HOUR_H, width: contentW }}>
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
                        {offsets.map((o) => (
                            <DayColumn key={o} offset={o} left={leftOf(o)} width={colW} todayIso={todayIso} nowMin={nowMin} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
