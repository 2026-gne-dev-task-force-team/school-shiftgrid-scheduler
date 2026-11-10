/**
 * 반복 규칙 펼치기 — 순수 함수. `expand(rule, start, from, to)` → 반열림 [from, to) 안의 회차 시작들(오름차순).
 * 일·주(월요일 시작)·달·해 단위 기간을 차례로 돌며 후보를 만든다. 없는 날(2/29 · 31일 · 5째 요일)은 건너뛴다(RFC5545).
 */
import type { RecurRule } from './types';

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
