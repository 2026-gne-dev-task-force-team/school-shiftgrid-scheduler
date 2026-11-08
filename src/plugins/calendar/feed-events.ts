/**
 * 남의 일정(출처 항목) → CalEvent 변환 — 순수 함수만(React 0 · 레지스트리 0).
 *   🔴 범위 거르기는 **출처 몫**이다 — 달력은 list(from,to) 로 물어 받은 대로 편다("달력은 받은 대로 그린다").
 *   🔴 한 출처가 list 에서 던지면 그 출처만 건너뛴다(달력은 산다) · color 토큰이 있으면 그 색, 없으면 출처 순서 색.
 */
import { paletteIndexOfToken } from './palette';
import { parseLocal, type CalEvent } from './events';
import type { CalendarItem, CalendarSource } from '../contract-calendar/types';

/** 자기 일정 노드 id 와 안 겹치게 붙이는 접두사. */
export const FEED_ID_PREFIX = 'feed:';

/** 남의 일정에게 물어볼 범위 — 1차는 넓게 한 번(출처가 범위를 거른다 · 각 뷰가 다시 가시 범위로 clip). */
export const FEED_FROM = '1970-01-01T00:00';
export const FEED_TO = '2999-12-31T23:59';

/** 'feed:<sourceId>:<itemId>' — 뷰의 data-event-id·카드 조회 키. */
export function feedEventId(sourceId: string, itemId: string): string {
    return `${FEED_ID_PREFIX}${sourceId}:${itemId}`;
}

/** 출처가 살 「가짜 저장소 id」 — 뷰가 e.storeId 로 자기 저장소 맵을 룩업해도 안 걸리게 분리한다. */
export function feedStoreId(sourceId: string): string {
    return `${FEED_ID_PREFIX}${sourceId}`;
}

export interface FeedSourceInput {
    source: CalendarSource;
    /** color 를 안 준 출처의 기본 색인 */
    colorIdx: number;
}

/**
 * 등록된 출처들에게 [from,to) 를 물어(list) 받은 항목을 CalEvent(foreign 붙은)로 편다.
 *   던지는 출처는 건너뛴다 · 시작/끝이 못 읽히는 항목도 건너뛴다.
 */
export function mapFeedEvents(sources: readonly FeedSourceInput[], from: string, to: string): CalEvent[] {
    const out: CalEvent[] = [];
    for (const { source, colorIdx } of sources) {
        let items: readonly CalendarItem[];
        try { items = source.list(from, to); } catch { continue; }   // 🔴 던지는 출처 격리(테스트 ⑤)
        const readOnly = source.editor === undefined;
        for (const it of items) {
            const startMs = parseLocal(it.start).getTime();
            const endMs = parseLocal(it.end).getTime();
            if (Number.isNaN(startMs) || Number.isNaN(endMs)) continue;
            out.push({
                id: feedEventId(source.id, it.id),
                storeId: feedStoreId(source.id),
                name: it.title,
                start: it.start,
                end: it.end,
                startMs,
                endMs,
                allDay: it.allDay === true,
                memo: typeof it.memo === 'string' ? it.memo : '',
                colorIdx: paletteIndexOfToken(it.color) ?? colorIdx,
                foreign: { sourceId: source.id, sourceLabel: source.label, readOnly, item: it },
            });
        }
    }
    return out;
}
