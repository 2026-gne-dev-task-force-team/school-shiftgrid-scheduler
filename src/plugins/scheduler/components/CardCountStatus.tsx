/**
 * 상태바 「카드 N」 — 🔴 컴포넌트로 둔다(문자열이 아니라). 그래야 스토어를 스스로 구독해
 *   카드가 늘고 줄 때 상태바가 알아서 다시 그려진다(호스트에 "상태바 다시 그려 달라" 창구가 없어도 된다).
 */
import type { ScheduleStore } from '../store';

export function CardCountStatus({ store }: { store: ScheduleStore }) {
    const st = store.use();
    return <>카드 {st.schedule.cards.length}</>;
}
