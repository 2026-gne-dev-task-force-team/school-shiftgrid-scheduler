/**
 * 반복 일정 조작(C2c-2) — 일정 열기 페이지(EventCardPeek)의 속성 밑에 단다.
 *   RecurField : 「반복」 칸 — 규칙 일정(또는 반복 아닌 일정)에서만 규칙을 고친다. 고칠 때마다 setRecur 로 바로 쓴다.
 *   OccActions : 회차 카드 단추 — 하루 당기기·미루기 · 빠뜨리기 · (더보기) 이후 전부 바꾸기 · 시리즈 열기.
 */
import { useState } from 'react';
import { Button, Icon, IconButton, MenuItem, MenuList, Popover, Select, TextInput } from '../../../pane-ui-system';
import type { RecurRule } from '../recur';
import type { Occurrence } from '../contracts/calendar';
import { parseLocal } from '../events';
import { nudge, setRecur, splitSeries } from '../series';
import { removeEvent } from '../nodes';

const WD = ['일', '월', '화', '수', '목', '금', '토'];
const UNIT = { daily: '일', weekly: '주', monthly: '개월', yearly: '년' } as const;
const NTH = ['첫째', '둘째', '셋째', '넷째', '다섯째'];
const LABEL = 'text-note text-muted';
const p2 = (n: number) => String(n).padStart(2, '0');
const wdOptions = WD.map((w, i) => ({ value: String(i), label: `${w}요일` }));

/** 숫자 칸 — 1 이상 정수일 때만 쓴다. shortcut: 비제어(defaultValue)라 되돌리기로 값이 바뀌어도 칸은 안 따라간다 — 거슬리면 제어 칸 + 확정(onBlur)으로. */
function NumField({ value, onCommit, label, max }: { value: number; onCommit: (n: number) => void; label: string; max?: number }) {
    return (
        <TextInput type="number" min={1} max={max} aria-label={label} defaultValue={value} className="w-16"
            onChange={(e) => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && (!max || n <= max)) onCommit(n); }} />
    );
}

