/**
 * 시간표 — **일정 목록 계산**(순수 · vitest 단독 · 명세 3단계).
 *   🔴 핵심: 「어느 날짜·시각에 실제로 무엇이 적용되나」. 이 함수가 내는 `ScheduleEntry` 목록이
 *      나중에 달력으로 가는 재료다(날짜+시작~끝+글자). ⛔ 달력 약속을 여기서 import 하지 않는다(다른 레인 몫).
 *   (특별 시간표는 11-09 쥔님 지시로 걷었다 — 도메인 특화 낱말이라 시간표 한 장만 남긴다.)
 */
import type { TimetableData, ScheduleEntry, GridDay } from './types';
import { cellKey, getCell, coveredBy, columnCount, rowCount } from './model';

// ── 날짜 유틸(UTC 로 다뤄 시간대 밀림 없이) ──

/** 'YYYY-MM-DD' → 1970-01-01 부터의 날짜 수(정수). 꼴이 아니면 NaN. */
export function dayNumber(iso: string): number {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return NaN;
    return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
}

/** 그 날짜의 요일 — 1=월 … 6=토. 일요일(또는 꼴 아님)이면 null. */
export function gridDayOf(iso: string): GridDay | null {
    const n = dayNumber(iso);
    if (Number.isNaN(n)) return null;
    const dow = new Date(n * 86_400_000).getUTCDay();   // 0=일 … 6=토
    return dow === 0 ? null : (dow as GridDay);
}

/** [from,to] 날짜를 하루씩(둘 다 포함). 역순·꼴 오류면 빈 배열. */
export function eachDate(from: string, to: string): string[] {
    const a = dayNumber(from);
    const b = dayNumber(to);
    if (Number.isNaN(a) || Number.isNaN(b) || a > b) return [];
    const out: string[] = [];
    for (let n = a; n <= b; n++) out.push(new Date(n * 86_400_000).toISOString().slice(0, 10));
    return out;
}

/** 그 날짜가 범위 안인가 — 기간은 경계(빈 문자열=무한), N회 반복은 날짜 축에서 무기한으로 본다(1차). */
export function inRange(data: TimetableData, date: string): boolean {
    const r = data.range;
    if (r.kind === 'repeat') return true;
    const d = dayNumber(date);
    if (Number.isNaN(d)) return false;
    if (r.start) { const s = dayNumber(r.start); if (!Number.isNaN(s) && d < s) return false; }
    if (r.end) { const e = dayNumber(r.end); if (!Number.isNaN(e) && d > e) return false; }
    return true;
}

/**
 * 그 날짜에 쓰이는 열 인덱스 — 요일이면 그 요일의 자리, 일차면 anchor 로부터 센 순환. 없으면 null.
 *   anchor(일차 기준 날짜)는 보통 기본 시간표 범위의 시작일. 없으면 날짜 자체로 센다(결정적).
 */
export function activeColumn(data: TimetableData, date: string, anchor?: string): number | null {
    const cols = data.columns;
    if (cols.kind === 'weekday') {
        const gd = gridDayOf(date);
        if (gd === null) return null;
        const idx = cols.days.indexOf(gd);
        return idx < 0 ? null : idx;
    }
    // cycle(일차)
    const count = Math.max(0, cols.count);
    if (count === 0) return null;
    const d = dayNumber(date);
    if (Number.isNaN(d)) return null;
    const base = anchor ? dayNumber(anchor) : 0;
    const delta = Number.isNaN(base) ? d : d - base;
    return ((delta % count) + count) % count;
}

/**
 * 그 날짜 하루의 일정 목록 — 열 하나(그 날 쓰이는 요일/일차)를 골라 행마다 칸을 풀어 낸다.
 *   병합: 덮인 칸은 건너뛰고, 세로 병합 앵커는 시작~끝을 그 span 만큼 늘린다(칸별 시각 덮어쓰기가 있으면 그걸 쓴다).
 */
export function scheduleOn(base: TimetableData, date: string, anchor?: string): ScheduleEntry[] {
    const col = activeColumn(base, date, anchor);
    if (col === null || col >= columnCount(base.columns) || !inRange(base, date)) return [];

    const covered = coveredBy(base);
    const rows = rowCount(base);
    const out: ScheduleEntry[] = [];
    for (let row = 0; row < rows; row++) {
        if (covered.has(cellKey(col, row))) continue;   // 덮인 칸은 앵커가 대신 낸다
        const cell = getCell(base, col, row);
        if (!cell || cell.text === '') continue;
        const lastRow = Math.min(row + (cell.rowSpan ?? 1) - 1, rows - 1);
        const start = cell.time?.start ?? base.rows[row]?.range.start ?? 0;
        const end = cell.time?.end ?? base.rows[lastRow]?.range.end ?? 0;
        out.push({ date, col, row, start, end, text: cell.text });
    }
    return out;
}

/**
 * [from,to] 날짜 구간의 일정 목록 전부 — 🔴 이게 달력으로 갈 재료다.
 *   anchor(일차 기준)는 시간표 범위가 기간이면 그 시작일, 아니면 from.
 */
export function scheduleRange(base: TimetableData, from: string, to: string): ScheduleEntry[] {
    const anchor = base.range.kind === 'period' && base.range.start ? base.range.start : from;
    const out: ScheduleEntry[] = [];
    for (const date of eachDate(from, to)) out.push(...scheduleOn(base, date, anchor));
    return out;
}
