/**
 * useCalendarData — 모든 저장소의 일정을 메모리에서 읽는 훅 하나(요구명세 「훅 하나」).
 *   🔴 subscribe(노드 변경) 때만 스냅샷이 바뀌고, 그때만 파싱을 다시 한다(매 렌더 재필터 ⛔ — useMemo 로 가둔다).
 *   🔴 조상이 휴지통인 일정은 뺀다(저장소를 휴지통에 넣으면 달력에서 사라진다).
 *
 * 범위 필터·날짜 색인은 events.ts 의 순수 함수로 — 여긴 「노드 → CalEvent」 파싱만 한다.
 */
import { useMemo, useSyncExternalStore } from 'react';
import { subscribeNodes, getEventNodes, getStoreNodes, getNodesApi, inTrash } from './nodes';
import { subscribeFeeds, getFeedsVersion, listFeedSources } from './feed';
import { mapFeedEvents, FEED_FROM, FEED_TO } from './feed-events';
import { useScope } from './store';
import { PALETTE_LEN } from './palette';
import { eventsInScope, isoMinuteOf, occId, type CalEvent, type StoreInfo } from './events';
import { storedToEvent } from './event-fields';
import { occurrences, patternOf, type SeriesData } from './series';

/** 반복 규칙을 펴는 창 — 오늘 앞 2년 ~ 뒤 5년. shortcut: 보기마다 「보이는 범위」를 넘기지 않고 한 창으로 편다(끝없는 월 스크롤도 이 창 밖엔 회차가 없다) — 창 밖 회차가 아쉬우면 보기가 범위를 넘기게 바꾼다. */
function seriesWindow(): [string, string] {
    const now = new Date();
    const y = now.getFullYear();
    return [isoMinuteOf(new Date(y - 2, 0, 1)), isoMinuteOf(new Date(y + 5, 0, 1))];
}

function toMs(s: unknown): number {
    if (typeof s !== 'string') return NaN;
    return new Date(s).getTime();
}

export interface CalendarData {
    /** 살아 있는(휴지통 아닌) 일정 전부 — 날짜 무관. 범위 필터는 eventsInRange 로. */
    events: CalEvent[];
    /** 반복 규칙 일정 자신(시작 = 첫 회차) — 달력엔 안 그리고 목록(레코드)에만 쓴다. 범위 필터는 events 와 같다. */
    rules: CalEvent[];
    /** 저장소 id → 이름·색인. 살아 있는 저장소만. */
    stores: Map<string, StoreInfo>;
    /** 색 고를 때 쓰는 저장소 순서(살아 있는 것만) */
    storeList: StoreInfo[];
}

export function useCalendarData(): CalendarData {
    const eventNodes = useSyncExternalStore(subscribeNodes, getEventNodes, getEventNodes);
    const storeNodes = useSyncExternalStore(subscribeNodes, getStoreNodes, getStoreNodes);
    const scope = useScope();
    // 🔴 남의 일정(출처) — register·dispose·출처 onChange 때만 버전이 바뀌고, 그때만 다시 편다(scope·노드엔 안 바뀐다).
    const feedsVer = useSyncExternalStore(subscribeFeeds, getFeedsVersion, getFeedsVersion);
    // 🔴 feedsVer 는 「다시 펴라」는 신호다 — 레지스트리(listFeedSources)는 반응형이 아니라 버전으로 캐시를 깬다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const foreign = useMemo(() => mapFeedEvents(listFeedSources(), FEED_FROM, FEED_TO), [feedsVer]);

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
        const rules: CalEvent[] = [];
        for (const n of eventNodes) {
            if (inTrash(n.id)) continue;               // 🔴 조상 휴지통 제외
            const storeId = api?.parent(n.id) ?? '';
            const d = storedToEvent(n.data);           // 노드 data(컬렉션 레코드 꼴) → 일정 — 「언제」가 없으면 안 그린다
            if (!d) continue;
            const startMs = toMs(d.start);
            const endMs = toMs(d.end);
            if (Number.isNaN(startMs) || Number.isNaN(endMs)) continue;
            const sd = n.data as SeriesData;
            // 규칙 일정 자신은 달력에 안 그린다(회차로 아래서 편다) — 목록(레코드)에만 한 줄로 간다
            (patternOf(sd) ? rules : events).push({
                id: n.id,
                storeId,
                name: n.name,
                start: d.start,
                end: d.end,
                startMs,
                endMs,
                allDay: d.allDay,
                memo: d.memo ?? '',
                colorIdx: stores.get(storeId)?.colorIdx ?? 0,
                ...(sd.seriesId && sd.originalStart ? { occ: { eventId: n.id, seriesId: sd.seriesId, originalStart: sd.originalStart, start: d.start, end: d.end, allDay: d.allDay, virtual: false } } : {}),
            });
        }
        // 가상 회차 — 맨 위 저장소마다 occurrences 한 번(자손 저장소를 품으니 겹치지 않게 맨 위만) · 실체 회차는 위에서 이미 그렸다
        if (api) {
            const [from, to] = seriesWindow();
            for (const s of storeList) {
                if (api.path(s.id).slice(0, -1).some((a) => stores.has(a))) continue;
                for (const o of occurrences(s.id, from, to)) {
                    if (!o.virtual || !o.seriesId || !o.originalStart) continue;
                    const rule = api.get(o.seriesId);
                    const sid = api.parent(o.seriesId) ?? '';
                    events.push({
                        id: occId(o.seriesId, o.originalStart),
                        storeId: sid,
                        name: rule?.name ?? '',
                        start: o.start,
                        end: o.end,
                        startMs: toMs(o.start),
                        endMs: toMs(o.end),
                        allDay: o.allDay,
                        memo: storedToEvent(rule?.data)?.memo ?? '',
                        colorIdx: stores.get(sid)?.colorIdx ?? 0,
                        occ: o,
                    });
                }
            }
        }
        return { events, rules, stores, storeList };
    }, [eventNodes, storeNodes]);

    // 범위 필터 — scope 가 살아 있는 저장소일 때만 건다(휴지통에 가거나 사라졌으면 전체로 · 지움은 CalendarTab 이 setScope(null)).
    //   🔴 scope(저장소 범위)는 자기 일정에만 건다 — 남의 일정은 저장소 밖 층이라 늘 함께 그린다(받은 대로).
    return useMemo<CalendarData>(() => {
        const effScope = scope && base.stores.has(scope) ? scope : null;
        const own = eventsInScope(base.events, base.stores, effScope);
        return { events: foreign.length ? [...own, ...foreign] : own, rules: eventsInScope(base.rules, base.stores, effScope), stores: base.stores, storeList: base.storeList };
    }, [base, scope, foreign]);
}
