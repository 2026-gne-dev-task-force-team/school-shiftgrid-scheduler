/**
 * 날짜 패턴 편집기 — 날짜 칸 값의 pattern(DatePattern)을 고친다. 제어형: 고칠 때마다 onChange(새 패턴) · 「패턴 풀기」는 onChange(null).
 *   위: 요약 한 줄 · 가운데: 규칙 줄들(프리셋 + 그 꼴의 칸 + 간격·끝) · 미니 달력(날 누르기 = 빼기/더하기 토글) · 아래: 기간 빼기 줄들.
 *   🔴 공용 부품만(Button·IconButton·Select·TextInput). 도메인은 모른다 — 달력·속성 패널이 이 부품을 그대로 끼운다.
 */
import { useEffect, useState } from 'react';
import { Button, IconButton, Select, TextInput, monthGrid, monthLabel, shiftMonth } from '../../../pane-ui-system';
import { expandPattern, patternSummary, type DatePattern, type RecurRule } from '../../../pane-ui-system/date-pattern';

const WD = ['일', '월', '화', '수', '목', '금', '토'];
const UNIT = { daily: '일', weekly: '주', monthly: '개월', yearly: '년' } as const;
const PRESETS = [
    { value: 'daily', label: '매일' }, { value: 'weekdays', label: '평일(월~금)' }, { value: 'weekly', label: '매주' },
    { value: 'monthDay', label: '매월 같은 날' }, { value: 'monthNth', label: '매월 같은 째 요일' }, { value: 'monthLast', label: '매월 말일' },
    { value: 'yearly', label: '매년' },
];
type Preset = 'daily' | 'weekdays' | 'weekly' | 'monthDay' | 'monthNth' | 'monthLast' | 'yearly';
const NTH = [1, 2, 3, 4, 5, -1].map((n) => ({ value: String(n), label: n < 0 ? '마지막' : `${['첫', '둘', '셋', '넷', '다섯'][n - 1]}째` }));
const wdOptions = WD.map((w, i) => ({ value: String(i), label: `${w}요일` }));
/** 프리셋 이름 — 「매월 ○일」 꼴은 시작 날짜로 채운다(날짜가 없으면 자연어 그대로). */
function presetsFor(start: string) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(start)) return PRESETS;
    const d0 = utc(start), day = d0.getUTCDate(), n = Math.min(5, Math.ceil(day / 7));
    const label: Record<string, string> = { monthDay: `매월 ${day}일`, monthNth: `매월 ${NTH[n - 1].label} ${WD[d0.getUTCDay()]}요일` };
    return PRESETS.map((o) => (label[o.value] ? { ...o, label: label[o.value] } : o));
}
const p2 = (n: number) => String(n).padStart(2, '0');
const isoUTC = (d: Date) => `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
const utc = (s: string) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)));

function presetOf(r: RecurRule): Preset {
    if (r.freq === 'weekly') return [...(r.weekdays ?? [])].sort().join() === '1,2,3,4,5' ? 'weekdays' : 'weekly';
    if (r.freq === 'monthly') return r.nth ? 'monthNth' : r.monthDay === -1 ? 'monthLast' : 'monthDay';
    return r.freq;
}

/** 프리셋 → 규칙 꼴. 간격·끝은 바뀌어도 지킨다. 기본 요일·날은 시작일에서. */
function ruleFor(p: Preset, start: string, keep: RecurRule): RecurRule {
    const d0 = utc(start), wd = d0.getUTCDay(), day = d0.getUTCDate();
    const base: RecurRule =
        p === 'weekdays' ? { freq: 'weekly', weekdays: [1, 2, 3, 4, 5] }
            : p === 'weekly' ? { freq: 'weekly', weekdays: [wd] }
                : p === 'monthDay' ? { freq: 'monthly', monthDay: day }
                    : p === 'monthNth' ? { freq: 'monthly', nth: { n: Math.min(5, Math.ceil(day / 7)), weekday: wd } }
                        : p === 'monthLast' ? { freq: 'monthly', monthDay: -1 }
                            : { freq: p };
    return clean({ ...base, interval: keep.interval, count: keep.count, until: keep.until });
}

/** undefined 칸은 지운다(저장 JSON 을 깨끗하게). */
function clean(r: RecurRule): RecurRule {
    const o = { ...r } as Record<string, unknown>;
    for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
    return o as unknown as RecurRule;
}

/** 숫자 칸(제어형) — 바깥 값이 바뀌면 따라가고, 정수면 1~max 로 가둬 알린다 · 빈 값·0·음수는 칸을 떠날 때 저장된 값으로 되돌린다. */
function NumField({ value, onCommit, label, max }: { value: number; onCommit: (n: number) => void; label: string; max?: number }) {
    const [text, setText] = useState(String(value));
    useEffect(() => { setText(String(value)); }, [value]);
    return (
        <TextInput type="number" min={1} max={max} aria-label={label} value={text} className="w-14"
            onChange={(e) => {
                setText(e.target.value);
                const n = Number(e.target.value);
                if (e.target.value !== '' && Number.isInteger(n)) onCommit(Math.min(max ?? Infinity, Math.max(1, n)));
            }}
            onBlur={() => setText(String(value))} />
    );
}

function RuleRow({ rule, start, onChange, onDelete }: { rule: RecurRule; start: string; onChange: (r: RecurRule) => void; onDelete: () => void }) {
    const preset = presetOf(rule);
    const set = (patch: Partial<RecurRule>) => onChange(clean({ ...rule, ...patch }));
    const endMode = rule.count !== undefined ? 'count' : rule.until ? 'until' : 'none';
    const wds = rule.weekdays?.length ? rule.weekdays : [utc(start).getUTCDay()];
    return (
        <div data-pattern-rule className="flex flex-col gap-1 p-1 rounded bg-text/[0.04]">
            <div className="flex flex-wrap items-center gap-1">
                <Select aria-label="반복 꼴" value={preset} options={presetsFor(start)} onChange={(e) => onChange(ruleFor(e.target.value as Preset, start, rule))} />
                <IconButton icon="trash" label="규칙 지우기" onClick={onDelete} className="ml-auto" />
            </div>
            {preset === 'weekly' && (
                <div className="flex flex-wrap gap-0.5">
                    {WD.map((w, i) => {
                        const on = wds.includes(i);
                        return <Button key={i} size="sm" variant={on ? 'accent' : 'ghost'} aria-pressed={on}
                            onClick={() => { const next = on ? wds.filter((x) => x !== i) : [...wds, i].sort(); if (next.length) set({ weekdays: next }); }}>{w}</Button>;
                    })}
                </div>
            )}
            {preset === 'monthDay' && (
                <div className="flex items-center gap-1">
                    <NumField label="날짜" max={31} value={rule.monthDay && rule.monthDay > 0 ? rule.monthDay : utc(start).getUTCDate()} onCommit={(n) => set({ monthDay: n })} />
                    <span className="text-small text-muted">일</span>
                </div>
            )}
            {rule.nth && (
                <div className="flex items-center gap-1">
                    <Select aria-label="몇째" value={String(rule.nth.n)} options={NTH} onChange={(e) => set({ nth: { ...rule.nth!, n: Number(e.target.value) } })} />
                    <Select aria-label="요일" value={String(rule.nth.weekday)} options={wdOptions} onChange={(e) => set({ nth: { ...rule.nth!, weekday: Number(e.target.value) } })} />
                </div>
            )}
            <div className="flex flex-wrap items-center gap-1 text-small text-muted">
                <NumField label="간격" value={rule.interval ?? 1} onCommit={(n) => set({ interval: n > 1 ? n : undefined })} />
                <span>{UNIT[rule.freq]}마다 · 끝</span>
                <Select aria-label="끝" value={endMode} options={[{ value: 'none', label: '없음' }, { value: 'count', label: '횟수' }, { value: 'until', label: '날짜' }]}
                    onChange={(e) => {
                        const m = e.target.value;
                        const later = utc(start); later.setUTCMonth(later.getUTCMonth() + 3);
                        set(m === 'count' ? { count: 10, until: undefined } : m === 'until' ? { count: undefined, until: isoUTC(later) } : { count: undefined, until: undefined });
                    }} />
                {endMode === 'count' && <><NumField label="횟수" value={rule.count!} onCommit={(n) => set({ count: n })} /><span>번</span></>}
                {endMode === 'until' && <TextInput type="date" aria-label="끝 날짜" value={rule.until!.slice(0, 10)} onChange={(e) => { if (e.target.value) set({ until: e.target.value }); }} />}
            </div>
        </div>
    );
}

/** 미니 달력 날 누르기 — 빠진 날·더한 날이면 되돌리고, 규칙 회차면 빼고, 아무것도 아니면 더한다. */
function toggleDay(p: DatePattern, d: string, ruleDays: ReadonlySet<string>): DatePattern {
    const ex = p.exdates ?? [], rd = p.rdates ?? [];
    const tidy = (q: DatePattern): DatePattern => {
        const o = { ...q };
        if (!o.exdates?.length) delete o.exdates;
        if (!o.rdates?.length) delete o.rdates;
        return o;
    };
    if (ex.includes(d)) return tidy({ ...p, exdates: ex.filter((x) => x !== d) });
    if (rd.includes(d)) return tidy({ ...p, rdates: rd.filter((x) => x !== d) });
    if (ruleDays.has(d)) return { ...p, exdates: [...ex, d].sort() };
    return { ...p, rdates: [...rd, d].sort() };
}

/** 옮긴 회차 — 원래 날(from) → 지금 날(to). 미니 달력이 지금 날에 진한 점, 원래 날에 빈 점(「옮김」)을 찍는다. */
type MovedOcc = { from: string; to: string };

function MiniMonth({ value, start, onChange, realStarts, moved, focus }: { value: DatePattern; start: string; onChange: (p: DatePattern) => void; realStarts?: readonly string[]; moved?: readonly MovedOcc[]; focus?: string }) {
    const f0 = (focus ?? start).slice(0, 10);
    const [ym, setYm] = useState<[number, number]>([+f0.slice(0, 4), +f0.slice(5, 7)]);
    const cells = monthGrid(ym[0], ym[1]);
    const from = cells[0].iso, last = utc(cells[cells.length - 1].iso);
    last.setUTCDate(last.getUTCDate() + 1);
    const to = isoUTC(last);
    const shown = new Set(expandPattern(value, start, from, to).map((s) => s.slice(0, 10)));
    const ruleDays = new Set(expandPattern({ rules: value.rules }, start, from, to).map((s) => s.slice(0, 10)));
    const movedFrom = new Map((moved ?? []).map((m) => [m.from.slice(0, 10), m.to.slice(0, 10)]));
    const real = new Set([...(realStarts ?? []).map((s) => s.slice(0, 10)).filter((d) => !movedFrom.has(d)), ...(moved ?? []).map((m) => m.to.slice(0, 10))]);
    const ex = new Set(value.exdates ?? []), added = new Set(value.rdates ?? []);
    const inExcept = (d: string) => (value.except ?? []).some((e) => d >= e.from.slice(0, 10) && d <= e.to.slice(0, 10));
    return (
        <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1">
                <IconButton icon="left" label="이전 달" onClick={() => setYm(shiftMonth(ym[0], ym[1], -1))} />
                <span className="flex-1 text-center text-small" data-pattern-month>{monthLabel(ym[0], ym[1])}</span>
                <IconButton icon="right" label="다음 달" onClick={() => setYm(shiftMonth(ym[0], ym[1], 1))} />
            </div>
            <div className="grid grid-cols-7 text-center text-note text-muted">{WD.map((w) => <span key={w}>{w}</span>)}</div>
            <div className="grid grid-cols-7">
                {cells.map((c) => {
                    const on = shown.has(c.iso), isReal = real.has(c.iso), off = ex.has(c.iso), plus = added.has(c.iso), away = movedFrom.get(c.iso);
                    return (
                        <Button key={c.iso} variant="plain" size="sm" data-pattern-day={c.iso} aria-pressed={on}
                            aria-label={`${c.m}월 ${c.d}일${plus ? ' · 더한 날' : on ? ' · 반복 날' : ''}${off ? ' · 빠진 날' : ''}${away ? ` · ${+away.slice(5, 7)}월 ${+away.slice(8, 10)}일로 옮김` : isReal && !on ? ' · 옮겨 온 회차' : ''}`}
                            onClick={() => onChange(toggleDay(value, c.iso, ruleDays))}
                            className={`relative !h-7 !px-0 flex-col !gap-0 tabular-nums ${c.inMonth ? '' : 'opacity-40'} ${off ? 'line-through text-muted' : ''}
                                ${inExcept(c.iso) ? 'bg-text/[0.06]' : ''} ${c.iso === focus?.slice(0, 10) ? '!border-accent' : ''}`}>
                            <span>{c.d}</span>
                            {plus
                                ? <span data-pattern-added title="더한 날" className="leading-none text-note text-accent">＋</span>
                                : away
                                    ? <span data-pattern-moved title={`옮김 → ${+away.slice(5, 7)}/${+away.slice(8, 10)}`} className="w-1 h-1 rounded-full border border-accent" />
                                    : <span className={`w-1 h-1 rounded-full ${isReal ? 'bg-accent' : on ? 'bg-accent/40' : 'bg-transparent'}`} />}
                        </Button>
                    );
                })}
            </div>
        </div>
    );
}

export function PatternEditor({ value, start, onChange, realStarts, moved, focus }: {
    value: DatePattern; start: string; onChange: (p: DatePattern | null) => void; realStarts?: readonly string[]; moved?: readonly MovedOcc[]; focus?: string;
}) {
    const setRules = (rules: RecurRule[]) => onChange({ ...value, rules });
    const except = value.except ?? [];
    const setExcept = (next: { from: string; to: string }[]) => {
        const o: DatePattern = { ...value, except: next };
        if (!next.length) delete o.except;
        onChange(o);
    };
    // 새 기간 빼기 줄은 초안 — 시작·끝을 둘 다 고르기 전엔 except 에 안 쓴다(기본값이 회차를 말없이 지우지 않게).
    const [drafts, setDrafts] = useState<{ id: number; from: string; to: string }[]>([]);
    const [nextId, setNextId] = useState(0);
    const setDraft = (id: number, patch: { from?: string; to?: string }) => {
        const d = { ...drafts.find((x) => x.id === id)!, ...patch };
        if (d.from && d.to) {
            setDrafts(drafts.filter((x) => x.id !== id));
            setExcept([...except, d.from <= d.to ? { from: d.from, to: d.to } : { from: d.to, to: d.from }]);
        } else setDrafts(drafts.map((x) => (x.id === id ? d : x)));
    };
    const exceptRow = (key: string, from: string, to: string, onFrom: (v: string) => void, onTo: (v: string) => void, onDrop: () => void, draft?: boolean) => (
        <div key={key} data-pattern-except={draft ? 'draft' : ''} className="flex flex-wrap items-center gap-1 text-small text-muted">
            <TextInput type="date" aria-label="빼기 시작 날짜" value={from} className="flex-1 min-w-0"
                onChange={(ev) => { if (ev.target.value) onFrom(ev.target.value); }} />
            <span>부터</span>
            <TextInput type="date" aria-label="빼기 끝 날짜" value={to} className="flex-1 min-w-0"
                onChange={(ev) => { if (ev.target.value) onTo(ev.target.value); }} />
            <span>까지</span>
            <IconButton icon="trash" label={draft ? '기간 빼기 초안 버리기' : '기간 빼기 지우기'} onClick={onDrop} />
        </div>
    );
    return (
        <div data-pattern-editor className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1">
                <span data-pattern-summary className="flex-1 min-w-0 truncate text-small">↻ {patternSummary(value, start)}</span>
                <Button size="sm" onClick={() => onChange(null)}>패턴 풀기</Button>
            </div>
            {value.rules.map((r, i) => (
                <RuleRow key={i} rule={r} start={start}
                    onChange={(nr) => setRules(value.rules.map((x, j) => (j === i ? nr : x)))}
                    onDelete={() => setRules(value.rules.filter((_, j) => j !== i))} />
            ))}
            <Button size="sm" data-pattern-add-rule className="self-start" onClick={() => setRules([...value.rules, { freq: 'weekly' }])}>+ 규칙</Button>
            <MiniMonth value={value} start={start} onChange={onChange} realStarts={realStarts} moved={moved} focus={focus} />
            <div className="text-note text-muted">날을 누르면 그날을 빼거나 더해요. 다시 누르면 되돌려요.</div>
            {except.map((e, i) => exceptRow(String(i), e.from, e.to,
                (v) => setExcept(except.map((x, j) => (j === i ? { ...x, from: v } : x))),
                (v) => setExcept(except.map((x, j) => (j === i ? { ...x, to: v } : x))),
                () => setExcept(except.filter((_, j) => j !== i))))}
            {drafts.map((d) => exceptRow(`d${d.id}`, d.from, d.to,
                (v) => setDraft(d.id, { from: v }), (v) => setDraft(d.id, { to: v }),
                () => setDrafts(drafts.filter((x) => x.id !== d.id)), true))}
            <Button size="sm" data-pattern-add-except className="self-start"
                onClick={() => { setDrafts([...drafts, { id: nextId, from: '', to: '' }]); setNextId(nextId + 1); }}>+ 기간 빼기</Button>
        </div>
    );
}
