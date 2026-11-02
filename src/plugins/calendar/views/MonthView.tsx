/**
 * 월 보기 — 구글/애플 캘린더처럼 **주 단위로 쭉 이어지는 세로 스크롤** 달력 하나.
 *   🔴 ⛔ 일정 데이터·칸 클릭·「+」·저장 없음(쥔님 2026-11-01: *"아직 일정 추가 안할거고 그냥 월 보기만 할겨,
 *      일정 추가 하지마 월그리드만 해"*). 보고 있는 자리는 스크롤 위치뿐 — ⛔ 저장 안 함(host.storage 도 안 쓴다).
 *   🔴 색은 토큰 클래스로만(구조 검사 ①) · 여백 넉넉 · 장식 없음 · 얇은 1px 경계선(line 토큰).
 *
 *   📌 처음엔 달 하나를 통째로 넘기는 꼴(휠 한 번 = 한 달)이었다 → 쥔님 17:01 *"스크롤 부드럽게 임마 딱딱 끊어지는게 아니라"*
 *      → 주(週) 줄이 끝없이 이어지는 스크롤로 바꿨다. 머리줄의 달 이름은 **화면 위쪽 1/3 지점에 걸린 주**의 달을 따라간다.
 *   📌 17:14 쥔님 *"단차 어긋남있고, 스크롤링 좀 버벅이는거 같다. 바깥 달은 좀 어둡게"* → 셋 다 여기서 고쳤다:
 *      ① 단차 — 요일 머리가 스크롤러 **밖**에 있어 세로 스크롤바 폭만큼 본문 7칸과 어긋났다 → 요일 머리를 스크롤러 **안**에 sticky 로 넣어 같은 폭을 쓴다
 *      ② 버벅임 — 208주×7칸을 전부 DOM 에 깔고 있었다 → **보이는 줄 ±6 만 그린다**(위아래는 빈 칸 높이로 채운다)
 *      ③ 바깥 달 — 머리줄이 가리키는 달이 아닌 칸은 바탕을 한 단 어둡게(panel2) + 숫자 muted
 *
 *   얼개: 기준 주(ANCHOR = 오늘이 든 주의 첫날)에서 앞뒤로 offset 주를 깐다. 처음엔 ±2년, 끝에 가까워지면 반년씩 더 깐다
 *   (앞으로 늘릴 땐 scrollTop 을 그만큼 밀어 화면이 안 튄다). 줄 높이는 「(보이는 높이 − 요일 머리) ÷ 6」 — 한 화면에 늘 6주.
 */
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
// 🔑 날짜 계산은 창틀 부품(primitives/date-grid)과 한 벌이다 — 플러그인 안에 사본을 두지 않는다
import {
    Icon, IconButton, Surface,
    monthLabel, shiftMonth, isoOf, addDays, startOfWeek, weeksBetween, weekRow, type DayCell,
} from '../../../pane-ui-system';
import { offsetToScroll } from './scroll-math';

// 🔑 주 시작 요일은 일요일 고정 — 설정으로 뺄 자리다. 지금은 weekStart 인자만 열어 두고 0 으로만 부른다.
const WEEK_START = 0;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const ROWS_VISIBLE = 6;   // 한 화면에 6주
const INIT_WEEKS = 104;   // 처음 까는 범위 — 앞뒤 2년
const CHUNK_WEEKS = 26;   // 끝에 닿으면 반년씩 더
const OVERSCAN = 6;       // 보이는 줄 위아래로 이만큼 더 그린다
const WD_HEADER_H = 24;   // 요일 머리 높이(px) — 스크롤러 안 sticky

/** 기준 주 — 이 뷰가 로드된 날이 든 주의 첫날. 모든 줄은 여기서 몇 주 떨어졌나(offset)로 센다 */
const ANCHOR = startOfWeek(new Date(), WEEK_START);

/** y년 m월 1일이 든 주의 offset */
function monthStartOffset(y: number, m: number): number {
    return weeksBetween(ANCHOR, startOfWeek(new Date(y, m - 1, 1), WEEK_START));
}

/** 어느 날이 든 주의 offset — 첫 배치에서 value(보던 날)의 주로 스크롤을 잡을 때 쓴다 */
function weekOffsetOf(d: Date): number {
    return weeksBetween(ANCHOR, startOfWeek(d, WEEK_START));
}

