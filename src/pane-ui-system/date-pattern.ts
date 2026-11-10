/**
 * 날짜 패턴 — 날짜 칸 값(DateValue.pattern)이 품는 반복 규칙(순수 · React 0). calendar/recur 에서 내려왔다(달력·컬렉션 둘 다 쓴다 — 꾸러미끼리 import 금지라 바닥에).
 *   · `expand(rule, start, from, to)` → 반열림 [from, to) 안의 회차 시작들(오름차순). 단일 규칙.
 *     일·주(월요일 시작)·달·해 단위 기간을 차례로 돌며 후보를 만든다. 없는 날(2/29 · 31일 · 5째 요일)은 건너뛴다(RFC5545).
 *   · `expandPattern(p, …)` → 규칙 합집합 + rdates − exdates − except 기간.
 *   · `patternSummary` 읽는 한 줄 요약 · `patternToRRule`/`rruleToPattern` ICS 줄 왕복.
 */

/** 반복 규칙 꼴 — 순수 데이터(저장 가능한 JSON). 날짜 문자열은 달력 꼴: 종일 'YYYY-MM-DD' · 시각 'YYYY-MM-DDTHH:mm'. */
export type RecurFreq = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RecurRule {
    freq: RecurFreq;
    /** N 간격(일·주·달·해 단위). 기본 1. */
    interval?: number;
    /** weekly: 요일들(0=일 … 6=토). 없으면 시작일의 요일. */
    weekdays?: readonly number[];
    /** monthly: 매월 N일(음수는 끝에서 — -1 = 말일). 없고 nth 도 없으면 시작일의 일. */
    monthDay?: number;
    /** monthly: N째 요일(1~5 · 마지막 = -1). */
    nth?: { n: number; weekday: number };
    /** 끝 — 횟수(시작 회차 포함 · exdates 로 빠진 회차도 센다 = RFC5545). 둘 다 없으면 끝 없음. */
    count?: number;
    /** 끝 — 이 날짜까지 포함(앞 10자 'YYYY-MM-DD' 만 본다). */
    until?: string;
    /** 빠지는 날 — 'YYYY-MM-DD'(그날 전부) 또는 회차 시작 전체 문자열. */
    exdates?: readonly string[];
}

/** 날짜 패턴 — rules 합집합 + rdates(더하기) − exdates(빼기 · 'YYYY-MM-DD' 면 그날 전부) − except(기간 빼기 · 앞 10자 · 양끝 포함). */
export interface DatePattern {
    rules: RecurRule[];
    rdates?: string[];
    exdates?: string[];
    except?: { from: string; to: string }[];
}

/** 안전 상한 — 무한 규칙이 범위로 안 끊겨도 이 이상은 안 낸다 / 이 기간 수 넘게 돌지 않는다. */
export const MAX_RESULTS = 2000;
export const MAX_PERIODS = 100_000;

const DAY = 86_400_000;
const p2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
/** 일수(1970 기준) — UTC 로만 셈해 DST·시간대에 안 흔들린다. */
const dn = (y: number, m0: number, d: number) => Math.floor(Date.UTC(y, m0, d) / DAY);
const ymd = (n: number) => { const d = new Date(n * DAY); return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()] as const; };
const dim = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
const dow = (n: number) => (((n + 4) % 7) + 7) % 7;   // 1970-01-01 = 목(4)

/** 'YYYY-MM-DD' 또는 'YYYY-MM-DDTHH:mm' → [일수, 'HH:mm', 종일?] */
function parse(s: string) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/.exec(s);
    if (!m) return null;
    const n = dn(+m[1], +m[2] - 1, +m[3]);
    if (dateStr(n) !== m[0].slice(0, 10)) return null;   // 2/30 같은 없는 날
    return { n, time: m[4] ?? '00:00', allDay: m[4] === undefined };
}
const dateStr = (n: number) => { const [y, m, d] = ymd(n); return `${y}-${p2(m + 1)}-${p2(d)}`; };
/** 범위 비교용 — 종일도 'T00:00' 을 붙여 같은 길이로. */
const key = (s: string) => (s.length === 10 ? `${s}T00:00` : s.slice(0, 16));

