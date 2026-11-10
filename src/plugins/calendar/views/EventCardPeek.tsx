/**
 * 일정 열기 페이지 — 미리보기(peek)에 담는다. 🙋 7 A(쥔님 2026-11-09): 레코드는 열기 페이지 하나에서 고친다(속성 패널 칸 없음).
 *   컬렉션 공통 RecordPage 한 벌(Q5 R5)에 일정 칸만 얹는다: 머리(아이콘·제목) → 속성 목록 → 문서(page-doc 이 있으면).
 *   속성 = 기본 칸(제목·종일·언제·메모) + 저장소의 사용자 칸 · 그 밑에 저장소(EventActions — 속성이 아니라 동작). 지우기는 틀 ⋯.
 *   🔴 피크 내용은 EditorArea 가 한 번 스냅샷(ReactNode)으로 쥔다 — 그래서 **제 구독(useCalendarData)으로 최신을 그린다**.
 *   🔴 일정이 휴지통에 가면(자료에서 사라지면) 스스로 닫는다. 남의 일정은 출처 카드로(편집 코드로 안 넘긴다).
 *   ⭐ 여는 손잡이(useCardPeek)는 짝 파일에 있다 — 이 파일은 컴포넌트 하나만 내보낸다(fast-refresh 규칙).
 */
import { useEffect, useState } from 'react';
import { useCalendarData } from '../useEvents';
import { FeedEventCard } from './FeedEventCard';
import { EventActions } from './EventActions';
// 🔴 import type 만 — 약속 타입(값은 host.modules.use).
import type { RecordCellValue, RecordViewApi } from '../../collection/contracts/collection';
import type { StoredEvent } from '../event-fields';
import { eventFields, eventToValues, applyEventValue } from '../event-fields';
import { getCalendarHost, getNodesApi, getKit, patchEvent, setEventValue } from '../nodes';
import { usePreset, baseFieldsOf } from '../presets';
import { materialize, patternOf } from '../series';
import { nodeIdOf, type CalEvent, type StoreInfo } from '../events';
import { storedToEvent } from '../event-fields';
import { inTrash } from '../nodes';
import { RecurField, OccActions } from './SeriesControls';

const BASE_KEYS = new Set(['name', 'allDay', 'when', 'memo']);

/** 규칙 일정 자신 — 보기는 회차로만 펴서 events 에 없으니 카드가 노드에서 직접 읽는다(「시리즈 열기」·규칙을 막 단 일정). */
function ruleEvent(id: string, stores: Map<string, StoreInfo>): CalEvent | null {
    const api = getNodesApi();
    const n = api?.get(id), d = storedToEvent(n?.data);
    if (!api || !n || !d || !patternOf(n.data) || inTrash(id)) return null;
    const storeId = api.parent(id) ?? '';
    return { id, storeId, name: n.name, start: d.start, end: d.end, startMs: new Date(d.start).getTime(), endMs: new Date(d.end).getTime(),
        allDay: d.allDay, memo: d.memo ?? '', colorIdx: stores.get(storeId)?.colorIdx ?? 0 };
}

export function EventCardPeek({ eventId: openedId, onClose }: { eventId: string; onClose: () => void }) {
    const { events, storeList, stores } = useCalendarData();
    // 가상 회차로 열렸다가 값을 고치면 실체 레코드로 갈아탄다(그 자리의 가상 칩은 사라진다)
    const [eventId, setEventId] = useState(openedId);
    useEffect(() => setEventId(openedId), [openedId]);
    const event = events.find((e) => e.id === eventId) ?? ruleEvent(eventId, stores);
    usePreset(event?.storeId);   // 프리셋 등록·해제 때 다시 그린다(칸은 baseFieldsOf 가 푼다)
    // 일정이 사라지면(휴지통·출처 해제) 미리보기를 닫는다 — 열린 뒤 바깥에서 지워진 경우
    useEffect(() => { if (!event) onClose(); }, [event, onClose]);
    if (!event) return null;
    if (event.foreign) return <FeedEventCard event={event} onClose={onClose} />;

    const host = getCalendarHost();
    const rv = host?.modules.use<RecordViewApi>('collection');
    const kit = getKit();
    const userFields = kit?.userFieldsOf(event.storeId) ?? [];
    const node = getNodesApi()?.get(nodeIdOf(event.id));   // 가상 회차면 규칙 일정의 칸 값을 보인다
    const stored = ((node?.data ?? {}) as Partial<StoredEvent>).values ?? {};
    const values: Record<string, RecordCellValue> = { ...stored, ...eventToValues(event) };
    if (!host || !rv) return null;

    const change = (key: string, v: RecordCellValue) => {
        // 🔴 보기만으로는 실체화 ⛔ — 값을 고칠 때 처음으로 materialize(실체면 그 id 그대로)
        const id = event.occ ? materialize(event.occ) : event.id;
        if (!id) return;
        if (id !== event.id) setEventId(id);
        if (!BASE_KEYS.has(key)) { setEventValue(id, key, v); return; }
        const next = applyEventValue(event, key, v);
        if (next) patchEvent(id, next);
    };
    // 열기 페이지 한 벌(컬렉션 RecordPage — Q5 R5): 머리·경로·⋯ 는 틀이, 칸은 기본 칸 + 저장소 사용자 칸, 그 밑에 저장소 칸
    // 🔴 RecordPage 는 노드를 찾는다 — 가상 회차 id(규칙@시작)는 노드가 아니라 규칙 노드 id 를 넘긴다(F1 A). 제목 고치기는 회차 실체화로 돌린다.
    return (
        <rv.RecordPage
            host={host}
            id={nodeIdOf(event.id)}
            fields={[...eventFields(event.allDay), ...baseFieldsOf(event.storeId), ...userFields]}
            values={values}
            onChange={change}
            onRename={event.occ ? (name) => change('name', name) : undefined}
            onOptionsChange={(key, options) => kit?.setUserFields(event.storeId, userFields.map((f) => (f.key === key ? { ...f, options } : f)))}
            after={<>
                {event.occ
                    ? <OccActions chipId={event.id} occ={event.occ} onOpen={setEventId} />
                    : <RecurField key={event.id} eventId={event.id} rule={patternOf(node?.data)?.rules[0]} start={event.start} />}
                <EventActions event={event} stores={storeList} />
            </>}
        />
    );
}
