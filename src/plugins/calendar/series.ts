/**
 * 반복 일정의 회차 모델(C2b) — 규칙 일정 = `calendar.event` + values.when.pattern(옛 data.recur 도 읽는다 · 쓸 때 옮긴다) · 가상 회차 = 저장 안 함(범위 안만 계산) ·
 *   실체 회차 = `calendar.event` + data.seriesId·data.originalStart(손댔을 때만 생긴다 — 🔴 자동 실체화 ⛔).
 *   계산은 recur/expand(순수), 쓰기는 NodesApi 하나로(nodes.ts 의 getNodesApi). 날짜는 전부 'YYYY-MM-DDTHH:mm'(종일은 'T00:00').
 */
import type { PublicNode } from '../../pane-ui-system/core/nodes/contracts/nodes';
import type { Occurrence } from './contracts/calendar';
import { expand, expandPattern, isPattern, ruleToPattern, type DatePattern, type RecurRule } from './recur';
import type { DateValue } from '../collection/contracts/collection';
import { EVENT_TYPE } from './config';
import { getNodesApi } from './nodes';
import { eventToStored, storedToEvent, type StoredEvent } from './event-fields';
import { isoMinuteOf, occId, parseLocal, type EventData } from './events';

/** 일정 노드 data — 레코드 꼴 + 반복 칸(규칙 일정은 values.when.pattern · 실체 회차는 seriesId·originalStart). */
export interface SeriesData extends StoredEvent {
    /** 옛 단일 규칙 — 읽기만(patternOf) · 쓸 때 values.when.pattern 으로 옮기고 지운다 */
    recur?: RecurRule;
    seriesId?: string;
    originalStart?: string;
}

const DAY = 86_400_000;
const dataOf = (n: PublicNode | undefined) => (n?.data ?? {}) as SeriesData;

/** 일정의 반복 패턴 — values.when.pattern 우선, 없으면 옛 data.recur 를 패턴으로. 반복이 아니면 undefined. */
export function patternOf(data: unknown): DatePattern | undefined {
    const d = (data ?? {}) as SeriesData;
    const p = (d.values?.when as DateValue | null | undefined)?.pattern;
    if (isPattern(p)) return p;
    return d.recur ? ruleToPattern(d.recur) : undefined;
}

/** data 의 values.when 에 패턴을 쓴다(null 이면 뗀다) — 옛 data.recur 는 만난 김에 지운다. */
function withPattern(d: SeriesData, p: DatePattern | null): SeriesData {
    const x = { ...d };
    delete x.recur;
    const w = x.values?.when;
    if (!w || typeof w !== 'object' || Array.isArray(w)) return x;
    const when: DateValue = { ...w };
    if (p) when.pattern = p; else delete when.pattern;
    x.values = { ...x.values, when };
    return x;
}
/** 'YYYY-MM-DD' 도 'YYYY-MM-DDTHH:mm' 로 — 문자열 비교가 곧 시각 비교가 되게. */
const norm = (s: string) => (s.length === 10 ? `${s}T00:00` : s.slice(0, 16));
const addDays = (s: string, n: number) => { const d = parseLocal(s); d.setDate(d.getDate() + n); return isoMinuteOf(d); };
/** 규칙 일정의 시작을 expand 가 먹는 꼴로(종일이면 날짜만). */
const ruleStart = (ev: EventData) => (ev.allDay ? ev.start.slice(0, 10) : ev.start);

/** 회차 시작 s 에 원 일정 길이를 더한 끝 — 종일은 날 수로 더해 서머타임에 안 흔들린다. */
function endFor(ev: EventData, s: string): string {
    const len = parseLocal(ev.end).getTime() - parseLocal(ev.start).getTime();
    return ev.allDay ? addDays(s, Math.round(len / DAY)) : isoMinuteOf(new Date(parseLocal(s).getTime() + len));
}

/** 그 회차의 살아 있는 실체 레코드(없으면 undefined). */
function findMaterialized(seriesId: string, originalStart: string): PublicNode | undefined {
    return getNodesApi()?.liveByType(EVENT_TYPE).find((n) => {
        const d = dataOf(n);
        return d.seriesId === seriesId && d.originalStart === originalStart;
    });
}