/** k 번째 기간의 [기간 시작 일수, 그 안의 후보 일수들(오름차순)]. */
function period(rule: RecurRule, k: number, s: { n: number }, step: number): [number, number[]] {
    const [sy, sm, sd] = ymd(s.n);
    if (rule.freq === 'daily') { const d = s.n + k * step; return [d, [d]]; }
    if (rule.freq === 'weekly') {
        const week0 = s.n - ((dow(s.n) + 6) % 7);   // 시작일이 든 주의 월요일
        const a = week0 + k * step * 7;
        const wds = rule.weekdays?.length ? rule.weekdays : [dow(s.n)];
        return [a, [...new Set(wds)].map((w) => a + ((w + 6) % 7)).sort((x, y) => x - y)];
    }
    if (rule.freq === 'monthly') {
        const mi = sy * 12 + sm + k * step;
        const y = Math.floor(mi / 12), m = mi % 12, len = dim(y, m);
        const first = dn(y, m, 1);
        if (rule.nth) {
            const days = Array.from({ length: len }, (_, i) => first + i).filter((d) => dow(d) === rule.nth!.weekday);
            const pick = rule.nth.n > 0 ? days[rule.nth.n - 1] : days[days.length + rule.nth.n];
            return [first, pick === undefined ? [] : [pick]];
        }
        const md = rule.monthDay ?? sd;
        const day = md > 0 ? md : len + 1 + md;
        return [first, day >= 1 && day <= len ? [first + day - 1] : []];
    }
    const y = sy + k * step;
    return [dn(y, 0, 1), sd <= dim(y, sm) ? [dn(y, sm, sd)] : []];
}

export function expand(rule: RecurRule, start: string, from: string, to: string): string[] {
    const s = parse(start);
    if (!s) return [];
    const step = Math.max(1, Math.floor(rule.interval ?? 1));
    const lo = key(from), hi = key(to);
    const until = rule.until ? rule.until.slice(0, 10) : undefined;
    const ex = new Set(rule.exdates ?? []);
    const hiDn = parse(hi)?.n ?? Infinity;
    const out: string[] = [];
    let seen = 0;
    for (let k = 0; k < MAX_PERIODS; k++) {
        const [anchor, days] = period(rule, k, s, step);
        if (anchor > hiDn) break;   // 기간 시작이 범위 끝을 넘으면 더 볼 것 없다
        for (const d of days) {
            if (d < s.n) continue;
            const date = dateStr(d);
            if (until !== undefined && date > until) return out;
            if (rule.count !== undefined && seen >= rule.count) return out;
            seen++;
            const full = s.allDay ? date : `${date}T${s.time}`;
            const kk = key(full);
            if (kk >= hi) return out;
            if (kk < lo || ex.has(date) || ex.has(full)) continue;
            out.push(full);
            if (out.length >= MAX_RESULTS) return out;
        }
    }
    return out;
}

// ── 패턴 ──

/** 저장값 가드 — rules 배열이 있으면 패턴으로 본다. */
export function isPattern(v: unknown): v is DatePattern {
    return !!v && typeof v === 'object' && Array.isArray((v as { rules?: unknown }).rules);
}

/** 옛 단일 규칙 → 패턴(rule.exdates 는 패턴 쪽 exdates 로 올린다). */
export function ruleToPattern(r: RecurRule): DatePattern {
    const { exdates, ...rule } = r;
    return exdates?.length ? { rules: [rule], exdates: [...exdates] } : { rules: [rule] };
}

/** rdate 'YYYY-MM-DD' 를 start 의 꼴로 — start 에 시각이 있으면 그 시각을 붙인다. */
const likeStart = (d: string, start: string) => (start.includes('T') && d.length === 10 ? `${d}${start.slice(10, 16)}` : d);

/** 패턴 펼치기 — 규칙 합집합 + rdates − exdates − except, [from, to) 안 · 중복 없이 오름차순 · MAX_RESULTS 상한. */
export function expandPattern(p: DatePattern, start: string, from: string, to: string): string[] {
    const lo = key(from), hi = key(to);
    const all = new Set<string>();
    for (const r of p.rules) for (const s of expand(r, start, from, to)) all.add(s);
    for (const d of p.rdates ?? []) {
        const full = likeStart(d, start);
        const kk = key(full);
        if (parse(full) && kk >= lo && kk < hi) all.add(full);
    }
    const ex = new Set(p.exdates ?? []);
    const out = [...all].filter((s) => {
        const date = s.slice(0, 10);
        if (ex.has(date) || ex.has(s)) return false;
        return !(p.except ?? []).some((e) => date >= e.from.slice(0, 10) && date <= e.to.slice(0, 10));
    });
    return out.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)).slice(0, MAX_RESULTS);
}

