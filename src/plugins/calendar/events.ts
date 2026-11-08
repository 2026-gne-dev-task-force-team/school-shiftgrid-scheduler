/**
 * 일정 자료 — 순수 함수만(React 0 · 노드 시스템 0). 🔴 범위 필터·날짜 색인·정렬·검색을 테스트 가능한 자리로 뺀다.
 *   달력이 「저장」을 모르듯, 여기는 「노드」를 모른다 — 파싱해 넘긴 CalEvent 평면 객체만 다룬다(useEvents 가 파싱).
 *
 * ⭐ 겹침 판정: 일정 [start,end) 가 범위 [from,to) 와 겹치면 start < to && end > from (반열린 구간).
 */
import { isoOf } from '../../pane-ui-system';
// 🔴 import type 만 — 약속 타입은 달력 약속(이 꾸러미 contracts/calendar)에서(값 아님, 구조 검사 ⑱·g).
import type { CalendarItem } from './contracts/calendar';

/**
 * 남의 일정(다른 플러그인이 꽂은 출처 항목)임을 가리키는 꼬리표 — 자기 일정(노드)이면 없다(undefined).
 *   달력은 이게 붙은 CalEvent 를 **편집 코드로 넘기지 않는다**(카드가 분기한다) · readOnly 면 읽기 전용 카드만.
 */
export interface ForeignRef {
    /** 등록된 출처 id */
    sourceId: string;
    /** 출처 이름(카드·표에 보인다) */
    sourceLabel: string;
    /** editor 가 없어 읽기 전용인가 */
    readOnly: boolean;
    /** 눌렀을 때 출처의 editor 에 그대로 넘길 원본 항목 */
    item: CalendarItem;
}

/** 저장소 한 줄 — 이름 + 팔레트 색인(저장소 순서) + 조상 사슬(범위 판정용). */
export interface StoreInfo {
    id: string;
    name: string;
    colorIdx: number;
    /** 루트 밑 첫 조상 → 자신(저장소 id 뿐 아니라 사이 폴더 id 도 담는다 · nodes.path). 범위(scope) 안인지 가른다. */
    path: string[];
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
    /** 🔴 남의 일정이면 붙는다(자기 일정은 undefined). 붙으면 편집은 카드가 출처 editor 로만 보낸다. */
    foreign?: ForeignRef;
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

/**
 * 범위(scope) 저장소 안 일정만 — 쥔님 2026-11-02: 저장소를 열면 그 저장소 것만, **하위(자손) 저장소 포함**.
 *   🔴 저장소 S 가 범위 안인지는 S.path(조상→자신)에 scopeId 가 있나로 가른다 — scopeId 자신이면 path 가 자신을 담아 참,
 *      자손 저장소면 조상 사슬에 scopeId 가 있어 참, 형제 저장소면 없어 거짓(자동으로 빠진다).
 *   scopeId 가 null 이면 거르지 않는다(전체 · 지금 동작).
 */
export function eventsInScope(events: CalEvent[], stores: Map<string, StoreInfo>, scopeId: string | null): CalEvent[] {
    if (!scopeId) return events;
    const inScope = new Set<string>();
    for (const s of stores.values()) {
        if (s.path.includes(scopeId)) inScope.add(s.id);
    }
    return events.filter((e) => inScope.has(e.storeId));
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

const p2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);

/** Date → 'YYYY-MM-DDTHH:mm'(지역 시각 · 분 단위) — 저장·datetime-local 입력 공통. */
export function isoMinuteOf(d: Date): string {
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** 'YYYY-MM-DDTHH:mm' 또는 'YYYY-MM-DD' → 지역 Date(구성요소로 — new Date(문자열)의 UTC 함정 피함). */
export function parseLocal(s: string): Date {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(s);
    if (!m) return new Date(NaN);
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0));
}
