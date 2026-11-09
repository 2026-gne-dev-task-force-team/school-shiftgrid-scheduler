/**
 * 일정의 「속성이 아닌」 동작 — 저장소 옮기기 · .ics 내보내기 · 휴지통. 일정 카드(EventCard)와 인스펙터(EventProps)가 같이 쓴다.
 *   저장소를 바꾸면 nodes.move(다른 저장소로) · 「휴지통」은 nodes.remove(영구 아님 — 복원된다).
 */
import { Icon } from '../../../pane-ui-system';
import type { CalEvent, StoreInfo } from '../events';
import { moveEvent, removeEvent, collectEventForExport } from '../nodes';
import { writeIcs } from '../ics';
import { downloadText } from '../file-io';

const INPUT = 'w-full rounded border border-line bg-bg px-2 py-1 text-small text-text focus:border-accent outline-none';

export function EventActions({ event, stores, onClose }: { event: CalEvent; stores: StoreInfo[]; onClose?: () => void }) {
    // 이 일정 하나만 .ics 로 내려받기(노드 「내보내기」의 일정 단위 — 파일 이름은 제목).
    const exportIcs = () => {
        const w = collectEventForExport(event.id);
        if (w) downloadText(`${event.name.trim() || '일정'}.ics`, writeIcs([w]));
    };
    return (
        <>
            <label className="flex flex-col gap-0.5">
                <span className="text-note text-muted">저장소</span>
                <select value={event.storeId} onChange={(e) => moveEvent(event.id, e.target.value)} className={INPUT}>
                    {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
            </label>
            <div className="flex gap-2">
                <button type="button" onClick={exportIcs} className="flex flex-1 items-center justify-center gap-1 rounded border border-line py-1 text-small text-muted hover:text-text hover:bg-text/[0.06]">
                    <Icon name="download" size={13} /> 내보내기
                </button>
                <button type="button" onClick={() => { removeEvent(event.id); onClose?.(); }} className="flex flex-1 items-center justify-center gap-1 rounded border border-line py-1 text-small text-bad hover:bg-bad/[0.1]">
                    <Icon name="trash" size={13} /> 휴지통
                </button>
            </div>
        </>
    );
}