const WD = '일월화수목금토';
const NTH = ['', '첫째', '둘째', '셋째', '넷째', '다섯째'];

function ruleSummary(r: RecurRule, s: { n: number }): string {
    const [, sm, sd] = ymd(s.n);
    const iv = Math.max(1, Math.floor(r.interval ?? 1));
    if (r.freq === 'daily') return iv > 1 ? `${iv}일마다` : '매일';
    if (r.freq === 'weekly') {
        const wds = r.weekdays?.length ? [...new Set(r.weekdays)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)) : [dow(s.n)];
        // 편집기 프리셋 이름과 같은 낱말 — 「평일(월~금)」
        const days = wds.join() === '1,2,3,4,5' ? '평일(월~금)' : wds.map((w) => WD[w]).join('·');
        return iv > 1 ? `${iv}주마다 ${days}` : days === '평일(월~금)' ? days : `매주 ${days}`;
    }
    if (r.freq === 'monthly') {
        const head = iv > 1 ? `${iv}개월마다` : '매월';
        if (r.nth) return `${head} ${r.nth.n < 0 ? '마지막' : NTH[r.nth.n] ?? `${r.nth.n}째`} ${WD[r.nth.weekday]}요일`;
        const md = r.monthDay ?? sd;
        return `${head} ${md === -1 ? '말일' : md < 0 ? `말일 전 ${-md - 1}일` : `${md}일`}`;
    }
    return `${iv > 1 ? `${iv}년마다` : '매년'} ${sm + 1}월 ${sd}일`;
}

/** 「2월 10일」 — 시작과 해가 다르면 「2027년 2월 10일」. */
const mdText = (d: string, y0?: number) => `${y0 !== undefined && +d.slice(0, 4) !== y0 ? `${+d.slice(0, 4)}년 ` : ''}${+d.slice(5, 7)}월 ${+d.slice(8, 10)}일`;

/** 읽는 한 줄 요약 — 「매주 월·수 9:00 · 10번 · 빠진 날 2」(낱말은 편집기와 같게). 규칙 여럿은 「 + 」. */
export function patternSummary(p: DatePattern, start: string): string {
    const s = parse(start);
    if (!s) return '';
    let text = p.rules.map((r) => ruleSummary(r, s)).join(' + ') || '직접 지정';
    if (!s.allDay) text += ` ${+s.time.slice(0, 2)}:${s.time.slice(3)}`;
    const ends = new Set<string>();
    for (const r of p.rules) {
        if (r.count !== undefined) ends.add(`${r.count}번`);
        if (r.until) ends.add(`${mdText(r.until, ymd(s.n)[0])}까지`);
    }
    const tail = [...ends];
    if (p.except?.length) tail.push(`기간 빼기 ${p.except.length}`);
    if (p.exdates?.length) tail.push(`빠진 날 ${p.exdates.length}`);
    if (p.rdates?.length) tail.push(`더한 날 ${p.rdates.length}`);
    return [text, ...tail].join(' · ');
}

