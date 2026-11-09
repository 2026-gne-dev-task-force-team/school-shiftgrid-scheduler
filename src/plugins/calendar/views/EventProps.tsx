/**
 * 일정 노드의 속성 칸 — 오른쪽 「속성」 패널에 일정을 「제목·종일·언제·메모」 속성 목록(PropertyList)으로 그린다. 표와 같은 Cell 이다.
 *   🔴 칸 자리는 속성 패널이 주고, 칸은 달력(일정 주인)이 낸다(contributes.properties · target = EVENT_TYPE).
 *   저장소·내보내기·휴지통은 속성이 아니라 동작이라 목록 밑(EventActions). 남의 일정은 출처 카드로.
 */
import { useCalendarData } from '../useEvents';
import { FeedEventCard } from './FeedEventCard';
import { EventActions } from './EventActions';
import { eventFields, eventToValues, applyEventValue } from '../event-fields';
import { patchEvent } from '../nodes';
import type { RecordViewApi } from '../../collection/contracts/collection';
import type { PropertiesPaneProps } from '../../../pane-ui-system/plugin';

export function EventProps({ host, target }: PropertiesPaneProps) {
    const { events, storeList } = useCalendarData();
    const rv = host.modules.use<RecordViewApi>('collection');
    const event = events.find((e) => e.id === target.id);
    if (!event || !rv) return null;
    if (event.foreign) return <FeedEventCard event={event} onClose={() => {}} />;
    return (
        <div className="flex flex-col gap-2">
            <rv.PropertyList
                fields={eventFields(event.allDay)}
                values={eventToValues(event)}
                onChange={(key, v) => { const next = applyEventValue(event, key, v); if (next) patchEvent(event.id, next); }}
            />
            <EventActions event={event} stores={storeList} />
        </div>
    );
}
