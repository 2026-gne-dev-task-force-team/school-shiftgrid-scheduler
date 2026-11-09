/**
 * 달력 「범위 선택」 순수 계산 — 🔴 React·DOM 0. 빈 칸을 죽 끌어 날짜·시간 범위를 고르는 것(쥔님 2026-11-02:
 *   *"달력 이제 추가는 아닌데 선택할 수 있게 해줘. 죽 드래그 같은 것들, 모든 뷰다"*). 일정을 만드는 게 아니다 — 고른 상태뿐.
 *
 * ⭐ 두 모양: days(날짜 범위, 양끝 포함) · time(시각 반열린 [start,end)). 모드를 바꿔도 남는다(CalendarTab 이 쥔다).
 *   · time 을 월·년·간트·일정 표에선 그 날들(startMs 날 ~ endMs-1 의 날)을 days 처럼 칠한다 → dayInSelection
 *   · days 를 시간 그리드에선 그 날들의 열 전체를 칠한다 → timeSliceForDay 가 종일 구간으로 돌려준다
 */
import { hhmm, isoMinuteOf, parseLocal } from './events';

export type CalSelection =
    | { kind: 'days'; from: string; to: string }          // ISO 'YYYY-MM-DD' 양끝 포함, from <= to
    | { kind: 'time'; startMs: number; endMs: number }    // 반열린 [start, end), 여러 날 걸쳐도 된다
    | null;

const DAY_MS = 86_400_000;
const WD = ['일', '월', '화', '수', '목', '금', '토'];

