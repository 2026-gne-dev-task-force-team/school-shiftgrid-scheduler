/**
 * 일정의 「속성이 아닌」 동작 — 저장소 옮기기. 일정 열기 페이지(EventCardPeek)가 속성 목록 밑에 단다.
 *   저장소를 바꾸면 nodes.move(다른 저장소로).
 *   🔴 내보내기·휴지통 단추는 없앴다(쥔님 2026-11-10 — 레코드 기본 꼴이 아니다). 지우기는 틀 ⋯ 「휴지통으로」, 내보내기는 저장소 우클릭.
 */
import type { CalEvent, StoreInfo } from '../events';
import { moveEvent } from '../nodes';

const INPUT = 'w-full rounded border border-line bg-bg px-2 py-1 text-small text-text focus:border-accent outline-none';

export function EventActions({ event, stores }: { event: CalEvent; stores: StoreInfo[] }) {
    return (
        <label className="flex flex-col gap-0.5">
            <span className="text-note text-muted">저장소</span>
            <select value={event.storeId} onChange={(e) => moveEvent(event.id, e.target.value)} className={INPUT}>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
        </label>
    );
}
