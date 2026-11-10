/**
 * iCalendar(.ics) 파서·작성기 — 순수 함수만(React 0 · 노드 0 · 레지스트리 0). 🔴 가져오기(2)·내보내기(3)·링크 구독(4) 셋이 같이 쓴다.
 *   ⛔ 의존성 추가 없이 작게 직접 짠다(쥔님 2026-11-08). 약속의 평면값(CalendarItem)으로만 주고받는다.
 *
 * 지원(파서):
 *   · VEVENT · SUMMARY · DESCRIPTION · UID
 *   · DTSTART/DTEND — `VALUE=DATE`(종일) · 떠 있는 지역시각 · UTC(`Z`) · `TZID=Asia/Seoul`(+09:00) · 나머지 TZID 는 로컬 근사
 *   · DTEND 없으면: 종일은 1일, 시각 일정은 길이 0
 *   · 줄 접힘(이어쓰기) · 이스케이프(\\ \; \, \n) · CRLF/LF 둘 다
 *   · RRULE 은 DAILY·WEEKLY(BYDAY)·MONTHLY(BYMONTHDAY · BYDAY+순번)·YEARLY × INTERVAL·COUNT·UNTIL 을 recur/expand 로 펼친다. 모르는 FREQ 는 첫 회만.
 * ⛔ 못 하는 것: DURATION · VTIMEZONE 실제 규칙 해석(Asia/Seoul 만 하드코딩) · 그 밖의 BY* · EXDATE · RDATE · VTODO/VALARM.
 */
import { isoMinuteOf, parseLocal } from './events';
import type { CalendarItem } from './contracts/calendar';
import { expand, type RecurFreq, type RecurRule } from './recur';

// ── 공통 보조 ──
const p2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const KST_MS = 9 * 3_600_000;
/** 끝 없는 YEARLY 의 안전 지평(년) — 나머지 FREQ 는 2년. */
export const MAX_YEARLY = 25;

