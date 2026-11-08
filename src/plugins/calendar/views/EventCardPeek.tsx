/**
 * 일정 카드를 미리보기(peek)에 담는 자족 컴포넌트.
 *   🔴 피크 내용은 EditorArea 가 한 번 스냅샷(ReactNode)으로 쥔다 — 그래서 뷰가 다시 그려도 show 를 다시 안 부른다.
 *      따라서 **카드가 제 구독(useCalendarData)으로 최신을 그린다**(설정의 PluginDetail 과 같은 꼴) — 편집해도 포커스가 안 튄다.
 *   🔴 일정이 휴지통에 가면(자료에서 사라지면) 스스로 닫는다.
 *   ⭐ 여는 손잡이(useCardPeek)는 짝 파일에 있다 — 이 파일은 컴포넌트 하나만 내보낸다(fast-refresh 규칙).
 */
import { useEffect } from 'react';
import { useCalendarData } from '../useEvents';
import { EventCard } from './EventCard';
import { FeedEventCard } from './FeedEventCard';

export function EventCardPeek({ eventId, onClose }: { eventId: string; onClose: () => void }) {
    const { events, storeList } = useCalendarData();
    const event = events.find((e) => e.id === eventId) ?? null;
    // 일정이 사라지면(휴지통·출처 해제) 미리보기를 닫는다 — 열린 뒤 바깥에서 지워진 경우
    useEffect(() => { if (!event) onClose(); }, [event, onClose]);
    if (!event) return null;
    // 🔴 남의 일정이면 출처 카드(editor 있으면 그 화면, 없으면 읽기 전용)로 — 자기 일정 편집 폼(EventCard)엔 안 넘긴다.
    if (event.foreign) return <FeedEventCard event={event} onClose={onClose} />;
    return <EventCard event={event} stores={storeList} onClose={onClose} />;
}