export function RecurField({ eventId, rule, start }: { eventId: string; rule: RecurRule | undefined; start: string }) {
    const d0 = parseLocal(start);
    const wd = d0.getDay(), day = d0.getDate();
    const set = (patch: Partial<RecurRule>) => {
        const r = { ...rule, ...patch } as RecurRule & Record<string, unknown>;
        for (const k of Object.keys(r)) if (r[k] === undefined) delete r[k];
        setRecur(eventId, r);
    };
    const mMode = rule?.nth ? (rule.nth.n === -1 ? 'last' : 'nth') : 'day';
    const endMode = rule?.count !== undefined ? 'count' : rule?.until ? 'until' : 'none';

    return (
        <div className="flex flex-col gap-1" data-cal-recur>
            <span className={LABEL}>반복</span>
            <div className="flex flex-wrap items-center gap-1">
                <Select aria-label="반복" value={rule?.freq ?? 'none'} options={[
                    { value: 'none', label: '반복 안 함' }, { value: 'daily', label: '매일' }, { value: 'weekly', label: '매주' },
                    { value: 'monthly', label: '매월' }, { value: 'yearly', label: '매년' },
                ]} onChange={(e) => {
                    const f = e.target.value;
                    if (f === 'none') { setRecur(eventId, null); return; }
                    set({ freq: f as RecurRule['freq'], weekdays: f === 'weekly' ? [wd] : undefined, monthDay: undefined, nth: undefined });
                }} />
                {rule && <>
                    <NumField label="간격" value={rule.interval ?? 1} onCommit={(n) => set({ interval: n > 1 ? n : undefined })} />
                    <span className="text-small text-muted">{UNIT[rule.freq]}마다</span>
                </>}
            </div>
            {rule?.freq === 'weekly' && (
                <div className="flex flex-wrap gap-1">
                    {WD.map((w, i) => {
                        const cur = rule.weekdays?.length ? rule.weekdays : [wd];
                        const on = cur.includes(i);
                        return <Button key={i} size="sm" variant={on ? 'accent' : 'ghost'} aria-pressed={on}
                            onClick={() => { const next = on ? cur.filter((x) => x !== i) : [...cur, i].sort(); if (next.length) set({ weekdays: next }); }}>{w}</Button>;
                    })}
                </div>
            )}
            {rule?.freq === 'monthly' && (
                <div className="flex flex-wrap items-center gap-1">
                    <Select aria-label="매월 기준" value={mMode} options={[{ value: 'day', label: '날짜' }, { value: 'nth', label: 'N째 요일' }, { value: 'last', label: '마지막 요일' }]}
                        onChange={(e) => {
                            const m = e.target.value;
                            set(m === 'day' ? { monthDay: day, nth: undefined } : { monthDay: undefined, nth: { n: m === 'last' ? -1 : Math.ceil(day / 7), weekday: wd } });
                        }} />
                    {mMode === 'day' && <><NumField label="날짜" max={31} value={rule.monthDay && rule.monthDay > 0 ? rule.monthDay : day} onCommit={(n) => set({ monthDay: n })} /><span className="text-small text-muted">일</span></>}
                    {mMode === 'nth' && <Select aria-label="몇째" value={String(rule.nth!.n)} options={NTH.map((l, i) => ({ value: String(i + 1), label: l }))}
                        onChange={(e) => set({ nth: { ...rule.nth!, n: Number(e.target.value) } })} />}
                    {rule.nth && <Select aria-label="요일" value={String(rule.nth.weekday)} options={wdOptions}
                        onChange={(e) => set({ nth: { ...rule.nth!, weekday: Number(e.target.value) } })} />}
                </div>
            )}
            {rule && (
                <div className="flex flex-wrap items-center gap-1">
                    <span className="text-small text-muted">끝</span>
                    <Select aria-label="끝" value={endMode} options={[{ value: 'none', label: '없음' }, { value: 'count', label: '횟수' }, { value: 'until', label: '날짜' }]}
                        onChange={(e) => {
                            const m = e.target.value;
                            const later = new Date(d0.getFullYear(), d0.getMonth() + 3, d0.getDate());
                            set(m === 'count' ? { count: 10, until: undefined }
                                : m === 'until' ? { count: undefined, until: `${later.getFullYear()}-${p2(later.getMonth() + 1)}-${p2(later.getDate())}` }
                                    : { count: undefined, until: undefined });
                        }} />
                    {endMode === 'count' && <><NumField label="횟수" value={rule.count!} onCommit={(n) => set({ count: n })} /><span className="text-small text-muted">번</span></>}
                    {endMode === 'until' && <TextInput type="date" aria-label="끝 날짜" value={rule.until!.slice(0, 10)} onChange={(e) => { if (e.target.value) set({ until: e.target.value }); }} />}
                </div>
            )}
        </div>
    );
}

/** 회차 카드 단추 — chipId 는 보기의 일정 id(가상이면 `규칙id@원래시작`). onOpen 으로 카드가 다른 일정(실체·새 규칙·규칙 일정)으로 갈아탄다. */
export function OccActions({ chipId, occ, onOpen }: { chipId: string; occ: Occurrence; onOpen: (id: string) => void }) {
    const [anchor, setAnchor] = useState<DOMRect | null>(null);
    const go = (id: string) => { if (id) onOpen(id); };
    return (
        <div className="flex flex-wrap items-center gap-1" data-cal-occ>
            <Button size="sm" data-cal-occ-act="earlier" onClick={() => go(nudge(occ, -1))}><Icon name="left" size={13} /> 하루 당기기</Button>
            <Button size="sm" data-cal-occ-act="later" onClick={() => go(nudge(occ, 1))}><Icon name="right" size={13} /> 하루 미루기</Button>
            <Button size="sm" data-cal-occ-act="skip" onClick={() => removeEvent(chipId)}><Icon name="ban" size={13} /> 이 회차 빠뜨리기</Button>
            <IconButton icon="dots" label="더보기" onClick={(e) => setAnchor((e.currentTarget as HTMLElement).getBoundingClientRect())} />
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