/** 저장소(+자손 저장소) 일정의 회차 — [from,to) 와 겹치는 것만 · 시작순(같으면 종일 먼저). 노드를 만들지 않는다. */
export function occurrences(storeId: string, from: string, to: string): Occurrence[] {
    const api = getNodesApi();
    if (!api) return [];
    const lo = norm(from), hi = norm(to);
    const hit = (s: string, e: string) => s < hi && e > lo;   // events.overlaps 와 같은 반열린 판정
    const out: Occurrence[] = [];
    const taken = new Set<string>();   // 실체가 대신하는 가상 자리 — 범위 밖으로 옮겨 갔어도 그 자리는 비운다
    const rules: [PublicNode, DatePattern, EventData][] = [];
    for (const n of api.liveByType(EVENT_TYPE)) {
        if (!api.path(n.id).includes(storeId)) continue;
        const d = dataOf(n), ev = storedToEvent(d);
        if (!ev) continue;
        if (d.seriesId && d.originalStart) taken.add(`${d.seriesId}|${d.originalStart}`);
        const p = patternOf(d);
        if (p) { rules.push([n, p, ev]); continue; }
        if (!hit(ev.start, ev.end)) continue;
        out.push({
            eventId: n.id, start: ev.start, end: ev.end, allDay: ev.allDay, virtual: false,
            ...(d.seriesId && d.originalStart ? { seriesId: d.seriesId, originalStart: d.originalStart } : {}),
        });
    }
    for (const [n, pat, ev] of rules) {
        // 범위 앞에서 시작해 걸쳐 들어오는 회차도 잡게 시작을 (길이 + 하루)만큼 당겨 편다 — 겹침은 아래서 정확히 거른다
        const len = parseLocal(ev.end).getTime() - parseLocal(ev.start).getTime();
        const wideFrom = isoMinuteOf(new Date(parseLocal(lo).getTime() - len - DAY));
        for (const s of expandPattern(pat, ruleStart(ev), wideFrom, hi)) {
            const start = norm(s);
            if (taken.has(`${n.id}|${start}`)) continue;
            const end = endFor(ev, start);
            if (hit(start, end)) out.push({ eventId: n.id, seriesId: n.id, originalStart: start, start, end, allDay: ev.allDay, virtual: true });
        }
    }
    return out.sort((a, b) => (a.start !== b.start ? (a.start < b.start ? -1 : 1) : a.allDay !== b.allDay ? (a.allDay ? -1 : 1) : 0));
}

/** 가상 → 실체 레코드 id(이미 실체면 그 id · 못 만들면 ''). 규칙 일정 옆에 같은 이름·칸 값으로 만든다. 🔴 손댈 때만 부른다. */
export function materialize(o: Occurrence): string {
    if (!o.virtual || !o.seriesId || !o.originalStart) return o.eventId;
    const found = findMaterialized(o.seriesId, o.originalStart);
    if (found) return found.id;
    const api = getNodesApi();
    const rule = api?.get(o.seriesId), parent = api?.parent(o.seriesId);
    if (!api || !rule || !parent) return '';
    const rd = dataOf(rule);
    // 회차는 반복을 물려받지 않는다 — 패턴을 뗀 칸 값으로
    const { values } = eventToStored({ start: o.start, end: o.end, allDay: o.allDay, memo: storedToEvent(rd)?.memo }, withPattern(rd, null).values ?? {});
    return api.create(parent, { type: EVENT_TYPE, name: rule.name, data: { values, seriesId: o.seriesId, originalStart: o.originalStart } });
}

/** 미루기·당기기 — 실체화하고 그 레코드의 「언제」만 바꾼다(originalStart 그대로 · 되돌리기 한 칸). 실체 id(못 하면 ''). */
export function reschedule(o: Occurrence, start: string, end: string): string {
    const api = getNodesApi();
    if (!api) return '';
    let id = '';
    api.batch(() => {
        id = materialize(o);
        if (!id) return;
        const cur = dataOf(api.get(id));
        const memo = storedToEvent(cur)?.memo;
        api.setData(id, { ...cur, values: eventToStored({ start, end, allDay: o.allDay, memo }, cur.values ?? {}).values });
    });
    return id;
}

/** 「원래대로」 — 실체 회차를 휴지통으로 보내 그 자리 가상 회차가 돌아오게(고친 칸 값도 같이 걷힌다). 돌아온 가상 회차 칩 id(못 하면 ''). */
export function restore(o: Occurrence): string {
    const api = getNodesApi();
    if (!api || o.virtual || !o.seriesId || !o.originalStart || !api.get(o.eventId)) return '';
    api.remove(o.eventId);
    return occId(o.seriesId, o.originalStart);
}

/** 회차를 days 일 옮긴다(시각 유지) — 하루 미루기 +1 · 당기기 -1. 실체 id. */
export const nudge = (o: Occurrence, days: number): string => reschedule(o, addDays(o.start, days), addDays(o.end, days));

/** 「반복」 칸 — 패턴을 달면 그 일정이 규칙 일정이 되고, null 이면 반복을 뗀다(실체 회차는 seriesId·originalStart 를 걷어 보통 일정으로 남긴다). */
export function setPattern(id: string, p: DatePattern | null): void {
    const api = getNodesApi();
    const n = api?.get(id);
    if (!api || !n) return;
    const plain = (d: SeriesData): SeriesData => { const x = withPattern(d, null); delete x.seriesId; delete x.originalStart; return x; };
    api.batch(() => {
        api.setData(id, p ? withPattern(plain(dataOf(n)), p) : plain(dataOf(n)));
        if (!p) for (const m of api.liveByType(EVENT_TYPE)) if (dataOf(m).seriesId === id) api.setData(m.id, plain(dataOf(m)));
    });
}

