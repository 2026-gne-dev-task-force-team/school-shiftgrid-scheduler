/**
 * 카드 상세 — 피크로 뜬다(노션식). 🔴 ⛔ 오른쪽에 「속성」을 고정하지 않는다(쥔님) — 피크 한 장.
 *
 * 🔴 ⭐ 어느 카드를 보여줄지는 params 가 아니라 스토어의 selectedCardId 로 읽는다 — 피크 우회(store.ts 주석).
 *    편집은 store.update 로 즉시 반영된다(같은 스토어를 WeekView 가 구독하므로 카드가 바로 바뀐다).
 */
import type { ViewProps } from '../../../pane-ui-system/plugin';
import type { ScheduleStore } from '../store';
import { toMins, fromMins } from '../model';

export interface CardViewProps extends ViewProps {
    store: ScheduleStore;
}

export function CardView({ store }: CardViewProps) {
    const st = store.use();
    const card = st.schedule.cards.find((c) => c.id === st.selectedCardId);

    if (!card) {
        return <div className="h-full grid place-items-center text-muted text-sm bg-panel">카드를 고르세요</div>;
    }

    const base = toMins(st.schedule.startTime);
    const startHHmm = fromMins(base + card.start);

    const field = 'w-full bg-panel2 border border-line rounded px-2 py-1 text-[13px] text-text outline-none focus:border-accent';
    const label = 'text-[11px] text-muted';

    return (
        <div className="h-full overflow-auto bg-panel text-text p-3 flex flex-col gap-3" data-testid="card-view">
            <div className="flex flex-col gap-1">
                <span className={label}>제목</span>
                <input className={field + ' text-[15px] font-medium'} data-testid="card-title"
                    value={card.title}
                    onChange={(e) => store.update(card.id, { title: e.target.value })} />
            </div>

            <div className="flex flex-col gap-1">
                <span className={label}>사람 (쉼표로 구분 — 교사·반)</span>
                <input className={field} data-testid="card-people"
                    value={card.people.join(', ')}
                    onChange={(e) => store.update(card.id, { people: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
            </div>

            <div className="flex flex-col gap-1">
                <span className={label}>장소 (특별실)</span>
                <input className={field} data-testid="card-place"
                    value={card.place ?? ''}
                    onChange={(e) => store.update(card.id, { place: e.target.value })} />
            </div>

            <div className="flex gap-2">
                <div className="flex flex-col gap-1 flex-1">
                    <span className={label}>시작</span>
                    <input type="time" className={field} data-testid="card-start"
                        value={startHHmm}
                        onChange={(e) => store.update(card.id, { start: Math.max(0, toMins(e.target.value) - base) })} />
                </div>
                <div className="flex flex-col gap-1 flex-1">
                    <span className={label}>길이(분)</span>
                    <input type="number" min={5} step={5} className={field} data-testid="card-minutes"
                        value={card.minutes}
                        onChange={(e) => store.update(card.id, { minutes: Number(e.target.value) || 5 })} />
                </div>
            </div>

            <div className="flex flex-col gap-1">
                <span className={label}>반복</span>
                <div className="flex gap-1">
                    {(['weekly', 'once'] as const).map((r) => (
                        <button key={r} type="button" data-testid={`card-repeat-${r}`}
                            className={`flex-1 rounded border px-2 py-1 text-[13px] ${card.repeat === r ? 'bg-accent/20 border-accent text-text' : 'bg-panel2 border-line text-muted'}`}
                            onClick={() => store.update(card.id, { repeat: r })}>
                            {r === 'weekly' ? '매주' : '한 번'}
                        </button>
                    ))}
                </div>
            </div>

            <button type="button" data-testid="card-delete"
                className="mt-auto rounded border border-line px-2 py-1.5 text-[13px] text-bad hover:bg-bad/10"
                onClick={() => store.remove(card.id)}>이 카드 지우기</button>
        </div>
    );
}
