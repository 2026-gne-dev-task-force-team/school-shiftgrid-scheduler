/**
 * 반복 일정 조작 — 일정 열기 페이지(EventCardPeek)·속성 패널(PatternPane)에 단다.
 *   SeriesPattern : 날짜 패턴 편집기(컬렉션 PatternEditor) — 그 일정(실체 회차면 그 시리즈)의 패턴을 고친다. 반복 아니면 「반복 만들기」.
 *   OccActions    : 회차 카드 단추 — 상태 줄(아직 그대로 / 원래 ○ → 옮김 + 원래대로) · 하루 당기기·미루기 · 빠뜨리기 · (더 보기) 이후 전부 바꾸기 · 시리즈 열기.
 */
import { useState, useSyncExternalStore } from 'react';
import { Button, Icon, IconButton, MenuItem, MenuList, Popover } from '../../../pane-ui-system';
import type { PluginHost, PropertiesPaneProps } from '../../../pane-ui-system/plugin';
import type { RecordViewApi } from '../../collection/contracts/collection';
import type { Occurrence } from '../contracts/calendar';
import { nudge, patternOf, restore, setPattern, splitSeries, type SeriesData } from '../series';
import { EVENT_TYPE, getEventNodes, getNodesApi, inTrash, removeEvent, subscribeNodes } from '../nodes';
import { storedToEvent } from '../event-fields';

const WD = '일월화수목금토';
/** 「11/16(월)」 */
const dayText = (s: string) => { const d = new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`; };

/**
 * 「날짜 패턴」 — eventId 가 실체 회차(seriesId 있음)면 그 시리즈를 고치고 focus 는 그 회차 원래 시작. focus 를 주면 그걸 쓴다(가상 회차 카드).
 *   realStarts = 그 시리즈의 실체 회차 원래 시작들(미니 달력에 진하게).
 */
export function SeriesPattern({ host, eventId, focus }: { host: PluginHost; eventId: string; focus?: string }) {
    useSyncExternalStore(subscribeNodes, getEventNodes);   // 패턴을 고치면 다시 그린다(속성 패널은 달력 구독이 없다)
    const api = getNodesApi();
    const own = (api?.get(eventId)?.data ?? {}) as SeriesData;
    const sid = own.seriesId && api?.get(own.seriesId) && !inTrash(own.seriesId) ? own.seriesId : eventId;
    const data = api?.get(sid)?.data, ev = storedToEvent(data), p = patternOf(data);
    const PatternEditor = host.modules.use<RecordViewApi>('collection')?.PatternEditor;
    if (!api || !ev || !PatternEditor) return null;
    if (!p) return <Button size="sm" className="self-start" data-cal-make-recur onClick={() => setPattern(sid, { rules: [{ freq: 'weekly' }] })}>반복 만들기</Button>;
    // 실체 회차면 강조는 지금 날(옮겼으면 옮겨 간 날)
    const f = focus ?? (sid !== eventId ? storedToEvent(own)?.start ?? own.originalStart : undefined);
    const realStarts: string[] = [], moved: { from: string; to: string }[] = [];
    for (const n of api.liveByType(EVENT_TYPE)) {
        const d = n.data as SeriesData | undefined, cur = storedToEvent(d)?.start;
        if (d?.seriesId !== sid || !d.originalStart) continue;
        realStarts.push(d.originalStart);
        if (cur && cur.slice(0, 10) !== d.originalStart.slice(0, 10)) moved.push({ from: d.originalStart, to: cur });
    }
    return (
        <div data-cal-pattern>
            <PatternEditor key={`${sid}|${f ?? ''}`} value={p} start={ev.allDay ? ev.start.slice(0, 10) : ev.start}
                onChange={(np) => setPattern(sid, np)} realStarts={realStarts} moved={moved} focus={f} />
        </div>
    );
}

/** 속성 패널 「날짜 패턴」 칸 — 일정 노드를 고르면(contributes.properties · target = EVENT_TYPE). */
export function PatternPane({ host, target }: PropertiesPaneProps) {
    return <SeriesPattern host={host} eventId={target.id} />;
}

/** 회차 카드 단추 — chipId 는 보기의 일정 id(가상이면 `규칙id@원래시작`). onOpen 으로 카드가 다른 일정(실체·새 규칙·규칙 일정)으로 갈아탄다. */
export function OccActions({ chipId, occ, onOpen }: { chipId: string; occ: Occurrence; onOpen: (id: string) => void }) {
    const [anchor, setAnchor] = useState<DOMRect | null>(null);
    const go = (id: string) => { if (id) onOpen(id); };
    const os = occ.originalStart;
    const moved = !occ.virtual && os && occ.start.slice(0, 10) !== os.slice(0, 10);
    return (
        <div className="flex flex-wrap items-center gap-1" data-cal-occ>
            <div className="basis-full text-small text-muted" data-cal-occ-state={occ.virtual ? 'ghost' : moved ? 'moved' : 'real'}>
                {occ.virtual ? '반복 회차(아직 그대로)' : moved ? `원래 ${dayText(os)} → 옮김` : '반복 회차(고친 회차)'}
                {moved && <Button size="sm" variant="ghost" className="ml-1" data-cal-occ-act="restore" onClick={() => go(restore(occ))}><Icon name="undo" size={13} /> 원래대로</Button>}
            </div>
            <Button size="sm" data-cal-occ-act="earlier" onClick={() => go(nudge(occ, -1))}><Icon name="left" size={13} /> 하루 당기기</Button>
            <Button size="sm" data-cal-occ-act="later" onClick={() => go(nudge(occ, 1))}><Icon name="right" size={13} /> 하루 미루기</Button>
            <Button size="sm" data-cal-occ-act="skip" onClick={() => removeEvent(chipId)}><Icon name="ban" size={13} /> 이 회차 빠뜨리기</Button>
            <IconButton icon="dots" label="더보기" title="더보기 — 이후 전부 바꾸기 · 시리즈 열기" onClick={(e) => setAnchor((e.currentTarget as HTMLElement).getBoundingClientRect())} />
            {anchor && (
                <Popover anchor={anchor} width={200} align="right" onClose={() => setAnchor(null)}>
                    <MenuList autoFocus label="회차 더보기">
                        <MenuItem icon="split" label="이후 전부 바꾸기" onSelect={() => { setAnchor(null); go(splitSeries(occ)); }} />
                        <MenuItem icon="calendar" label="시리즈 열기" onSelect={() => { setAnchor(null); go(occ.seriesId ?? ''); }} />
                    </MenuList>
                </Popover>
            )}
        </div>
    );
}
