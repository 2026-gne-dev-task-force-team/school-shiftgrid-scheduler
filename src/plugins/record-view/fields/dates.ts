/**
 * 날짜 값 — P2 에서 string('2026-11-08') 이 {start, end?} 로 올라온다(순수).
 *   🔴 옛 값을 읽을 때 올려 준다 — toDateValue 가 string·객체·깨진 값을 다 받아 성한 {start} 로.
 *   time 이면 start 가 'YYYY-MM-DDTHH:MM', range 면 end 가 붙는다. 저장은 늘 이 꼴.
 */
import type { DateValue } from '../contracts/record-view';

const DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

/** 'YYYY-MM-DD' 또는 'YYYY-MM-DDTHH:MM' 꼴이면 그 글자, 아니면 null */
function cleanStamp(s: unknown): string | null {
    return typeof s === 'string' && DATE.test(s) ? s : null;
}

/** 아무 값(옛 string·객체·깨진 것) → {start, end?} 또는 비면 null */
export function toDateValue(v: unknown): DateValue | null {
    if (typeof v === 'string') { const s = cleanStamp(v); return s ? { start: s } : null; }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
        const o = v as Record<string, unknown>;
        const start = cleanStamp(o.start);
        if (!start) return null;
        const end = cleanStamp(o.end);
        return end ? { start, end } : { start };
    }
    return null;
}

export interface DateConfig { time?: boolean; range?: boolean }

/** 날짜 하나를 보이는 글자로 — time 이면 '날짜 시각', 아니면 날짜만 */
function stampText(s: string): string {
    return s.includes('T') ? s.replace('T', ' ') : s;
}

/** {start,end?} → 보이는 글자(정렬·검색·복사가 쓴다). range 면 'start ~ end'. */
export function dateText(v: unknown): string {
    const dv = toDateValue(v);
    if (!dv) return '';
    return dv.end ? `${stampText(dv.start)} ~ ${stampText(dv.end)}` : stampText(dv.start);
}

/** 붙여넣기·변환이 글자에서 값을 만든다 — 'start ~ end' 도 받는다 */
export function parseDateText(text: string): DateValue | null {
    const parts = text.split('~').map((p) => p.trim().replace(' ', 'T'));
    const start = cleanStamp(parts[0]);
    if (!start) return null;
    const end = parts.length > 1 ? cleanStamp(parts[1]) : null;
    return end ? { start, end } : { start };
}
