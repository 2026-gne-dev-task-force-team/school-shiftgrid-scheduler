/**
 * 새 표의 기본값 — 월~금 × 6교시 (초등 기본).
 * 🙋 쥔님 미확정(설계: 「월~금 × 6교시」 또는 「빈 격자 0×0」) — 구현은 권고안인 월~금 × 6교시로 간다.
 *    빈 작업대에서 「새 표」를 누르면 바로 표다운 표가 떠서 눈으로 확인이 된다(설계 「여기서 죽는다」).
 * ⚠️ 틀 모양은 v1 TimetableSpec 그대로다 — 나중에 「틀 공유」 모듈이 그대로 다시 붙인다.
 */
import type { Slot, TimetableSpec } from '../types/schema';
import { uid } from '../store/ids';

const DEFAULT_PERIODS = 6;
const DAY_ACTIVE = [0, 1, 2, 3, 4]; // 월~금
const DEFAULT_LESSON = 40; // 수업 40분
const DEFAULT_BREAK = 10;  // 쉬는 시간 10분

/** "HH:mm" → 분. 모양이 깨졌으면 0 */
export function toMins(hhmm: string): number {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '');
    if (!m) return 0;
    return Number(m[1]) * 60 + Number(m[2]);
}

/** 분 → "HH:mm" (24시를 넘으면 그대로 넘겨서 보여준다 — 교시가 많으면 드러나야 한다) */
export function fromMins(total: number): string {
    const t = Math.max(0, Math.round(total));
    const h = Math.floor(t / 60);
    const m = t % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 교시 N개짜리 기본 슬롯 — 09:00 시작, 40분 수업·10분 쉼 (샘플과 같은 결) */
export function defaultSlots(periods: number): Slot[] {
    const slots: Slot[] = [];
    let mins = 9 * 60; // 09:00
    for (let i = 0; i < periods; i++) {
        const start = fromMins(mins);
        const end = fromMins(mins + DEFAULT_LESSON);
        slots.push({ index: i, label: `${i + 1}교시`, start, end, assignable: true, kind: 'lesson' });
        mins += DEFAULT_LESSON + DEFAULT_BREAK; // 40분 수업 + 10분 쉼
    }
    return slots;
}

/**
 * ⭐ 교시 이어붙이기(모듈 1.1 ① 고침) — 기존 슬롯은 그대로 두고, 늘어난 만큼만
 *   「앞 교시 끝 + 쉬는 시간」으로 이어 붙인다. 09:00 부터 다시 세던 옛 버릇(엉뚱한 시각)을 고친다.
 *   · 수업 길이·쉬는 시간은 그 표에서 이미 쓰던 값을 추정해 쓴다(마지막 교시 길이 · 마지막 두 교시 간격).
 *   · 못 재면 40분 수업·10분 쉼.
 *   · 줄이면 앞에서부터 N개만 남긴다(기존 시각·라벨 그대로).
 */
export function extendSlots(existing: Slot[], target: number): Slot[] {
    const n = Math.max(0, Math.min(20, Math.floor(target)));
    if (n <= existing.length) return existing.slice(0, n).map((s, i) => ({ ...s, index: i }));
    if (existing.length === 0) return defaultSlots(n);

    const slots: Slot[] = existing.map((s, i) => ({ ...s, index: i }));
    const last = slots[slots.length - 1];
    const lessonLen = clampPos(toMins(last.end) - toMins(last.start), DEFAULT_LESSON);
    const gap = estimateBreak(slots);
    let mins = toMins(last.end);
    for (let i = existing.length; i < n; i++) {
        mins += gap; // 앞 교시 끝 + 쉬는 시간
        const start = fromMins(mins);
        const end = fromMins(mins + lessonLen);
        slots.push({ index: i, label: `${i + 1}교시`, start, end, assignable: true, kind: 'lesson' });
        mins += lessonLen;
    }
    return slots;
}

/** 그 표에서 쓰던 쉬는 시간 추정 — 마지막 두 교시의 끝↔시작 차이. 못 재면 10분 */
function estimateBreak(slots: Slot[]): number {
    if (slots.length < 2) return DEFAULT_BREAK;
    const a = slots[slots.length - 2];
    const b = slots[slots.length - 1];
    const gap = toMins(b.start) - toMins(a.end);
    return gap >= 0 ? gap : DEFAULT_BREAK;
}

function clampPos(v: number, fallback: number): number {
    return v > 0 ? v : fallback;
}

/**
 * ⭐ 규칙 생성(모듈 1.1 ②) — 받은 규칙으로 교시 목록을 한 번에 만든다.
 *   시작 시각 · 수업 길이 · 쉬는 시간 · 교시 수 · (옵션)점심「몇 교시 뒤에·몇 분」.
 *   점심은 kind:'lunch'(수업 못 넣는 칸)로 끼워 넣고 뒤 교시를 민다.
 *   교시 사이에만 쉬는 시간을 둔다. 점심은 앞 교시 끝에 붙이고, 점심 뒤 첫 교시는 점심 끝에 붙인다.
 */
export interface SlotRule {
    start: string;            // "09:00"
    lessonMinutes: number;    // 수업 길이(분)
    breakMinutes: number;     // 쉬는 시간(분)
    periods: number;          // 교시 수
    lunchAfter?: number | null; // 몇 교시 뒤에 점심 (1부터). null/0/미지정 = 점심 없음
    lunchMinutes?: number;    // 점심 길이(분)
}

export function defaultSlotRule(spec?: TimetableSpec): SlotRule {
    const lessons = spec?.slots.filter((s) => s.assignable).length ?? DEFAULT_PERIODS;
    const first = spec?.slots[0];
    return {
        start: first?.start ?? '09:00',
        lessonMinutes: DEFAULT_LESSON,
        breakMinutes: DEFAULT_BREAK,
        periods: lessons || DEFAULT_PERIODS,
        // 표에 점심이 이미 있으면 그 자리(앞에 놓인 수업 교시 수), 표가 없으면 기본 4교시 뒤.
        // 표는 있는데 점심이 없으면 그 표를 존중해 없음 — 규칙 생성 패널에서 켤 수 있다.
        lunchAfter: spec ? lunchAfterOf(spec) : DEFAULT_LUNCH_AFTER,
        lunchMinutes: spec ? (lunchMinutesOf(spec) ?? DEFAULT_LUNCH) : DEFAULT_LUNCH,
    };
}

/** 표에 점심 칸이 있으면 「그 앞에 놓인 수업 교시 수」, 없으면 null */
function lunchAfterOf(spec: TimetableSpec): number | null {
    let lessons = 0;
    for (const s of spec.slots) {
        if (s.kind === 'lunch') return lessons;
        if (s.assignable) lessons += 1;
    }
    return null;
}

function lunchMinutesOf(spec: TimetableSpec): number | null {
    const l = spec.slots.find((s) => s.kind === 'lunch');
    if (!l) return null;
    const len = toMins(l.end) - toMins(l.start);
    return len > 0 ? len : null;
}

export function buildSlotsByRule(r: SlotRule): Slot[] {
    const periods = Math.max(0, Math.min(20, Math.floor(r.periods)));
    const lessonLen = clampPos(Math.floor(r.lessonMinutes), DEFAULT_LESSON);
    const brk = Math.max(0, Math.floor(r.breakMinutes));
    const lunchAfter = r.lunchAfter != null && r.lunchAfter > 0 ? Math.floor(r.lunchAfter) : null;
    const lunchLen = clampPos(Math.floor(r.lunchMinutes ?? 0), 50);

    const slots: Slot[] = [];
    let mins = toMins(r.start);
    let index = 0;
    let placed = 0; // 지금까지 놓은 수업 교시 수
    while (placed < periods) {
        if (placed > 0) mins += brk; // 교시 사이에만 쉬는 시간
        const start = fromMins(mins);
        const end = fromMins(mins + lessonLen);
        slots.push({ index: index++, label: `${placed + 1}교시`, start, end, assignable: true, kind: 'lesson' });
        mins += lessonLen;
        placed += 1;
        // 점심은 「그 교시 뒤」에 — 단 마지막 교시 뒤가 아니면
        if (lunchAfter !== null && placed === lunchAfter && placed < periods) {
            const ls = fromMins(mins);
            const le = fromMins(mins + lunchLen);
            slots.push({ index: index++, label: '점심', start: ls, end: le, assignable: false, kind: 'lunch' });
            mins += lunchLen;
        }
    }
    return slots;
}

const DEFAULT_LUNCH_AFTER = 4; // 4교시 뒤 점심
const DEFAULT_LUNCH = 50;      // 점심 50분

/**
 * 새 표용 기본 시간 틀 (월~금 × N교시 + 점심).
 * 🔴 점심이 기본으로 들어 있다 — 쥔님 2026-10-17: *"점심시간 굶어 죽나?"* (점심 없는 6교시가 기본이던 것을 고쳤다).
 */
export function defaultSpec(periods = DEFAULT_PERIODS): TimetableSpec {
    const slots = buildSlotsByRule({
        start: '09:00', lessonMinutes: DEFAULT_LESSON, breakMinutes: DEFAULT_BREAK,
        periods, lunchAfter: DEFAULT_LUNCH_AFTER, lunchMinutes: DEFAULT_LUNCH,
    });
    return {
        id: uid('spec'),
        name: '기본 시간 틀',
        cycleDays: 7,
        activeDays: [...DAY_ACTIVE],
        dayStart: slots[0]?.start ?? '09:00',
        dayEnd: slots[slots.length - 1]?.end ?? '09:00',
        slots,
    };
}
