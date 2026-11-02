/**
 * 일정 자료 — 순수 함수만(React 0 · 노드 시스템 0). 🔴 범위 필터·날짜 색인·정렬·검색을 테스트 가능한 자리로 뺀다.
 *   달력이 「저장」을 모르듯, 여기는 「노드」를 모른다 — 파싱해 넘긴 CalEvent 평면 객체만 다룬다(useEvents 가 파싱).
 *
 * ⭐ 겹침 판정: 일정 [start,end) 가 범위 [from,to) 와 겹치면 start < to && end > from (반열린 구간).
 */
import { isoOf } from '../../pane-ui-system';

/** 저장소 한 줄 — 이름 + 팔레트 색인(저장소 순서). */
export interface StoreInfo {
    id: string;
    name: string;
    colorIdx: number;
}

/** 파싱된 일정 하나 — 노드 name/data 를 평면으로 편 것 + 색인. */
export interface CalEvent {
    id: string;
    storeId: string;
    name: string;
    /** ISO 분 단위 'YYYY-MM-DDTHH:mm' */
    start: string;
    end: string;
    startMs: number;
    endMs: number;
    allDay: boolean;
    memo: string;
    /** 속한 저장소의 팔레트 색인 */
    colorIdx: number;
}

/** 일정 data 의 생김새(노드에 저장되는 불투명 값). */
export interface EventData {
    start: string;
    end: string;
    allDay: boolean;
    memo?: string;
}

/** [start,end) 가 [from,to) 와 겹치나 — 반열린 구간(경계가 맞닿으면 안 겹침). */
export function overlaps(startMs: number, endMs: number, fromMs: number, toMs: number): boolean {
    return startMs < toMs && endMs > fromMs;
}

/** 범위 [fromMs,toMs) 안(겹치는) 일정만. */
export function eventsInRange(events: CalEvent[], fromMs: number, toMs: number): CalEvent[] {
    return events.filter((e) => overlaps(e.startMs, e.endMs, fromMs, toMs));
}

/** 정렬 비교 — 시작 이른 순, 같으면 종일 먼저, 그다음 이름. 표·날 칸 공통. */
export function compareEvents(a: CalEvent, b: CalEvent): number {
    if (a.startMs !== b.startMs) return a.startMs - b.startMs;
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return a.name.localeCompare(b.name);
}

/** 날짜순 정렬한 새 배열(원본 안 건드림). */
export function sortEvents(events: CalEvent[]): CalEvent[] {
    return [...events].sort(compareEvents);
}

/** 제목·메모로 거른다(공백 질의면 전부). 대소문자 무시. */
export function filterEvents(events: CalEvent[], query: string): CalEvent[] {
    const q = query.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) => e.name.toLowerCase().includes(q) || e.memo.toLowerCase().includes(q));
}

/**
 * 날짜(iso) → 그 날 걸친 일정들 색인. 월·년·작은 달력이 칸마다 룩업한다.
 *   여러 날 걸친 일정은 시작~끝 각 날에 들어간다(끝 자정은 제외 — 반열린). 폭주 방지로 한 일정 최대 400일.
 */
export function buildDayIndex(events: CalEvent[]): Map<string, CalEvent[]> {
    const map = new Map<string, CalEvent[]>();
    const push = (iso: string, e: CalEvent) => {
        const arr = map.get(iso);
        if (arr) arr.push(e);
        else map.set(iso, [e]);
    };
    for (const e of events) {
        const first = new Date(e.startMs);
        let cur = new Date(first.getFullYear(), first.getMonth(), first.getDate());
        let guard = 0;
        // 시작 날은 항상 포함(0 길이·거꾸로여도) · 그 뒤로는 끝 자정 전까지
        do {
            push(isoOf(cur.getFullYear(), cur.getMonth() + 1, cur.getDate()), e);
            cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
            guard++;
        } while (cur.getTime() < e.endMs && guard < 400);
    }
    for (const arr of map.values()) arr.sort(compareEvents);
    return map;
}

/** 'HH:MM' — 시간 일정 한 줄 머리. */
export function hhmm(ms: number): string {
    const d = new Date(ms);
    const h = d.getHours();
    const m = d.getMinutes();
    return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}`;
}
