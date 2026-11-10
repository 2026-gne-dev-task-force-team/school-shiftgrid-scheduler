/**
 * 가져오기·내보내기의 순수 변환 — 노드도 React 도 모른다(테스트 가능한 자리). nodes.ts 가 이걸 써서 실제 노드를 만든다.
 *   · 가져오기: CalendarItem(파서 결과) → ImportSpec(노드에 넣을 name+data). 중복은 **UID 기준**으로 거른다.
 *   · 내보내기: 내 일정 노드 → IcsWriteEvent(작성기 입력).
 *
 * 🔴 중복 처리(쥔님 2026-11-08): 같은 .ics 를 두 번 넣으면 UID 같은 일정은 건너뛴다(저장소에 이미 있는 UID + 이번 묶음 안 중복 둘 다).
 *    UID 없는 일정(드문 경우)은 거를 열쇠가 없어 늘 들인다(그래서 두 번 넣으면 쌓인다 — 보고 대상).
 */
import { isoMinuteOf, parseLocal, type EventData } from './events';
import type { CalendarItem } from './contracts/calendar';
import type { IcsSeriesItem, IcsWriteEvent } from './ics';
import type { DatePattern } from './recur';

export interface ImportSpec { name: string; data: EventData; pattern?: DatePattern }

/** CalendarItem → 노드에 넣을 name+data. 날짜는 우리 저장 꼴('YYYY-MM-DDTHH:mm')로 정규화(종일도 자정 문자열로). */
export function itemToSpec(item: IcsSeriesItem): ImportSpec {
    const data: EventData = {
        start: isoMinuteOf(parseLocal(item.start)),
        end: isoMinuteOf(parseLocal(item.end)),
        allDay: item.allDay,
        ...(item.memo ? { memo: item.memo } : {}),
        uid: item.id,
    };
    return item.pattern ? { name: item.title, data, pattern: item.pattern } : { name: item.title, data };
}

/**
 * 가져올 목록을 짠다 — 이미 있는 UID(existingUids)와 이번 묶음 안 중복을 UID 로 거른다.
 *   돌려주는 skipped 는 「UID 가 겹쳐 건너뛴 수」. UID 없는 항목은 못 거르니 전부 들인다.
 */
export function planImport(existingUids: Iterable<string>, items: readonly IcsSeriesItem[]): { specs: ImportSpec[]; skipped: number } {
    const seen = new Set<string>(existingUids);
    const specs: ImportSpec[] = [];
    let skipped = 0;
    for (const item of items) {
        const uid = item.id;
        if (uid && seen.has(uid)) { skipped++; continue; }
        if (uid) seen.add(uid);
        specs.push(itemToSpec(item));
    }
    return { specs, skipped };
}

/** 내 일정 노드(이름·data·id) → .ics 작성기 입력. UID 는 가져온 것이면 원본, 아니면 노드 id. */
export function eventToIcs(node: { id: string; name: string; data: EventData }, pattern?: DatePattern): IcsWriteEvent {
    const d = node.data;
    return {
        uid: d.uid ?? node.id,
        title: node.name || '(제목 없음)',
        start: d.start,
        end: d.end,
        allDay: d.allDay === true,
        ...(d.memo ? { memo: d.memo } : {}),
        ...(pattern ? { pattern } : {}),
    };
}

/**
 * CalendarItem(파서 결과·남의 일정 평면값) → .ics 작성기 입력 — 구독 노드 내보내기가 쓴다(받아 둔 lastIcs 를 파싱해 다시 쓴다).
 *   🔴 start/end 는 parseIcs 가 이미 우리 저장 꼴('YYYY-MM-DD'·'...THH:mm')로 정규화했으니 그대로 넘긴다(작성기가 꼴을 맞춘다).
 */
export function itemToIcs(item: CalendarItem): IcsWriteEvent {
    return {
        uid: item.id,
        title: item.title || '(제목 없음)',
        start: item.start,
        end: item.end,
        allDay: item.allDay,
        ...(item.memo ? { memo: item.memo } : {}),
    };
}

