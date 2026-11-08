/**
 * 시간표 그리드 — **특별 시간표 적용 + 일정 목록 계산**(순수 · vitest 단독 · 명세 3단계).
 *   🔴 핵심: 「어느 날짜·시각에 실제로 무엇이 적용되나」. 이 함수가 내는 `ScheduleEntry` 목록이
 *      나중에 달력으로 가는 재료다(날짜+시작~끝+글자+출처). ⛔ 달력 약속을 여기서 import 하지 않는다(다른 레인 몫).
 *
 *   층 쌓기(아래→위): 기본 시간표(base) → 특별 시간표들(범위에 든 것만, 우선순위 오름차순).
 *     - overlay(우선 적용): 글자가 든 칸만 아래를 덮는다
 *     - replace(덮어쓰기): 그 칸을 통째로(빈 칸이어도) 덮는다
 *   우선순위: priority 숫자가 있으면 위치보다 앞선다(쥔님 16:28) · 없으면 노드 위치(뒤에 올수록 위).
 *   모양(열·행·병합)은 기본 시간표가 쥔다(1차: 특별은 같은 모양 위에 칸 글자만 바꾼다).
 */
import type { TimetableData, SpecialData, ScheduleEntry, GridDay } from '../contract-week-grid/types';
import { cellKey, getCell, coveredBy, columnCount, rowCount } from './model';

export interface SpecialInput {
    id: string;
    data: SpecialData;
}

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

/** 우선순위 비교 키 — [그룹, 값]. 그룹 1(숫자 매김)이 그룹 0(위치)보다 항상 위. 오름차순 정렬 → 뒤가 이긴다. */
function priorityKey(s: SpecialInput, position: number): [number, number] {
    return s.data.priority !== undefined ? [1, s.data.priority] : [0, position];
}

/** 특별 시간표를 우선순위 오름차순(약→강)으로. 같은 입력 순서(position)를 위치 기본값으로 쓴다. */
export function orderedSpecials(specials: SpecialInput[]): SpecialInput[] {
    return specials
        .map((s, i) => ({ s, i, key: priorityKey(s, i) }))
        .sort((a, b) => (a.key[0] - b.key[0]) || (a.key[1] - b.key[1]) || (a.i - b.i))
        .map((x) => x.s);
}

interface Winner { text: string; source: string; data: TimetableData; }

/** 한 칸(col,row)에 그 날 실제로 적용되는 글자·출처 — 층을 아래→위로 쌓아 마지막이 이긴다. 비면 null. */
function resolveCell(
    layers: { data: TimetableData; source: string; replace: boolean }[],
    col: number, row: number,
): Winner | null {
    let win: Winner | null = null;
    for (const layer of layers) {
        const cell = getCell(layer.data, col, row);
        if (layer.replace) {
            win = { text: cell?.text ?? '', source: layer.source, data: layer.data };
        } else if (cell && cell.text !== '') {
            win = { text: cell.text, source: layer.source, data: layer.data };
        }
    }
    if (!win || win.text === '') return null;
    return win;
}

/**
 * 그 날짜 하루의 일정 목록 — 열 하나(그 날 쓰이는 요일/일차)를 골라 행마다 칸을 풀어 낸다.
 *   병합: 덮인 칸은 건너뛰고, 세로 병합 앵커는 시작~끝을 그 span 만큼 늘린다(칸별 시각 덮어쓰기가 있으면 그걸 쓴다).
 */
export function scheduleOn(
    base: TimetableData, specials: SpecialInput[], date: string, anchor?: string,
): ScheduleEntry[] {
    const col = activeColumn(base, date, anchor);
    if (col === null || col >= columnCount(base.columns)) return [];

    const layers: { data: TimetableData; source: string; replace: boolean }[] = [];
    if (inRange(base, date)) layers.push({ data: base, source: 'base', replace: true });   // 바닥은 통째(빈 칸도 바닥)
    for (const s of orderedSpecials(specials)) {
        if (inRange(s.data, date)) layers.push({ data: s.data, source: s.id, replace: s.data.mode === 'replace' });
    }
    if (layers.length === 0) return [];

    const covered = coveredBy(base);   // 모양(병합)은 기본 시간표가 쥔다(1차)
    const rows = rowCount(base);
    const out: ScheduleEntry[] = [];
    for (let row = 0; row < rows; row++) {
        if (covered.has(cellKey(col, row))) continue;   // 덮인 칸은 앵커가 대신 낸다
        const win = resolveCell(layers, col, row);
        if (!win) continue;
        const baseAnchor = getCell(base, col, row);
        const rs = baseAnchor?.rowSpan ?? 1;
        const lastRow = Math.min(row + rs - 1, rows - 1);
        const winCell = getCell(win.data, col, row);
        const start = winCell?.time?.start ?? base.rows[row]?.range.start ?? 0;
        const end = winCell?.time?.end ?? base.rows[lastRow]?.range.end ?? 0;
        out.push({ date, col, row, start, end, text: win.text, source: win.source });
    }
    return out;
}

/**
 * [from,to] 날짜 구간의 일정 목록 전부 — 🔴 이게 달력으로 갈 재료다.
 *   anchor(일차 기준)는 기본 시간표 범위가 기간이면 그 시작일, 아니면 from.
 */
export function scheduleRange(
    base: TimetableData, specials: SpecialInput[], from: string, to: string,
): ScheduleEntry[] {
    const anchor = base.range.kind === 'period' && base.range.start ? base.range.start : from;
    const out: ScheduleEntry[] = [];
    for (const date of eachDate(from, to)) out.push(...scheduleOn(base, specials, date, anchor));
    return out;
}
