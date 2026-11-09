/**
 * 일정 카드 — 일정을 누르면 뜨는 편집 폼(요구명세 C2). ⛔ window.prompt/confirm 안 씀.
 *   제목·시작·끝·종일 토글·메모·저장소 고르기·휴지통. 바꾸면 바로 노드에 쓴다(nodes.ts → NodesApi).
 *   🔴 한글 조합 중 Enter 무시(isComposing || keyCode 229) · 🔴 색은 토큰만.
 *   🔴 ⭐ 자리·테두리·그림자는 창틀의 미리보기(peek)가 쥔다 — 여긴 세로 폼만 그린다(EventCardPeek 가 peek 에 담는다).
 *
 * 저장소를 바꾸면 nodes.move(다른 저장소로) · 「휴지통」은 nodes.remove(영구 아님 — 복원된다).
 */
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { DateField, Icon, Toggle } from '../../../pane-ui-system';
import { isoMinuteOf, parseLocal, type CalEvent, type StoreInfo, type EventData } from '../events';
import { renameEvent, updateEventData, moveEvent, removeEvent, collectEventForExport } from '../nodes';
import { writeIcs } from '../ics';
import { downloadText } from '../file-io';

const DAY = 86_400_000;
const HOUR = 3_600_000;

const toDate = (ms: number) => isoMinuteOf(new Date(ms)).slice(0, 10);          // 'YYYY-MM-DD'
const toDateTime = (ms: number) => isoMinuteOf(new Date(ms));                   // 'YYYY-MM-DDTHH:mm'
const startOfDay = (ms: number) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };

const INPUT = 'w-full rounded border border-line bg-bg px-2 py-1 text-[12px] text-text focus:border-accent outline-none';
const LABEL = 'text-[11px] text-muted';

export function EventCard({ event, stores, onClose }: { event: CalEvent; stores: StoreInfo[]; onClose?: () => void }) {
    const [title, setTitle] = useState(event.name);
    const [memo, setMemo] = useState(event.memo);
    const titleRef = useRef<HTMLInputElement>(null);

    // 다른 일정으로 바뀌면 지역 입력을 새로 맞춘다
    useEffect(() => { setTitle(event.name); setMemo(event.memo); }, [event.id, event.name, event.memo]);
    // 새로 열리면 제목에 포커스(인라인 입력)
    useEffect(() => { titleRef.current?.focus(); titleRef.current?.select(); }, [event.id]);

    /** 바뀐 data 한 벌을 노드에 쓴다(시작/끝 선후는 setStart/setEnd 가 이미 보장). */
    const write = (patch: Partial<EventData>) => {
        updateEventData(event.id, { start: event.start, end: event.end, allDay: event.allDay, memo: event.memo, ...patch });
    };

    const commitTitle = () => { renameEvent(event.id, title.trim() || '새 일정'); };
    const onTitleKey = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'Enter') return;
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;   // 🔴 한글 조합 중 Enter 무시
        e.preventDefault();
        commitTitle();
        onClose?.();
    };

    const setAllDay = (on: boolean) => {
        const s0 = startOfDay(event.startMs);
        if (on) write({ allDay: true, start: isoMinuteOf(new Date(s0)), end: isoMinuteOf(new Date(s0 + DAY)) });
        else write({ allDay: false, start: isoMinuteOf(new Date(s0 + 9 * HOUR)), end: isoMinuteOf(new Date(s0 + 10 * HOUR)) });
    };

    // 시작/끝 바꾸기 — 끝이 시작보다 앞서면 당겨 붙인다(종일 +1일 · 시간 +1시간)
    const setStart = (ms: number) => {
        const minEnd = ms + (event.allDay ? DAY : HOUR);
        const end = event.endMs > ms ? event.endMs : minEnd;
        write({ start: isoMinuteOf(new Date(ms)), end: isoMinuteOf(new Date(end)) });
    };
    const setEnd = (ms: number) => {
        const end = ms > event.startMs ? ms : event.startMs + (event.allDay ? DAY : HOUR);
        write({ end: isoMinuteOf(new Date(end)) });
    };

    const trash = () => { removeEvent(event.id); onClose?.(); };

    // 이 일정 하나만 .ics 로 내려받기(노드 「내보내기」의 일정 단위 — 파일 이름은 제목).
    const exportIcs = () => {
        const w = collectEventForExport(event.id);
        if (w) downloadText(`${title.trim() || event.name || '일정'}.ics`, writeIcs([w]));
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
                <input
                    ref={titleRef}
                    value={title}
                    placeholder="새 일정"
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={commitTitle}
                    onKeyDown={onTitleKey}
                    className={`flex-1 rounded border border-line bg-bg px-2 py-1 text-[13px] font-medium text-text focus:border-accent outline-none`}
                />
                {onClose && (<button type="button" aria-label="닫기" onClick={onClose} className="shrink-0 grid place-items-center w-6 h-6 rounded text-muted hover:text-text hover:bg-text/[0.06]">
                    <Icon name="x" size={14} />
                </button>)}
            </div>

            <label className="flex items-center justify-between">
                <span className={LABEL}>종일</span>
                <Toggle on={event.allDay} onToggle={setAllDay} label="종일" />
            </label>

            <label className="flex flex-col gap-0.5">
                <span className={LABEL}>시작</span>
                {event.allDay ? (
                    <DateField value={toDate(event.startMs)} onChange={(v) => { const d = parseLocal(v); if (!Number.isNaN(d.getTime())) setStart(d.getTime()); }} className={INPUT} />
                ) : (
                    <DateField time value={toDateTime(event.startMs)} onChange={(v) => { const d = parseLocal(v); if (!Number.isNaN(d.getTime())) setStart(d.getTime()); }} className={INPUT} />
                )}
            </label>

            <label className="flex flex-col gap-0.5">
                <span className={LABEL}>끝</span>
                {event.allDay ? (
                    // 종일 끝은 「포함하는 마지막 날」로 보이고(끝−1), 저장은 그 다음날 자정(반열린)
                    <DateField value={toDate(event.endMs - 60_000)} onChange={(v) => { const d = parseLocal(v); if (!Number.isNaN(d.getTime())) setEnd(d.getTime() + DAY); }} className={INPUT} />
                ) : (
                    <DateField time value={toDateTime(event.endMs)} onChange={(v) => { const d = parseLocal(v); if (!Number.isNaN(d.getTime())) setEnd(d.getTime()); }} className={INPUT} />
                )}
            </label>

            <label className="flex flex-col gap-0.5">
                <span className={LABEL}>저장소</span>
                <select value={event.storeId} onChange={(e) => moveEvent(event.id, e.target.value)} className={INPUT}>
                    {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
            </label>

            <label className="flex flex-col gap-0.5">
                <span className={LABEL}>메모</span>
                <textarea
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    onBlur={() => write({ memo })}
                    rows={2}
                    className={`${INPUT} resize-none`}
                />
            </label>

            <div className="flex gap-2">
                <button type="button" onClick={exportIcs} className="flex flex-1 items-center justify-center gap-1 rounded border border-line py-1 text-[12px] text-muted hover:text-text hover:bg-text/[0.06]">
                    <Icon name="download" size={13} /> 내보내기
                </button>
                <button type="button" onClick={trash} className="flex flex-1 items-center justify-center gap-1 rounded border border-line py-1 text-[12px] text-bad hover:bg-bad/[0.1]">
                    <Icon name="trash" size={13} /> 휴지통
                </button>
            </div>
        </div>
    );
}
