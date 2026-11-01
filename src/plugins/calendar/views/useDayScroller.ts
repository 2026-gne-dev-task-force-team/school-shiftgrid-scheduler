/**
 * useDayScroller — 「날이 좌우로 끝없이 이어지는」 가로 스크롤의 뼈대(시간축 뷰·간트 뷰가 같이 쓴다).
 *   월 보기(MonthView)의 세로 가상화 틀을 가로로 눕힌 것. 기준 날(ANCHOR)에서 몇 날 떨어졌나(offset)로 열을 센다.
 *   · 처음 앞뒤 1년을 깔고 끝에 가까워지면 석 달씩 더 깐다(앞으로 늘릴 땐 scrollLeft 를 밀어 화면이 안 튄다)
 *   · 열 폭은 「(보이는 폭 − 왼쪽 고정 칸) ÷ days」 — 한 화면에 꼭 days 열. fixedColW 를 주면 그 폭으로 고정(간트)
 *   · 보이는 열 ±OVERSCAN 만 돌려준다(offsets) — 그리는 쪽은 leftOf(offset) 로 자리를 잡는다
 *   🔴 React 상태는 range·vis·colW·headOff 넷뿐 · 날짜 산수는 창틀 부품과 한 벌(addDays) + daysBetween
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { addDays } from '../../../pane-ui-system';
import { daysBetween } from './time-grid';

const INIT_DAYS = 365;   // 처음 까는 범위 — 앞뒤 1년
const CHUNK_DAYS = 90;   // 끝에 닿으면 석 달씩 더
const OVERSCAN = 3;      // 보이는 열 좌우로 이만큼 더
const MIN_COL = 24;      // 열 최소 폭

/** 기준 날 — 이 모듈이 로드된 날(자정). 모든 열은 여기서 몇 날 떨어졌나(offset)로 센다 */
export const ANCHOR = (() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); })();
export const dayAt = (offset: number): Date => addDays(ANCHOR, offset);
export const offsetOf = (d: Date): number => daysBetween(ANCHOR, d);

export interface DayScroller {
    scrollerRef: RefObject<HTMLDivElement | null>;
    /** 열 폭(px) */
    colW: number;
    /** 가장 가까운 날 경계의 offset — 머리줄 글자용 */
    headOff: number;
    /** 지금 그려야 할 열들의 offset */
    offsets: number[];
    /** offset 열의 왼쪽 x(px, 콘텐츠 기준 — 왼쪽 고정 칸 폭 포함) */
    leftOf: (offset: number) => number;
    /** 콘텐츠 전체 폭(px) */
    contentW: number;
    onScroll: () => void;
    /** offset 날이 맨 왼쪽에 오게 부드럽게 — 범위 밖이면 먼저 깔고 간다 */
    scrollToOffset: (offset: number) => void;
}