/** 한 칸 — 날짜 숫자 왼쪽 위 · 1일은 「n월 1일」 · 오늘은 accent 동그라미 · 머리줄의 달이 아니면 어둡게 */
function DayBox({ c, isToday, inHead }: { c: DayCell; isToday: boolean; inHead: boolean }) {
    const first = c.d === 1;
    const label = first ? `${c.m}월 ${c.d}일` : c.d;
    return (
        <div className={`min-h-0 overflow-hidden border-r border-b border-line p-1 ${inHead ? 'bg-bg' : 'bg-panel2'}`}>
            <div className="flex">
                {isToday ? (
                    <span className="grid place-items-center min-w-5 h-5 px-1 rounded-full bg-accent text-bg text-[11px] font-semibold">
                        {label}
                    </span>
                ) : (
                    <span className={`px-1 text-[11px] leading-5 ${first ? 'font-semibold' : ''} ${inHead ? 'text-text' : 'text-muted'}`}>
                        {label}
                    </span>
                )}
            </div>
        </div>
    );
}

/** 한 주 줄 — memo: 스크롤마다 머리줄만 다시 그리고 줄들은 그대로 둔다(머리줄의 달이 바뀔 때만 다시 칠한다) */
const WeekRow = memo(function WeekRow({ offset, height, todayIso, headY, headM }: {
    offset: number; height: number; todayIso: string; headY: number; headM: number;
}) {
    const cells = weekRow(addDays(ANCHOR, offset * 7));
    return (
        <div className="grid grid-cols-7" style={{ height }}>
            {cells.map((c) => (
                <DayBox key={c.iso} c={c} isToday={c.iso === todayIso} inHead={c.y === headY && c.m === headM} />
            ))}
        </div>
    );
});

