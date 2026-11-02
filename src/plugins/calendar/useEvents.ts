/**
 * useCalendarData — 모든 저장소의 일정을 메모리에서 읽는 훅 하나(요구명세 「훅 하나」).
 *   🔴 subscribe(노드 변경) 때만 스냅샷이 바뀌고, 그때만 파싱을 다시 한다(매 렌더 재필터 ⛔ — useMemo 로 가둔다).
 *   🔴 조상이 휴지통인 일정은 뺀다(저장소를 휴지통에 넣으면 달력에서 사라진다).
 *
 * 범위 필터·날짜 색인은 events.ts 의 순수 함수로 — 여긴 「노드 → CalEvent」 파싱만 한다.
 */
import { useMemo, useSyncExternalStore } from 'react';
import { subscribeNodes, getEventNodes, getStoreNodes, getNodesApi, inTrash } from './nodes';
import { useScope } from './store';
import { PALETTE_LEN } from './palette';
import { eventsInScope, type CalEvent, type StoreInfo, type EventData } from './events';

function toMs(s: unknown): number {
    if (typeof s !== 'string') return NaN;
    return new Date(s).getTime();
}

export interface CalendarData {
    /** 살아 있는(휴지통 아닌) 일정 전부 — 날짜 무관. 범위 필터는 eventsInRange 로. */
    events: CalEvent[];
    /** 저장소 id → 이름·색인. 살아 있는 저장소만. */
    stores: Map<string, StoreInfo>;
    /** 색 고를 때 쓰는 저장소 순서(살아 있는 것만) */
    storeList: StoreInfo[];
}

export function useCalendarData(): CalendarData {
    const eventNodes = useSyncExternalStore(subscribeNodes, getEventNodes, getEventNodes);
    const storeNodes = useSyncExternalStore(subscribeNodes, getStoreNodes, getStoreNodes);
    const scope = useScope();

    // 파싱(노드 → CalEvent)·저장소 목록은 노드가 바뀔 때만 다시 — 범위(scope)만 바뀌면 재파싱 안 한다.
    const base = useMemo(() => {
        const api = getNodesApi();
        const stores = new Map<string, StoreInfo>();
        const storeList: StoreInfo[] = [];
        storeNodes.forEach((s) => {
            if (inTrash(s.id)) return;                 // 휴지통 저장소는 색 목록에서도 뺀다
            const info: StoreInfo = { id: s.id, name: s.name, colorIdx: storeList.length % PALETTE_LEN, path: api?.path(s.id) ?? [] };
            stores.set(s.id, info);
            storeList.push(info);
        });

        const events: CalEvent[] = [];
        for (const n of eventNodes) {
            if (inTrash(n.id)) continue;               // 🔴 조상 휴지통 제외
            const storeId = api?.parent(n.id) ?? '';
            const d = (n.data ?? {}) as Partial<EventData>;
            const startMs = toMs(d.start);
            const endMs = toMs(d.end);
            if (Number.isNaN(startMs) || Number.isNaN(endMs)) continue;
            events.push({
                id: n.id,
                storeId,
                name: n.name,
                start: typeof d.start === 'string' ? d.start : '',
                end: typeof d.end === 'string' ? d.end : '',
                startMs,
                endMs,
                allDay: d.allDay === true,
                memo: typeof d.memo === 'string' ? d.memo : '',
                colorIdx: stores.get(storeId)?.colorIdx ?? 0,
            });
        }
        return { events, stores, storeList };
    }, [eventNodes, storeNodes]);

    // 범위 필터 — scope 가 살아 있는 저장소일 때만 건다(휴지통에 가거나 사라졌으면 전체로 · 지움은 CalendarTab 이 setScope(null)).
    return useMemo<CalendarData>(() => {
        const effScope = scope && base.stores.has(scope) ? scope : null;
        return { events: eventsInScope(base.events, base.stores, effScope), stores: base.stores, storeList: base.storeList };
    }, [base, scope]);
}