/** 'YYYY-MM-DD'(종일) 또는 'YYYY-MM-DDTHH:mm'(시각)에서 날짜 부분만 'YYYYMMDD'. */
function compactDate(s: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    return m ? `${m[1]}${m[2]}${m[3]}` : s;
}
/** 'YYYY-MM-DDTHH:mm' → 'YYYYMMDDTHHMMSS'(떠 있는 지역시각 · 초는 00). 종일이 아닌 일정 전용. */
function compactDateTime(s: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s);
    if (!m) return `${compactDate(s)}T000000`;
    return `${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}00`;
}
function fmtDate(d: Date): string {
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

// ── 줄 접힘(folding) — 75 옥텟(UTF-8). 이어쓰기 줄은 맨 앞 공백 한 칸(그 자리까지 포함해 75). ──
const ENC = new TextEncoder();
/** 한 줄을 75옥텟마다 접는다 — 되돌리는 건 unfold(이어쓰기 줄 맨 앞 공백 제거). */
export function foldLine(line: string): string {
    const segs: string[] = [];
    let cur = '';
    let bytes = 0;
    for (const ch of line) {
        const b = ENC.encode(ch).length;
        const max = segs.length === 0 ? 75 : 74;   // 이어쓰기 줄은 선두 공백 1옥텟을 비워 둔다
        if (bytes + b > max) { segs.push(cur); cur = ch; bytes = b; }
        else { cur += ch; bytes += b; }
    }
    segs.push(cur);
    return segs.join('\r\n ');
}
/** 접힌 줄을 다시 하나로 — 공백·탭으로 시작하는 줄은 앞 줄에 이어 붙인다(그 한 글자 제거). */
function unfold(text: string): string[] {
    const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const out: string[] = [];
    for (const l of raw) {
        if ((l.startsWith(' ') || l.startsWith('\t')) && out.length) out[out.length - 1] += l.slice(1);
        else out.push(l);
    }
    return out;
}

// ── 이스케이프 ──
/** 텍스트 값 이스케이프(SUMMARY·DESCRIPTION) — \ ; , 줄바꿈. 순서 중요(역슬래시 먼저). */
export function escapeText(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
/** 되돌리기 — \\ \; \, \n(\N). */
function unescapeText(s: string): string {
    return s.replace(/\\([\\;,nN])/g, (_m, c: string) => (c === 'n' || c === 'N' ? '\n' : c));
}

// ── 속성 한 줄 뜯기 ──
interface Prop { name: string; params: Record<string, string>; value: string; }
function parseProp(line: string): Prop | null {
    const idx = line.indexOf(':');
    if (idx < 0) return null;
    const head = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const parts = head.split(';');
    const name = parts[0].toUpperCase();
    const params: Record<string, string> = {};
    for (const p of parts.slice(1)) {
        const eq = p.indexOf('=');
        if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
    }
    return { name, params, value };
}

// ── 날짜 값 → {str, allDay} ──
interface ParsedDate { str: string; allDay: boolean }
function parseDateValue(value: string, params: Record<string, string>): ParsedDate | null {
    const v = value.trim();
    if (params.VALUE === 'DATE' || /^\d{8}$/.test(v)) {
        const m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
        return m ? { str: `${m[1]}-${m[2]}-${m[3]}`, allDay: true } : null;
    }
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
    if (!m) return null;
    const Y = +m[1], Mo = +m[2] - 1, D = +m[3], H = +m[4], Mi = +m[5];
    if (m[7] === 'Z') return { str: isoMinuteOf(new Date(Date.UTC(Y, Mo, D, H, Mi))), allDay: false };
    if (params.TZID === 'Asia/Seoul') return { str: isoMinuteOf(new Date(Date.UTC(Y, Mo, D, H, Mi) - KST_MS)), allDay: false };
    // 떠 있는 지역시각 · 모르는 TZID → 로컬 근사(벽시계 그대로)
    return { str: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`, allDay: false };
}

/** 'YYYY-MM-DD' 에 days 를 더해 'YYYY-MM-DD'. */
function addDaysStr(dateStr: string, days: number): string {
    const d = parseLocal(dateStr);
    d.setDate(d.getDate() + days);
    return fmtDate(d);
}

// ── 한 VEVENT 수집 상태 ──
interface RawEvent {
    uid?: string;
    summary?: string;
    description?: string;
    dtstart?: ParsedDate;
    dtend?: ParsedDate;
    rrule?: Record<string, string>;
}

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
/** RRULE 속성들 → 규칙 꼴. FREQ 가 모르는 값이면 null(첫 회만). BYDAY: 매주는 요일들, 매월은 `2TU`·`-1FR` 하나만. */
function ruleOf(rr: Record<string, string>): RecurRule | null {
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

/** RawEvent → CalendarItem 들(RRULE 은 expand 로 펼친다). */
function emit(raw: RawEvent, uid: string): CalendarItem[] {
    if (!raw.dtstart) return [];
    const allDay = raw.dtstart.allDay;
    const start = raw.dtstart.str;
    // 끝 — DTEND 있으면 그대로, 없으면 종일 1일 / 시각 길이 0
    const end = raw.dtend ? raw.dtend.str : (allDay ? addDaysStr(start, 1) : start);
    const title = raw.summary ? unescapeText(raw.summary) : '(제목 없음)';
    const memo = raw.description ? unescapeText(raw.description) : undefined;
    const base: CalendarItem = { id: uid, title, start, end, allDay, ...(memo ? { memo } : {}) };

    const rule = raw.rrule ? ruleOf(raw.rrule) : null;
    if (!rule) return [base];   // RRULE 없음 · 모르는 FREQ 는 첫 회만

    const startDate = parseLocal(start);
    const durMs = parseLocal(end).getTime() - startDate.getTime();
    // 끝(COUNT·UNTIL)이 없으면 안전 지평까지만 — 매년 25년(MAX_YEARLY) · 나머지 2년
    const horizon = new Date(startDate);
    if (rule.count === undefined && !rule.until) horizon.setFullYear(horizon.getFullYear() + (rule.freq === 'yearly' ? MAX_YEARLY : 2));
    else horizon.setFullYear(9999);
    const starts = expand(rule, start, start, isoMinuteOf(horizon));
    const out = starts.map((s, n): CalendarItem => {
        const occStart = parseLocal(s);
        const occEnd = new Date(occStart.getTime() + durMs);
        return {
            ...base,
            id: n === 0 ? uid : `${uid}#${n}`,
            start: allDay ? fmtDate(occStart) : isoMinuteOf(occStart),
            end: allDay ? fmtDate(occEnd) : isoMinuteOf(occEnd),
        };
    });
    return out.length ? out : [base];
}