export function MonthView({ value, onChange, trailing }: { value: Date; onChange: (d: Date) => void; trailing?: ReactNode }) {
    const now = new Date();
    const todayIso = isoOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
    // 🔴 첫 배치에서 scrollTop 을 맞출 날 — 탭(anchor)이 내려준 value. 마운트 때 한 번만 읽는다(이후 스크롤→날짜만 흐른다).
    const initValue = useRef(value);
    // onChange 는 매 렌더 바뀔 수 있으니 ref 로 — 효과가 onChange 를 deps 에 넣어 다시 돌지 않게
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    // 깔린 주 범위 [from, to) — offset 단위
    const [range, setRange] = useState({ from: -INIT_WEEKS, to: INIT_WEEKS });
    const rangeRef = useRef(range);
    rangeRef.current = range;

    // 실제로 DOM 에 그리는 줄 — range 안의 상대 인덱스 [start, end)
    const [vis, setVis] = useState({ start: 0, end: 0 });

    // 줄 높이 — (보이는 높이 − 요일 머리) ÷ 6. ResizeObserver 로 따라간다
    const [rowH, setRowH] = useState(80);
    const rowHRef = useRef(rowH);
    const scrollerRef = useRef<HTMLDivElement>(null);

    // 머리줄의 달 — 화면 위쪽 1/3 지점에 걸린 주의 수요일이 속한 달. 처음엔 value(보던 날)의 달.
    const [head, setHead] = useState({ y: initValue.current.getFullYear(), m: initValue.current.getMonth() + 1 });

    const prevFrom = useRef(range.from);
    const keepTopIdx = useRef<number | null>(null);      // 줄 높이가 바뀔 때 맨 위 줄을 그대로 두기 위해
    const pendingScrollTo = useRef<number | null>(null); // 범위를 늘린 뒤 가야 할 offset
    const didInit = useRef(false);
    const raf = useRef(0);

    /** scrollTop 에서 머리줄 달·그릴 줄 범위·범위 늘리기를 한 번에 계산한다 */
    const syncFromScroll = () => {
        const el = scrollerRef.current;
        if (!el) return;
        const h = rowHRef.current;
        const r = rangeRef.current;
        const total = r.to - r.from;
        const viewH = el.clientHeight - WD_HEADER_H;
        // 그릴 줄
        const first = Math.floor(el.scrollTop / h);
        const last = Math.ceil((el.scrollTop + viewH) / h);
        const start = Math.max(0, first - OVERSCAN);
        const end = Math.min(total, last + OVERSCAN);
        setVis((p) => (p.start === start && p.end === end ? p : { start, end }));
        // 머리줄 달
        const idx = Math.floor((el.scrollTop + viewH * 0.35) / h) + r.from;
        const mid = addDays(ANCHOR, idx * 7 + 3);
        const y = mid.getFullYear(), m = mid.getMonth() + 1;
        setHead((p) => (p.y === y && p.m === m ? p : { y, m }));
        // 끝에 가까우면 더 깐다
        if (first < CHUNK_WEEKS / 2) setRange((p) => ({ ...p, from: p.from - CHUNK_WEEKS }));
        else if (last > total - CHUNK_WEEKS / 2) setRange((p) => ({ ...p, to: p.to + CHUNK_WEEKS }));
    };

    // 높이 측정
    useLayoutEffect(() => {
        const el = scrollerRef.current;
        if (!el) return;
        const measure = () => {
            const h = Math.max(56, Math.floor((el.clientHeight - WD_HEADER_H) / ROWS_VISIBLE));
            if (h === rowHRef.current) return;
            // 🔴 ⭐ 초기화 전(didInit=false)엔 보존 안 함 — 그땐 scrollTop 이 아직 0 이라 keepTopIdx=0 이 되고,
            //    그 0 이 바로 아래 init 이 잡은 자리를 rowH 바뀜 때 덮어 「처음 열면 2년 전(range.from)」으로 튀었다(2026-11-01 22:51 실측).
            if (didInit.current) keepTopIdx.current = el.scrollTop / rowHRef.current;
            rowHRef.current = h;
            setRowH(h);
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // 줄 높이가 바뀌면 맨 위 줄을 유지 · 처음엔 이 달 1일이 든 주를 맨 위에
    useLayoutEffect(() => {
        const el = scrollerRef.current;
        if (!el) return;
        if (!didInit.current) {
            didInit.current = true;
            // 🔴 처음엔 value(보던 날)가 든 주를 맨 위에. `- range.from` 을 지켜야 과거(2024년) 맨 위로 안 튄다(scroll-math).
            //    🔴 ⭐ rowH(클로저)가 아니라 rowHRef.current(이미 측정된 높이)로 센다 — 측정 effect 의 setRowH re-render 전엔
            //       이 effect 가 옛 rowH 를 들고 있어 틀린 자리로 간다(useDayScroller 와 같은 수정).
            el.scrollTop = offsetToScroll(weekOffsetOf(initValue.current), rangeRef.current.from, rowHRef.current);
        } else if (keepTopIdx.current !== null) {
            el.scrollTop = keepTopIdx.current * rowH;
            keepTopIdx.current = null;
        }
        syncFromScroll();
    }, [rowH]); // eslint-disable-line react-hooks/exhaustive-deps

    // 앞으로 늘어났으면 그만큼 scrollTop 을 밀어 화면이 안 튄다 · 늘린 김에 가야 할 데가 있으면 간다
    useLayoutEffect(() => {
        const el = scrollerRef.current;
        if (!el) return;
        const delta = prevFrom.current - range.from;
        prevFrom.current = range.from;
        if (delta > 0) el.scrollTop += delta * rowHRef.current;
        if (pendingScrollTo.current !== null) {
            const off = pendingScrollTo.current;
            pendingScrollTo.current = null;
            el.scrollTo({ top: (off - range.from) * rowHRef.current, behavior: 'smooth' });
        }
        syncFromScroll();
    }, [range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps

    const onScroll = () => {
        if (raf.current) return;
        raf.current = requestAnimationFrame(() => { raf.current = 0; syncFromScroll(); });
    };
    useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

    // 🔴 스크롤로 머리줄 달이 바뀌면 탭의 anchor 로 올린다(그 달 1일) — 뷰를 바꿔도 그 달이 보존된다.
    //    ⚠️ 첫 마운트는 건너뛴다(그땐 value→스크롤만 흐른다. 올리면 value→스크롤→onChange→value 루프의 씨앗이 된다).
    const reportedHead = useRef(true);
    useEffect(() => {
        if (reportedHead.current) { reportedHead.current = false; return; }
        onChangeRef.current(new Date(head.y, head.m - 1, 1));
    }, [head.y, head.m]);

    /** y년 m월 1일이 든 주로 부드럽게 간다 — 범위 밖이면 먼저 깔고 간다 */
    const scrollToMonth = (y: number, m: number) => {
        const el = scrollerRef.current;
        if (!el) return;
        const off = monthStartOffset(y, m);
        const r = rangeRef.current;
        if (off < r.from + 2 || off > r.to - ROWS_VISIBLE - 2) {
            pendingScrollTo.current = off;
            setRange({ from: Math.min(r.from, off - CHUNK_WEEKS), to: Math.max(r.to, off + CHUNK_WEEKS) });
        } else {
            el.scrollTo({ top: (off - r.from) * rowHRef.current, behavior: 'smooth' });
        }
    };
    const go = (delta: number) => {
        const [ny, nm] = shiftMonth(head.y, head.m, delta);
        scrollToMonth(ny, nm);
    };
    const goToday = () => scrollToMonth(now.getFullYear(), now.getMonth() + 1);

    // 년·월 점프(쥔님 16:56 *"년 월 선택하면 바로 점프하러 갈수 있는거 있어야지"*) — 달 이름을 누르면 작은 판이 뜬다.
    //   년도는 ◀ ▶ 로, 달은 12칸 격자에서 하나 고르면 바로 가고 닫힌다. 바깥 클릭·Esc 로 닫힌다.
    const [jumpOpen, setJumpOpen] = useState(false);
    const [jumpYear, setJumpYear] = useState(head.y);
    const jumpRef = useRef<HTMLDivElement>(null);
    const openJump = () => { setJumpYear(head.y); setJumpOpen((o) => !o); };
    const jumpTo = (m: number) => { scrollToMonth(jumpYear, m); setJumpOpen(false); };
    useEffect(() => {
        if (!jumpOpen) return;
        const onDown = (e: PointerEvent) => { if (!jumpRef.current?.contains(e.target as Node)) setJumpOpen(false); };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setJumpOpen(false); };
        document.addEventListener('pointerdown', onDown, true);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onDown, true);
            document.removeEventListener('keydown', onKey);
        };
    }, [jumpOpen]);

    const labels = Array.from({ length: 7 }, (_, i) => WEEKDAYS[(WEEK_START + i) % 7]);
    const total = range.to - range.from;
    const rows: number[] = [];
    for (let i = vis.start; i < vis.end; i++) rows.push(range.from + i);

    return (
        <div className="relative h-full flex flex-col bg-bg select-text">
            {/* 머리줄 — 왼쪽 달 이름(누르면 년·월 점프) · 오른쪽 이동(◀ 오늘 ▶) + 뷰 전환(trailing) */}
            <header className="flex items-center justify-between px-pad py-2 shrink-0">
                <div ref={jumpRef} className="relative">
                    <button
                        type="button"
                        onClick={openJump}
                        aria-expanded={jumpOpen}
                        aria-label="년·월 고르기"
                        className="flex items-center gap-1 -ml-1 px-1 rounded text-base font-semibold text-text hover:bg-text/[0.06] transition-colors"
                    >
                        {monthLabel(head.y, head.m)}
                        <Icon name="right" size={14} className={`text-muted transition-transform ${jumpOpen ? '-rotate-90' : 'rotate-90'}`} />
                    </button>
                    {jumpOpen && (
                        <Surface bordered rounded className="absolute left-0 top-full mt-1 z-20 p-2 w-[232px] shadow-lg">
                            {/* 년도 줄 */}
                            <div className="flex items-center justify-between mb-1">
                                <IconButton icon="left" label="이전 해" onClick={() => setJumpYear((y) => y - 1)} />
                                <span className="text-[13px] font-semibold text-text tabular-nums">{jumpYear}년</span>
                                <IconButton icon="right" label="다음 해" onClick={() => setJumpYear((y) => y + 1)} />
                            </div>
                            {/* 달 12칸 — 지금 보는 달은 accent, 오늘 달은 점 */}
                            <div className="grid grid-cols-4 gap-1">
                                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                                    const isCurrent = jumpYear === head.y && m === head.m;
                                    const isThisMonth = jumpYear === now.getFullYear() && m === now.getMonth() + 1;
                                    return (
                                        <button
                                            key={m}
                                            type="button"
                                            onClick={() => jumpTo(m)}
                                            className={`relative h-8 rounded text-[13px] tabular-nums transition-colors
                                                ${isCurrent ? 'bg-accent text-bg font-semibold' : 'text-text hover:bg-text/[0.06]'}`}
                                        >
                                            {m}월
                                            {isThisMonth && !isCurrent && (
                                                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </Surface>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    <IconButton icon="left" label="이전 달" onClick={() => go(-1)} />
                    <button
                        type="button"
                        onClick={goToday}
                        className="px-2 h-btn rounded text-[12px] text-muted hover:text-text hover:bg-text/[0.06] transition-colors"
                    >
                        오늘
                    </button>
                    <IconButton icon="right" label="다음 달" onClick={() => go(1)} />
                    {trailing}
                </div>
            </header>

            {/* 본문 — 주 줄이 끝없이 이어지는 세로 스크롤. 요일 머리는 이 안에 sticky(스크롤바 폭을 같이 먹어 단차가 없다) */}
            <div
                ref={scrollerRef}
                onScroll={onScroll}
                className="flex-1 min-h-0 overflow-y-auto overscroll-contain border-l border-line"
            >
                <div
                    className="sticky top-0 z-10 grid grid-cols-7 bg-bg border-t border-line"
                    style={{ height: WD_HEADER_H }}
                >
                    {labels.map((w) => (
                        <div key={w} className="border-r border-b border-line text-center text-[11px] leading-[22px] font-medium text-muted select-none">
                            {w}
                        </div>
                    ))}
                </div>
                {/* 위쪽 빈 높이 → 보이는 줄들 → 아래쪽 빈 높이 */}
                <div style={{ height: vis.start * rowH }} />
                {rows.map((o) => (
                    <WeekRow key={o} offset={o} height={rowH} todayIso={todayIso} headY={head.y} headM={head.m} />
                ))}
                <div style={{ height: Math.max(0, total - vis.end) * rowH }} />
            </div>
        </div>
    );
}
