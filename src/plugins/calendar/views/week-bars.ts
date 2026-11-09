/**
 * 월 보기 한 주 줄의 일정 배치 — 순수 함수(React 0). 쥔님 F7(2026-11-09): 여러 날 일정이 날마다 따로 칩으로 찍히던 것을
 *   **주 줄 안에서 이어진 막대 하나**로 — 주가 넘어가면 다음 줄에서 이어진다(contL·contR 로 끊긴 쪽을 알린다).
 *   줄(lane) 잡기: 이른 칸·긴 것 먼저 — 각자 걸친 칸이 다 빈 가장 위 줄로(같은 날이면 여러 날 막대가 위).
 */
import type { CalEvent } from '../events';
import { compareEvents, parseLocal } from '../events';

const DAY_MS = 86_400_000;

export interface WeekBar {
    e: CalEvent;
    /** 시작 칸(0~6) · 걸친 칸 수 · 줄(0 이 맨 위) */
    col: number;
    span: number;
    lane: number;
    /** 여러 날 일정인가(막대로 그린다) · 앞 주에서 이어 왔나 · 다음 주로 이어지나 */
    multi: boolean;
    contL: boolean;
    contR: boolean;
}

/** days = 그 주 7일의 iso('YYYY-MM-DD') · dayIndex = buildDayIndex 결과. */
export function layoutWeek(days: readonly string[], dayIndex: ReadonlyMap<string, readonly CalEvent[]>): { bars: WeekBar[]; lanes: number } {
    const weekStart = parseLocal(days[0]).getTime();
    const weekEnd = parseLocal(days[days.length - 1]).getTime() + DAY_MS;
    const seen = new Map<string, { e: CalEvent; first: number; last: number }>();
    days.forEach((iso, i) => {
        for (const e of dayIndex.get(iso) ?? []) {
            const s = seen.get(e.id);
            if (s) s.last = i; else seen.set(e.id, { e, first: i, last: i });
        }
    });
    const items: WeekBar[] = [...seen.values()].map(({ e, first, last }) => {
        const contL = e.startMs < weekStart;
        const contR = e.endMs > weekEnd;
        return { e, col: first, span: last - first + 1, lane: 0, multi: last > first || contL || contR, contL, contR };
    });
    // 이른 칸 → 긴 것 먼저 → 시각 순. 하루짜리는 제 칸 하나만 차지하니 「막대 먼저」는 같은 칸에서 긴 것 먼저로 충분하다.
    items.sort((a, b) => (a.col - b.col) || (b.span - a.span) || compareEvents(a.e, b.e));

    const used: boolean[][] = [];   // used[lane][col]
    for (const it of items) {
        let lane = 0;
        while (used[lane] && used[lane].slice(it.col, it.col + it.span).some(Boolean)) lane++;
        used[lane] ??= Array(days.length).fill(false);
        for (let c = it.col; c < it.col + it.span; c++) used[lane][c] = true;
        it.lane = lane;
    }
    return { bars: items, lanes: used.length };
}

/**
 * 보일 줄 수와 칸마다 숨은 수 — 줄이 칸 높이(room)를 넘치면 마지막 줄을 「+N」 자리로 비운다(그 주 전체 같은 기준 — 막대와 「+N」이 안 겹친다).
 */
export function overflowOf(bars: readonly WeekBar[], lanes: number, room: number, cols = 7): { cutoff: number; hidden: number[] } {
    const cutoff = lanes > room ? Math.max(0, room - 1) : room;
    const hidden = Array<number>(cols).fill(0);
    for (const b of bars) {
        if (b.lane < cutoff) continue;
        for (let c = b.col; c < b.col + b.span; c++) hidden[c]++;
    }
    return { cutoff, hidden };
}