/**
 * .ics 문자열 → CalendarItem 들. 못 읽는 VEVENT 는 건너뛴다(DTSTART 없음 등). UID 없으면 자동 부여('ics-<n>').
 */
export function parseIcs(text: string): CalendarItem[] {
    const lines = unfold(text);
    const items: CalendarItem[] = [];
    let raw: RawEvent | null = null;
    let auto = 0;
    for (const line of lines) {
        if (line === 'BEGIN:VEVENT') { raw = {}; continue; }
        if (line === 'END:VEVENT') {
            if (raw) items.push(...emit(raw, raw.uid ?? `ics-${auto++}`));
            raw = null;
            continue;
        }
        if (!raw) continue;
        const prop = parseProp(line);
        if (!prop) continue;
        switch (prop.name) {
            case 'UID': raw.uid = prop.value.trim(); break;
            case 'SUMMARY': raw.summary = prop.value; break;
            case 'DESCRIPTION': raw.description = prop.value; break;
            case 'DTSTART': { const d = parseDateValue(prop.value, prop.params); if (d) raw.dtstart = d; break; }
            case 'DTEND': { const d = parseDateValue(prop.value, prop.params); if (d) raw.dtend = d; break; }
            case 'RRULE': {
                const rule: Record<string, string> = {};
                for (const kv of prop.value.split(';')) {
                    const eq = kv.indexOf('=');
                    if (eq > 0) rule[kv.slice(0, eq).toUpperCase()] = kv.slice(eq + 1);
                }
                raw.rrule = rule;
                break;
            }
        }
    }
    return items;
}

// ── 작성기(내보내기) ──
export interface IcsWriteEvent {
    uid: string;
    title: string;
    /** 'YYYY-MM-DDTHH:mm'(또는 종일이면 'YYYY-MM-DD'·'...T00:00') */
    start: string;
    /** 반열린 끝 — 종일은 다음 날(배타). */
    end: string;
    allDay: boolean;
    memo?: string;
}

const PRODID = '-//shiftgrid//calendar 0.1//KO';

/** DTSTAMP(지금, UTC) — 'YYYYMMDDTHHMMSSZ'. */
function dtstampNow(now = new Date()): string {
    return `${now.getUTCFullYear()}${p2(now.getUTCMonth() + 1)}${p2(now.getUTCDate())}`
        + `T${p2(now.getUTCHours())}${p2(now.getUTCMinutes())}${p2(now.getUTCSeconds())}Z`;
}

/**
 * CalendarItem 꼴의 내 일정들 → 표준 .ics 문자열. 구글·아웃룩이 읽는 꼴:
 *   VCALENDAR · VERSION:2.0 · PRODID · UID · DTSTAMP · 종일 `VALUE=DATE` · DTEND 배타 · 줄 접힘 75옥텟 · 이스케이프 · CRLF.
 *   🔴 시각 일정은 떠 있는 지역시각(TZID·Z 없음)으로 쓴다 — 우리 저장이 지역 벽시계라 그게 정직하다(파서가 로컬 근사로 되읽는다).
 */
export function writeIcs(events: readonly IcsWriteEvent[], now = new Date()): string {
    const stamp = dtstampNow(now);
    const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:${PRODID}`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    for (const e of events) {
        lines.push('BEGIN:VEVENT');
        lines.push(`UID:${e.uid}`);
        lines.push(`DTSTAMP:${stamp}`);
        if (e.allDay) {
            lines.push(`DTSTART;VALUE=DATE:${compactDate(e.start)}`);
            lines.push(`DTEND;VALUE=DATE:${compactDate(e.end)}`);
        } else {
            lines.push(`DTSTART:${compactDateTime(e.start)}`);
            lines.push(`DTEND:${compactDateTime(e.end)}`);
        }
        lines.push(`SUMMARY:${escapeText(e.title)}`);
        if (e.memo) lines.push(`DESCRIPTION:${escapeText(e.memo)}`);
        lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.map(foldLine).join('\r\n') + '\r\n';
}
