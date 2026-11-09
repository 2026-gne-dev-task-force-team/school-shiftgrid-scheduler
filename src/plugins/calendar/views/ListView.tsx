/**
 * 「일정」 표 모드 — 일정 목록을 날짜순 표로(쥔님 2026-11-01 22:17 *"일정은 일정 목록들 그대로 보는거 표나 리스트로"*).
 *   열: 날짜 · 시간(종일이면 「종일」) · 제목 · 저장소. 머리에 검색 상자(제목·메모) + 「새 일정」(오늘 종일).
 *   줄을 누르면 그 날로 anchor 를 옮기고 인라인 카드를 연다. 정렬·검색은 events.ts 순수 함수.
 */
import { CalBar } from './CalBar';
import { useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { EmptyState, Icon, isoOf, type PeekHandle } from '../../../pane-ui-system';
import { useCalendarData } from '../useEvents';
import { sortEvents, filterEvents, hhmm, isoMinuteOf, type CalEvent } from '../events';
import { createEvent, renameEvent, removeEvent } from '../nodes';
import type { PluginHost } from '../../../pane-ui-system/plugin';
// 🔴 import type 만 — 레코드 뷰 약속 타입은 레코드 뷰 꾸러미 contracts 에서(값은 host.modules.use).
import type { RecordViewApi, RecordField } from '../../collection/contracts/collection';
import { paletteAt } from '../palette';
import { useCardPeek } from './useCardPeek';
import { useRangeSelect, type RangeHit } from './useRangeSelect';
import { daysSelection, dayInSelection, type CalSelection } from '../selection';

const WD = ['일', '월', '화', '수', '목', '금', '토'];
const DAY_MS = 86_400_000;

function dateLabel(ms: number): string {
    const d = new Date(ms);
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`;
}
/** 일정 시작의 날 iso — 줄의 data-day(범위 선택이 이 날을 고른다). */
function dayIso(ms: number): string {
    const d = new Date(ms);
    return isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
function timeLabel(e: CalEvent): string {
    return e.allDay ? '종일' : `${hhmm(e.startMs)}–${hhmm(e.endMs)}`;
}

// 레코드 뷰 칸 — 날짜·시간·제목·저장소. 제목만 고친다(자기 일정만) · 날짜·시간은 카드에서.
const RV_FIELDS: RecordField[] = [
    { key: 'date', label: '날짜', type: 'date', readOnly: true },
    { key: 'time', label: '시간', type: 'text', readOnly: true },
    { key: 'title', label: '제목', type: 'text' },
    { key: 'store', label: '저장소', type: 'text', readOnly: true },
];
type RvRow = { id: string; date: { start: string }; time: string; title: string; store: string };

export function ListView({ value, onChange, trailing, peek, selection, onSelect, host }: { value: Date; onChange: (d: Date) => void; trailing?: ReactNode; peek: PeekHandle; selection: CalSelection; onSelect: (s: CalSelection) => void; host?: PluginHost }) {
    const rv = host?.modules.use<RecordViewApi>('collection') ?? null;
    const { events, stores } = useCalendarData();
    const [query, setQuery] = useState('');
    // 🔴 일정 카드는 창틀의 미리보기(peek)에 띄운다 — 뷰 안 고정 패널이 아니다(EventCardPeek 가 담는다).
    const card = useCardPeek(peek);

    const rows = useMemo(() => sortEvents(filterEvents(events, query)), [events, query]);

    // 범위 선택 — 줄(일정)의 「날」을 고른다. 끌면 지나간 줄들의 날 min~max. 줄 클릭은 peek 도 연다(공존).
    const selAnchor = useRef<string | null>(null);
    const resolveRow = (x: number, y: number): RangeHit<string> => {
        const el = document.elementFromPoint(x, y) as HTMLElement | null;
        if (!el) return { value: null, onEvent: false };
        return { value: el.closest('[data-day]')?.getAttribute('data-day') ?? null, onEvent: false };
    };
    const range = useRangeSelect<string>({
        resolve: resolveRow,
        onSet: (iso, shift) => {
            if (shift) {
                const a = selAnchor.current ?? (selection?.kind === 'days' ? selection.from : iso);
                selAnchor.current = a;
                onSelect(daysSelection(a, iso));
            } else {
                selAnchor.current = iso;
                onSelect(daysSelection(iso, iso));
            }
        },
        onExtend: (iso) => onSelect(daysSelection(selAnchor.current ?? iso, iso)),
    });

    const newEvent = () => {
        const base = new Date(value.getFullYear(), value.getMonth(), value.getDate());
        const id = createEvent({ start: isoMinuteOf(base), end: isoMinuteOf(new Date(base.getTime() + DAY_MS)), allDay: true }, '');
        if (id) card.open(id);
    };
    const openRow = (e: CalEvent) => {
        onChange(new Date(e.startMs));   // anchor 를 그 날로 — 다른 뷰로 가도 그 날이 보인다
        card.open(e.id);
    };
    const onSearchKey = (ev: KeyboardEvent<HTMLInputElement>) => { if (ev.key === 'Escape') setQuery(''); };

    return (
        <div className="relative h-full flex flex-col bg-bg">
            {/* 머리줄 — 검색 + 「새 일정」 + 전환 단추(trailing) */}
            <CalBar end={<>{trailing}
                </>}>
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="flex items-center gap-1 rounded border border-line px-2 h-btn min-w-0 flex-1 max-w-xs">
                        <Icon name="search" size={13} className="text-muted shrink-0" />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={onSearchKey}
                            placeholder="제목·메모 검색"
                            className="min-w-0 flex-1 bg-transparent text-[12px] text-text outline-none"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={newEvent}
                        className="flex items-center gap-1 shrink-0 px-2 h-btn rounded text-[12px] text-muted hover:text-text hover:bg-text/[0.06] transition-colors"
                    >
                        <Icon name="plus" size={13} /> 새 일정
                    </button>
                </div>
            </CalBar>

            {/* 🔴 레코드 뷰가 있으면 그 목록 화면으로(쥔님 2026-11-09) — 줄 열기(→)는 일정 카드 미리보기 · 검색은 위 상자가 거른다 */}
            {rv ? (
                <div className="flex-1 min-h-0 flex flex-col border-t border-line">
                    <rv.RecordView<RvRow>
                        fields={RV_FIELDS}
                        records={rows.map((e) => ({ id: e.id, date: { start: dayIso(e.startMs) }, time: timeLabel(e), title: e.name || '', store: stores.get(e.storeId)?.name ?? e.foreign?.sourceLabel ?? '' }))}
                        getId={(r) => r.id}
                        viewKey="calendar.list"
                        titleKey="title"
                        onCellChange={(id, key, v) => { const ev = rows.find((x) => x.id === id); if (key === 'title' && ev && !ev.foreign) renameEvent(id, String(v ?? '').trim()); }}
                        onAddRecord={newEvent}
                        onDeleteRecords={(ids) => ids.forEach((id) => { if (!rows.find((x) => x.id === id)?.foreign) removeEvent(id); })}
                        onOpenRecord={(id) => { const ev = rows.find((x) => x.id === id); if (ev) openRow(ev); }}
                        className="flex-1 min-h-0"
                    />
                </div>
            ) : (
            /* 표 — 날짜·시간·제목·저장소(레코드 뷰가 꺼져 있을 때) */
            <div className="flex-1 min-h-0 overflow-auto border-t border-line" {...range.bind}>
                {rows.length === 0 ? (
                    <EmptyState compact icon="calendar" title={query ? '찾는 일정이 없다' : '일정이 없다'} description={query ? undefined : '「새 일정」이나 달력 칸 더블클릭으로'} />
                ) : (
                    <table className="w-full text-[12px] text-text border-collapse">
                        <thead className="sticky top-0 bg-bg">
                            <tr className="text-muted text-left">
                                <th className="font-medium px-3 py-1.5 border-b border-line w-36">날짜</th>
                                <th className="font-medium px-3 py-1.5 border-b border-line w-28">시간</th>
                                <th className="font-medium px-3 py-1.5 border-b border-line">제목</th>
                                <th className="font-medium px-3 py-1.5 border-b border-line w-32">저장소</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((e) => {
                                const store = stores.get(e.storeId);
                                const iso = dayIso(e.startMs);
                                const selected = dayInSelection(selection, iso);
                                return (
                                    <tr key={e.id} data-day={iso} onClick={() => openRow(e)} className={`cursor-pointer ${selected ? 'bg-accent/[0.12]' : 'hover:bg-text/[0.04]'}`}>
                                        <td className="px-3 py-1.5 border-b border-line tabular-nums whitespace-nowrap">{dateLabel(e.startMs)}</td>
                                        <td className="px-3 py-1.5 border-b border-line tabular-nums text-muted whitespace-nowrap">{timeLabel(e)}</td>
                                        <td className="px-3 py-1.5 border-b border-line truncate">{e.name || <span className="opacity-60">제목 없음</span>}</td>
                                        <td className="px-3 py-1.5 border-b border-line">
                                            <span className="flex items-center gap-1.5 min-w-0">
                                                <span className={`shrink-0 w-2 h-2 rounded-full ${paletteAt(e.colorIdx).dot}`} />
                                                <span className="truncate text-muted">{store?.name ?? e.foreign?.sourceLabel ?? '—'}</span>
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
            )}
        </div>
    );
}
