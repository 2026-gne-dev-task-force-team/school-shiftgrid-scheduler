/**
 * 일정 열기 페이지 — 미리보기(peek)에 담는다. 🙋 7 A(쥔님 2026-11-09): 레코드는 열기 페이지 하나에서 고친다(속성 패널 칸 없음).
 *   컬렉션 공통 RecordPage 한 벌(Q5 R5)에 일정 칸만 얹는다: 머리(아이콘·제목) → 속성 목록 → 문서(page-doc 이 있으면).
 *   속성 = 기본 칸(제목·종일·언제·메모) + 저장소의 사용자 칸 · 그 밑에 저장소·내보내기·휴지통(EventActions — 속성이 아니라 동작).
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
import { usePreset } from '../presets';
import { materialize } from '../series';
import { nodeIdOf } from '../events';

const BASE_KEYS = new Set(['name', 'allDay', 'when', 'memo']);

export function EventCardPeek({ eventId: openedId, onClose }: { eventId: string; onClose: () => void }) {
    const { events, storeList } = useCalendarData();
    // 가상 회차로 열렸다가 값을 고치면 실체 레코드로 갈아탄다(그 자리의 가상 칩은 사라진다)
    const [eventId, setEventId] = useState(openedId);
    useEffect(() => setEventId(openedId), [openedId]);
    const event = events.find((e) => e.id === eventId) ?? null;
    const preset = usePreset(event?.storeId);
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

    // 열기 페이지 한 벌(컬렉션 RecordPage — Q5 R5): 머리·경로·⋯ 는 틀이, 칸은 기본 칸 + 저장소 사용자 칸, 그 밑에 동작 줄(저장소·내보내기·휴지통)
    return (
        <rv.RecordPage
            host={host}
            id={event.id}
            fields={[...eventFields(event.allDay), ...(preset.baseFields ?? []), ...userFields]}
            values={values}
            onChange={(key, v) => {
                // 🔴 보기만으로는 실체화 ⛔ — 값을 고칠 때 처음으로 materialize(실체면 그 id 그대로)
                const id = event.occ ? materialize(event.occ) : event.id;
                if (!id) return;
                if (id !== event.id) setEventId(id);
                if (!BASE_KEYS.has(key)) { setEventValue(id, key, v); return; }
                const next = applyEventValue(event, key, v);
                if (next) patchEvent(id, next);
            }}
            onOptionsChange={(key, options) => kit?.setUserFields(event.storeId, userFields.map((f) => (f.key === key ? { ...f, options } : f)))}
            after={<EventActions event={event} stores={storeList} onClose={onClose} />}
        />
    );
}
