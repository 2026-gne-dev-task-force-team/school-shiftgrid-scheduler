/**
 * 일정 열기 페이지 — 미리보기(peek)에 담는다. 🙋 7 A(쥔님 2026-11-09): 레코드는 열기 페이지 하나에서 고친다(속성 패널 칸 없음).
 *   얼개는 컬렉션 레코드 열기(ItemPeek)와 같다: 머리(아이콘·제목) → 속성 목록 → 문서(page-doc 이 있으면).
 *   속성 = 기본 칸(제목·종일·언제·메모) + 저장소의 사용자 칸 · 그 밑에 저장소·내보내기·휴지통(EventActions — 속성이 아니라 동작).
 *   🔴 피크 내용은 EditorArea 가 한 번 스냅샷(ReactNode)으로 쥔다 — 그래서 **제 구독(useCalendarData)으로 최신을 그린다**.
 *   🔴 일정이 휴지통에 가면(자료에서 사라지면) 스스로 닫는다. 남의 일정은 출처 카드로(편집 코드로 안 넘긴다).
 *   ⭐ 여는 손잡이(useCardPeek)는 짝 파일에 있다 — 이 파일은 컴포넌트 하나만 내보낸다(fast-refresh 규칙).
 */
import { useEffect } from 'react';
import { useCalendarData } from '../useEvents';
import { FeedEventCard } from './FeedEventCard';
import { EventActions } from './EventActions';
// 🔴 import type 만 — 약속 타입(값은 host.modules.use).
import type { PageDocApi } from '../../page/contracts/page-doc';
import type { RecordCellValue, RecordViewApi } from '../../collection/contracts/collection';
import type { StoredEvent } from '../event-fields';
import { eventFields, eventToValues, applyEventValue } from '../event-fields';
import { getCalendarHost, getNodesApi, getKit, patchEvent, setEventValue } from '../nodes';

const BASE_KEYS = new Set(['name', 'allDay', 'when', 'memo']);

export function EventCardPeek({ eventId, onClose }: { eventId: string; onClose: () => void }) {
    const { events, storeList } = useCalendarData();
    const event = events.find((e) => e.id === eventId) ?? null;
    // 일정이 사라지면(휴지통·출처 해제) 미리보기를 닫는다 — 열린 뒤 바깥에서 지워진 경우
    useEffect(() => { if (!event) onClose(); }, [event, onClose]);
    if (!event) return null;
    if (event.foreign) return <FeedEventCard event={event} onClose={onClose} />;

    const host = getCalendarHost();
    const api = getNodesApi();
    const node = api?.get(event.id);
    const rv = host?.modules.use<RecordViewApi>('collection');
    const kit = getKit();
    const userFields = kit?.userFieldsOf(event.storeId) ?? [];
    const stored = ((node?.data ?? {}) as Partial<StoredEvent>).values ?? {};
    const values: Record<string, RecordCellValue> = { ...stored, ...eventToValues(event) };

    const props = (
        <div className="flex flex-col gap-2">
            {rv && (
                <rv.PropertyList
                    fields={[...eventFields(event.allDay), ...userFields]}
                    values={values}
                    onChange={(key, v) => {
                        if (!BASE_KEYS.has(key)) { setEventValue(event.id, key, v); return; }
                        const next = applyEventValue(event, key, v);
                        if (next) patchEvent(event.id, next);
                    }}
                    onOptionsChange={(key, options) => kit?.setUserFields(event.storeId, userFields.map((f) => (f.key === key ? { ...f, options } : f)))}
                />
            )}
            <EventActions event={event} stores={storeList} onClose={onClose} />
        </div>
    );
    const pd = host?.modules.use<PageDocApi>('page-doc');
    if (!host || !pd || !api || !node) return props;
    return (
        <div className="-mx-4 h-full">
            <pd.PageDoc host={host} docKey={event.id} value={node.body} onChange={(v) => api.setBody(event.id, v)}
                icon={node.icon} onSetIcon={(i) => api.setIcon(event.id, i)}
                title={event.name} onRename={(n) => api.rename(event.id, n)} properties={props} />
        </div>
    );
}