export function useDayScroller({ days, gutter, align, value, onChange, fixedColW, onInit }: {
    /** 한 화면에 들어올 열 수(fixedColW 가 있으면 무시) */
    days: number;
    /** 왼쪽 고정 칸 폭(px) — 시간 눈금·행 이름 */
    gutter: number;
    /** 「이 날이 보이게」 할 때 맨 왼쪽에 둘 날로 당기는 규칙(주 보기는 그 주 일요일, 하루는 그날) */
    align: (d: Date) => Date;
    /** 🔴 보고 있는 날짜 — 탭(anchor)이 내려준다. 첫 배치에서 이 날로 스크롤을 잡는다(옛 `new Date()` 대신). */
    value: Date;
    /** 스크롤·단추로 날이 바뀌면 맨 왼쪽 날을 탭으로 올린다(뷰를 바꿔도 그 날이 보존된다). */
    onChange?: (d: Date) => void;
    fixedColW?: number;
    /** 첫 배치 뒤 한 번(세로 scrollTop 잡기 등) */
    onInit?: (el: HTMLDivElement) => void;
}): DayScroller {
    const [range, setRange] = useState({ from: -INIT_DAYS, to: INIT_DAYS });
    const rangeRef = useRef(range);
    rangeRef.current = range;
    const [vis, setVis] = useState({ start: 0, end: 0 });
    const [colW, setColW] = useState(fixedColW ?? 120);
    const colWRef = useRef(colW);
    const scrollerRef = useRef<HTMLDivElement>(null);
    const alignRef = useRef(align);
    alignRef.current = align;
    const onInitRef = useRef(onInit);
    onInitRef.current = onInit;
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    // 🔴 value 는 마운트 때 한 번만 읽는다(이후 스크롤→날짜만 흐른다 — value→스크롤→onChange→value 루프 방지).
    const initValue = useRef(value);
    const [headOff, setHeadOff] = useState(() => offsetOf(align(initValue.current)));

    const prevFrom = useRef(range.from);
    const keepLeftIdx = useRef<number | null>(null);
    const pendingScrollTo = useRef<number | null>(null);
    const didInit = useRef(false);
    const raf = useRef(0);

    const sync = () => {
        const el = scrollerRef.current;
        if (!el) return;
        const w = colWRef.current;
        const r = rangeRef.current;
        const total = r.to - r.from;
        const viewW = el.clientWidth - gutter;
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

    // 폭 측정 → 열 폭(고정 폭이면 한 번만)
    useLayoutEffect(() => {
        const el = scrollerRef.current;
        if (!el) return;
        const measure = () => {
            const w = fixedColW ?? Math.max(MIN_COL, Math.floor((el.clientWidth - gutter) / days));
            if (w === colWRef.current) return;
            keepLeftIdx.current = el.scrollLeft / colWRef.current;
            colWRef.current = w;
            setColW(w);
        };
        measure();
        if (fixedColW) return;
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, [days, gutter, fixedColW]);

    // 열 폭이 바뀌면 맨 왼쪽 열 유지 · 처음엔 align(오늘)을 맨 왼쪽에
    useLayoutEffect(() => {
        const el = scrollerRef.current;
        if (!el) return;
        if (!didInit.current) {
            didInit.current = true;
            // 🔴 처음엔 value(보던 날)를 맨 왼쪽에 — `new Date()` 가 아니다(뷰를 바꿔도 보던 날이 유지되게).
            el.scrollLeft = (offsetOf(alignRef.current(initValue.current)) - rangeRef.current.from) * colW;
            onInitRef.current?.(el);
        } else if (keepLeftIdx.current !== null) {
            el.scrollLeft = keepLeftIdx.current * colW;
            keepLeftIdx.current = null;
        }
        sync();
    }, [colW]); // eslint-disable-line react-hooks/exhaustive-deps

    // days 가 바뀌면 보고 있던 날을 유지하되 align 규칙으로 당긴다
    useLayoutEffect(() => {
        const el = scrollerRef.current;
        if (!el || !didInit.current) return;
        const cur = dayAt(Math.round(el.scrollLeft / colWRef.current) + rangeRef.current.from);
        el.scrollLeft = (offsetOf(alignRef.current(cur)) - rangeRef.current.from) * colWRef.current;
        sync();
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
        sync();
    }, [range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps

    const onScroll = () => {
        if (raf.current) return;
        raf.current = requestAnimationFrame(() => { raf.current = 0; sync(); });
    };
    useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

    // 🔴 스크롤·단추로 맨 왼쪽 날이 바뀌면 탭의 anchor 로 올린다 — 첫 마운트는 건너뛴다(그땐 value→스크롤만 흐른다).
    const firstReport = useRef(true);
    useEffect(() => {
        if (firstReport.current) { firstReport.current = false; return; }
        onChangeRef.current?.(dayAt(headOff));
    }, [headOff]);

    const scrollToOffset = (off: number) => {
        const el = scrollerRef.current;
        if (!el) return;
        const r = rangeRef.current;
        const visibleCols = Math.ceil((el.clientWidth - gutter) / colWRef.current);
        if (off < r.from + 1 || off > r.to - visibleCols - 1) {
            pendingScrollTo.current = off;
            setRange({ from: Math.min(r.from, off - CHUNK_DAYS), to: Math.max(r.to, off + CHUNK_DAYS) });
        } else {
            el.scrollTo({ left: (off - r.from) * colWRef.current, behavior: 'smooth' });
        }
    };

    const total = range.to - range.from;
    const offsets: number[] = [];
    for (let i = vis.start; i < vis.end; i++) offsets.push(range.from + i);

    return {
        scrollerRef, colW, headOff, offsets,
        leftOf: (o) => gutter + (o - range.from) * colW,
        contentW: gutter + total * colW,
        onScroll, scrollToOffset,
    };
}