/** 첫 규칙만 갈아 끼운다(나머지 규칙·더한 날·빠지는 날은 그대로) — null 이면 반복을 뗀다. 편집기가 패턴을 통째로 다루기 전까지의 「반복」 칸 손잡이. */
export function setRecur(id: string, rule: RecurRule | null): void {
    const cur = patternOf(getNodesApi()?.get(id)?.data);
    setPattern(id, rule ? { ...cur, rules: [rule, ...(cur?.rules.slice(1) ?? [])] } : null);
}

/** 그 회차만 빼기 — 패턴 exdates 에 originalStart 의 날짜를 더하고, 실체가 있으면 노드 휴지통으로. 반복 아닌 일정엔 아무것도 안 한다. */
export function skip(o: Occurrence): void {
    const api = getNodesApi();
    const { seriesId, originalStart } = o;
    if (!api || !seriesId || !originalStart) return;
    api.batch(() => {
        const d = dataOf(api.get(seriesId));
        const p = patternOf(d);
        if (p) {
            const x = originalStart.slice(0, 10);   // 날짜만 — 시리즈 시각을 바꿔도 빠진 날이 되살아나지 않게
            const ex = p.exdates ?? [];
            if (!ex.includes(x)) api.setData(seriesId, withPattern(d, { ...p, exdates: [...ex, x] }));
        }
        const m = o.virtual ? findMaterialized(seriesId, originalStart)?.id : o.eventId;
        if (m) api.remove(m);
    });
}

/**
 * 「이 회차부터 뒤로 전부」 — 규칙들을 그 회차 전날로 끊고(until · count 는 걷는다), 같은 패턴의 새 규칙 일정을 그 회차부터 잇는다.
 *   count 가 있으면 남은 수(빠진 회차도 센다 = RFC5545) · 그 회차 이후 빠지는 날·더한 날과 실체 회차는 새 일정으로 넘긴다. 새 일정 id(못 하면 '').
 *   shortcut: 규칙 여럿일 때 그 회차가 다른 규칙의 것이면 매일·매년 규칙의 암시값(간격 위상·월일)이 새 시작 기준으로 바뀐다 — 매주 요일·매월 날짜만 고정한다.
 */
export function splitSeries(o: Occurrence): string {
    const api = getNodesApi();
    const { seriesId, originalStart: os } = o;
    if (!api || !seriesId || !os) return '';
    const node = api.get(seriesId), parent = api.parent(seriesId);
    const d = dataOf(node), ev = storedToEvent(d), p = patternOf(d);
    if (!node || !parent || !p || !ev) return '';
    const day = os.slice(0, 10), cut = addDays(day, -1).slice(0, 10), s0 = parseLocal(ev.start);

    const nextRules: RecurRule[] = [];
    for (const r of p.rules) {
        const nr: { -readonly [K in keyof RecurRule]: RecurRule[K] } = { ...r };
        if (r.freq === 'weekly' && !r.weekdays?.length) nr.weekdays = [s0.getDay()];
        if (r.freq === 'monthly' && r.monthDay === undefined && !r.nth) nr.monthDay = s0.getDate();
        if (r.count !== undefined) {
            nr.count = r.count - expand({ ...r, exdates: [] }, ruleStart(ev), ruleStart(ev), os).length;
            if (nr.count <= 0) continue;
        }
        if (r.until && r.until.slice(0, 10) < day) continue;
        nextRules.push(nr);
    }
    const after = (list?: readonly string[]) => list?.filter((x) => x.slice(0, 10) >= day);
    const next: DatePattern = { ...p, rules: nextRules };
    const ex = after(p.exdates), rd = after(p.rdates);
    if (ex?.length) next.exdates = ex; else delete next.exdates;
    if (rd?.length) next.rdates = rd; else delete next.rdates;
    if (!next.rules.length && !next.rdates) return '';
    const prev: DatePattern = { ...p, rules: p.rules.map((r) => { const x = { ...r, until: r.until && r.until < cut ? r.until : cut }; delete x.count; return x; }) };
    const rb = p.rdates?.filter((x) => x.slice(0, 10) < day);
    if (rb?.length) prev.rdates = rb; else delete prev.rdates;

    let id = '';
    api.batch(() => {
        const { values } = eventToStored({ start: os, end: endFor(ev, os), allDay: ev.allDay, memo: ev.memo }, withPattern(d, null).values ?? {});
        id = api.create(parent, { type: EVENT_TYPE, name: node.name, data: withPattern({ values }, next) });
        if (!id) return;
        api.setData(seriesId, withPattern(d, prev));
        for (const n of api.liveByType(EVENT_TYPE)) {
            const nd = dataOf(n);
            if (nd.seriesId === seriesId && nd.originalStart && nd.originalStart >= os) api.setData(n.id, { ...nd, seriesId: id });
        }
    });
    return id;
}
