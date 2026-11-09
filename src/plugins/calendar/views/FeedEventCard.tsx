/**
 * 남의 일정 카드 — 다른 플러그인이 꽂은 출처 항목을 눌렀을 때 뜬다(요구명세 「달력은 뷰를 빌려준다」).
 *   · 출처에 editor 가 있으면 그 편집 화면을 이 자리에 그대로 렌더(item·onClose 를 넘긴다) — 남의 일정도 여기서 편집된다.
 *   · 없으면 **읽기 전용** 카드 — 제목·시각·메모·출처 이름만. ⛔ 자기 일정 편집 코드(nodes)엔 닿지 않는다.
 *   🔴 자리·테두리는 창틀 미리보기(peek)가 쥔다 — 여긴 세로 폼만. 🔴 색은 토큰만.
 */
import { Icon } from '../../../pane-ui-system';
import { hhmm, type CalEvent } from '../events';
import { getFeedSource } from '../feed';

const WD = ['일', '월', '화', '수', '목', '금', '토'];
const LABEL = 'text-[11px] text-muted';

function dateLabel(ms: number): string {
    const d = new Date(ms);
    return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. (${WD[d.getDay()]})`;
}

/** 읽기 전용 시각 한 줄 — 종일이면 날짜만, 아니면 날짜 + 시각 범위. */
function whenLabel(e: CalEvent): string {
    if (e.allDay) {
        const start = dateLabel(e.startMs);
        const endIncl = dateLabel(e.endMs - 60_000);   // 종일 끝은 포함하는 마지막 날
        return start === endIncl ? `${start} · 종일` : `${start} ~ ${endIncl} · 종일`;
    }
    const sameDay = dateLabel(e.startMs) === dateLabel(e.endMs);
    return sameDay
        ? `${dateLabel(e.startMs)} ${hhmm(e.startMs)}–${hhmm(e.endMs)}`
        : `${dateLabel(e.startMs)} ${hhmm(e.startMs)} ~ ${dateLabel(e.endMs)} ${hhmm(e.endMs)}`;
}

export function FeedEventCard({ event, onClose }: { event: CalEvent; onClose: () => void }) {
    const ref = event.foreign;
    if (!ref) return null;                               // 자기 일정이면 여기 안 온다(EventCardPeek 가 가른다)

    // 출처에 편집 화면이 있으면 그걸 이 자리에 — 남의 일정도 그 화면으로 편집한다.
    const source = getFeedSource(ref.sourceId);
    const Editor = source?.editor;
    if (Editor) return <Editor item={ref.item} onClose={onClose} />;

    // 없으면 읽기 전용 카드.
    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-text break-words">{event.name || '(제목 없음)'}</div>
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
                        <Icon name="calendar" size={11} className="shrink-0" />
                        <span className="truncate">{ref.sourceLabel}</span>
                        <span className="shrink-0">· 읽기 전용</span>
                    </div>
                </div>
                <button type="button" aria-label="닫기" onClick={onClose} className="hit-44 relative shrink-0 grid place-items-center w-6 h-6 rounded text-muted hover:text-text hover:bg-text/[0.06]">
                    <Icon name="x" size={14} />
                </button>
            </div>

            <div className="flex flex-col gap-0.5">
                <span className={LABEL}>때</span>
                <span className="text-[12px] text-text tabular-nums">{whenLabel(event)}</span>
            </div>

            {event.memo && (
                <div className="flex flex-col gap-0.5">
                    <span className={LABEL}>메모</span>
                    <span className="text-[12px] text-text whitespace-pre-wrap break-words">{event.memo}</span>
                </div>
            )}
        </div>
    );
}