// ── ICS 줄 왕복 ──

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** RRULE 키·값들 → 규칙 꼴. FREQ 가 모르는 값이면 null(첫 회만). BYDAY: 매주는 요일들, 매월은 `2TU`·`-1FR` 하나만. */
export function ruleFromRRule(rr: Record<string, string>): RecurRule | null {
    const freq = ({ DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' } as const)[(rr.FREQ ?? '').toUpperCase() as 'DAILY'];
    if (!freq) return null;
    const rule: { -readonly [K in keyof RecurRule]: RecurRule[K] } = { freq: freq as RecurFreq };
    if (rr.INTERVAL) rule.interval = Math.max(1, +rr.INTERVAL || 1);
    if (rr.COUNT) rule.count = +rr.COUNT;
    const u = /^(\d{4})(\d{2})(\d{2})/.exec(rr.UNTIL ?? '');
    if (u) rule.until = `${u[1]}-${u[2]}-${u[3]}`;
    const days = (rr.BYDAY ?? '').split(',').map((t) => /^([+-]?\d)?(SU|MO|TU|WE|TH|FR|SA)$/i.exec(t.trim())).filter((m) => m !== null);
    if (rule.freq === 'weekly' && days.length) rule.weekdays = days.map((m) => DAY_CODES.indexOf(m[2].toUpperCase()));
    if (rule.freq === 'monthly') {
        if (rr.BYMONTHDAY) rule.monthDay = +rr.BYMONTHDAY.split(',')[0];
        else if (days[0]?.[1]) rule.nth = { n: +days[0][1], weekday: DAY_CODES.indexOf(days[0][2].toUpperCase()) };
    }
    return rule;
}

/** 규칙 → 'FREQ=…;…' (RRULE: 뒤 값). */
function ruleToRRule(r: RecurRule): string {
    const kv = [`FREQ=${r.freq.toUpperCase()}`];
    if (r.interval && r.interval > 1) kv.push(`INTERVAL=${r.interval}`);
    if (r.freq === 'weekly' && r.weekdays?.length) kv.push(`BYDAY=${r.weekdays.map((w) => DAY_CODES[w]).join(',')}`);
    if (r.freq === 'monthly' && r.nth) kv.push(`BYDAY=${r.nth.n}${DAY_CODES[r.nth.weekday]}`);
    else if (r.freq === 'monthly' && r.monthDay !== undefined) kv.push(`BYMONTHDAY=${r.monthDay}`);
    if (r.count !== undefined) kv.push(`COUNT=${r.count}`);
    if (r.until) kv.push(`UNTIL=${r.until.slice(0, 10).replace(/-/g, '')}`);
    return kv.join(';');
}

/** 'YYYY-MM-DD[THH:mm]' → ICS 값('YYYYMMDD' · 'YYYYMMDDTHHMM00'). */
const icsStamp = (s: string) => (s.length === 10 ? s.replace(/-/g, '') : `${s.slice(0, 10).replace(/-/g, '')}T${s.slice(11, 13)}${s.slice(14, 16)}00`);

/**
 * 패턴 → ICS 줄들(RRULE 여럿 · RDATE · EXDATE). 날짜만 준 rdate·exdate 는 start 에 시각이 있으면 그 시각을 붙인다.
 * shortcut: except(기간 빼기)는 내보내지 않는다 — 다른 달력이 그 기간을 그대로 보인다. 필요해지면 그 기간 회차를 EXDATE 로 펼친다.
 */
export function patternToRRule(p: DatePattern, start: string): string[] {
    const allDay = !start.includes('T');
    const dates = (name: string, list: readonly string[] | undefined) =>
        list?.length ? [`${name}${allDay ? ';VALUE=DATE' : ''}:${list.map((d) => icsStamp(likeStart(d, start))).join(',')}`] : [];
    return [...p.rules.map((r) => `RRULE:${ruleToRRule(r)}`), ...dates('RDATE', p.rdates), ...dates('EXDATE', p.exdates)];
}

/** ICS 값 → 'YYYY-MM-DD' · 'YYYY-MM-DDTHH:mm'. shortcut: Z·TZID 는 무시(벽시계 그대로). */
function fromIcsStamp(v: string): string | null {
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/.exec(v.trim());
    if (!m) return null;
    return m[4] ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : `${m[1]}-${m[2]}-${m[3]}`;
}

/** ICS 줄들(RRULE·RDATE·EXDATE · 펼친 줄) → 패턴. 모르는 줄·FREQ 는 건너뛴다. 규칙·날짜가 하나도 없으면 null. */
export function rruleToPattern(lines: readonly string[]): DatePattern | null {
    const p: { rules: RecurRule[]; rdates: string[]; exdates: string[] } = { rules: [], rdates: [], exdates: [] };
    for (const line of lines) {
        const colon = line.indexOf(':');
        if (colon < 0) continue;
        const name = line.slice(0, colon).split(';')[0].toUpperCase();
        const value = line.slice(colon + 1);
        if (name === 'RRULE') {
            const rr: Record<string, string> = {};
            for (const kv of value.split(';')) {
                const eq = kv.indexOf('=');
                if (eq > 0) rr[kv.slice(0, eq).toUpperCase()] = kv.slice(eq + 1);
            }
            const r = ruleFromRRule(rr);
            if (r) p.rules.push(r);
        } else if (name === 'RDATE' || name === 'EXDATE') {
            for (const v of value.split(',')) {
                const d = fromIcsStamp(v);
                if (d) (name === 'RDATE' ? p.rdates : p.exdates).push(d);
            }
        }
    }
    if (!p.rules.length && !p.rdates.length) return null;
    return {
        rules: p.rules,
        ...(p.rdates.length ? { rdates: p.rdates } : {}),
        ...(p.exdates.length ? { exdates: p.exdates } : {}),
    };
}