/** iso(날짜만) → 그 날 자정 ms(지역). */
function dayStartOfIso(iso: string): number {
    return parseLocal(iso).getTime();
}
/** 그 날 자정 ms(지역). */
function dayStartOfMs(ms: number): number {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
/** ms 가 지역 자정에 딱 떨어지나(종일 끝 24:00 판정). */
function isLocalMidnight(ms: number): boolean {
    const d = new Date(ms);
    return d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0;
}
function sameLocalDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
/** '11/3(화)' */
function mdw(d: Date): string {
    return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`;
}

// ── 범위 만들기 ───────────────────────────────────────────────────────────

/** 두 ISO 날짜를 앞뒤로 정렬해 days 선택으로(양끝 포함 · 역방향 끌기도 같은 결과). */
export function daysSelection(a: string, b: string): CalSelection {
    const [from, to] = a <= b ? [a, b] : [b, a];
    return { kind: 'days', from, to };
}

/**
 * 두 슬롯 시작 ms + 스냅(분)으로 time 선택으로 — 반열린 [start, end).
 *   anchor·cur 은 스냅된 슬롯 시작(floorToSnap). 멀리(큰 쪽) 슬롯은 그 칸 끝까지 덮게 snap 을 더한다.
 *   한 칸만 고르면(anchor===cur) [cur, cur+snap) · 역방향도 같은 결과.
 */
export function timeSelection(anchorMs: number, curMs: number, snapMin: number): CalSelection {
    const lo = Math.min(anchorMs, curMs);
    const hi = Math.max(anchorMs, curMs);
    return { kind: 'time', startMs: lo, endMs: hi + snapMin * 60_000 };
}

/** 하루 중 분(0~1439)을 스냅 슬롯 시작으로 — [0, 1440-snap] 로 가둔다(마지막 칸은 23:30 등). */
export function floorToSnap(min: number, snap: number): number {
    const slot = Math.floor(min / snap) * snap;
    return Math.max(0, Math.min(1440 - snap, slot));
}

// ── 읽기(칠하기 판정) ──────────────────────────────────────────────────────

/** iso 날짜가 선택 범위 안인가 — days 면 from~to, time 이면 그 날이 [start,end) 와 겹치나. */
export function dayInSelection(sel: CalSelection, iso: string): boolean {
    if (!sel) return false;
    if (sel.kind === 'days') return sel.from <= iso && iso <= sel.to;
    const dayStart = dayStartOfIso(iso);
    const dayEnd = dayStart + DAY_MS;
    return dayStart < sel.endMs && dayEnd > sel.startMs;   // 반열린 겹침
}

/**
 * 시간 그리드에서 한 날(dayStartMs 자정) 열에 칠할 구간 [a,b) ms — 없으면 null.
 *   time 선택이면 [start,end) 를 그 날로 자른 조각 · days 선택이면 그 날이 범위 안일 때 열 전체(종일).
 */
export function timeSliceForDay(sel: CalSelection, dayStartMs: number, dayIso: string): { startMs: number; endMs: number } | null {
    if (!sel) return null;
    const dayEnd = dayStartMs + DAY_MS;
    if (sel.kind === 'days') {
        return dayInSelection(sel, dayIso) ? { startMs: dayStartMs, endMs: dayEnd } : null;
    }
    const a = Math.max(sel.startMs, dayStartMs);
    const b = Math.min(sel.endMs, dayEnd);
    return a < b ? { startMs: a, endMs: b } : null;
}

// ── 머리줄 칩 라벨 ─────────────────────────────────────────────────────────

/** 기간 글자 — '2시간' · '30분' · '2시간 30분'. */
function durationLabel(ms: number): string {
    const totalMin = Math.round(ms / 60_000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h === 0) return `${m}분`;
    if (m === 0) return `${h}시간`;
    return `${h}시간 ${m}분`;
}

/**
 * 칩 글자 — 선택 없으면 빈 문자열.
 *   days  '11/3(화) ~ 11/7(토) · 5일' · 한 칸 '11/3(화) · 1일'
 *   time  같은 날 '11/3(화) 14:00–16:00 · 2시간'
 *         날 넘김 '11/3(화) 23:00 ~ 11/4(수) 01:30 · 2시간 30분'
 *         자정 끝 '11/3(화) 23:30–24:00 · 30분'(끝이 자정이면 그 전날 24:00 으로 적는다)
 */
export function selectionLabel(sel: CalSelection): string {
    if (!sel) return '';
    if (sel.kind === 'days') {
        const a = parseLocal(sel.from);
        const b = parseLocal(sel.to);
        if (sel.from === sel.to) return `${mdw(a)} · 1일`;
        const count = Math.round((dayStartOfMs(b.getTime()) - dayStartOfMs(a.getTime())) / DAY_MS) + 1;
        return `${mdw(a)} ~ ${mdw(b)} · ${count}일`;
    }
    const start = new Date(sel.startMs);
    const dur = durationLabel(sel.endMs - sel.startMs);
    const endMidnight = isLocalMidnight(sel.endMs);
    // 끝이 자정이면 「그 전날의 24:00」으로 — 23:30~24:00 을 다음 날 00:00 로 적지 않게(반열린 끝의 표기 규칙).
    const endDay = endMidnight ? new Date(sel.endMs - 1) : new Date(sel.endMs);
    const endTime = endMidnight ? '24:00' : hhmm(sel.endMs);
    if (sameLocalDay(start, endDay)) {
        return `${mdw(start)} ${hhmm(sel.startMs)}–${endTime} · ${dur}`;
    }
    return `${mdw(start)} ${hhmm(sel.startMs)} ~ ${mdw(endDay)} ${endTime} · ${dur}`;
}

/**
 * 고른 범위를 쥔 채 우클릭 「새 일정」 — 클릭한 칸이 범위 안이면 범위 전체가 한 일정(W7 · 쥔님 *"여러 날짜 선택해서 우클릭해서 일정 생성하면 하루로만"*).
 *   · days 범위 · 또는 월 보기(hitMs 없음)에서 time 범위가 걸친 날들 → 종일 [from 00:00, 끝날 다음 00:00)
 *   · time 범위 + 시간 칸(hitMs)이 [start,end) 안 → 그 시각 구간 그대로
 *   범위 밖을 눌렀거나 범위가 없으면 null — 부른 쪽이 옛 동작(눌린 칸 하나)으로 간다.
 */
export function eventFromSelection(sel: CalSelection, hitIso: string | null, hitMs: number | null = null): { start: string; end: string; allDay: boolean } | null {
    if (!sel) return null;
    if (sel.kind === 'time' && hitMs != null) {
        if (hitMs < sel.startMs || hitMs >= sel.endMs) return null;
        return { start: isoMinuteOf(new Date(sel.startMs)), end: isoMinuteOf(new Date(sel.endMs)), allDay: false };
    }
    if (!hitIso || !dayInSelection(sel, hitIso)) return null;
    let from: Date, to: Date;
    if (sel.kind === 'days') { from = parseLocal(sel.from); to = parseLocal(sel.to); }
    else {
        const a = new Date(sel.startMs), b = new Date(sel.endMs - 1);
        from = new Date(a.getFullYear(), a.getMonth(), a.getDate());
        to = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    }
    const end = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);
    return { start: isoMinuteOf(from), end: isoMinuteOf(end), allDay: true };
}
