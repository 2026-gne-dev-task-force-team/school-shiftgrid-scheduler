/**
 * 일정 노드의 속성 칸 — 오른쪽 「속성」 패널에 일정 카드(EventCard) 폼을 그대로 담는다.
 *   🔴 칸 자리는 속성 패널이 주고, 칸은 달력(일정 주인)이 낸다(contributes.properties · target = EVENT_TYPE).
 *   패널은 닫을 게 없으니 onClose 를 안 넘긴다(카드의 닫기 단추가 안 뜬다). 남의 일정은 출처 카드로.
 */
import { useCalendarData } from '../useEvents';
import { EventCard } from './EventCard';
import { FeedEventCard } from './FeedEventCard';
import type { PropertiesPaneProps } from '../../../pane-ui-system/plugin';

export function EventProps({ target }: PropertiesPaneProps) {
    const { events, storeList } = useCalendarData();
    const event = events.find((e) => e.id === target.id);
    if (!event) return null;
    if (event.foreign) return <FeedEventCard event={event} onClose={() => {}} />;
    return <EventCard event={event} stores={storeList} />;
}
