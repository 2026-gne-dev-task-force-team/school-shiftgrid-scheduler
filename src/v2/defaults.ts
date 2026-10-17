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

/** 교시 N개짜리 기본 슬롯 — 09:00 시작, 40분 수업·10분 쉼 (샘플과 같은 결) */
export function defaultSlots(periods: number): Slot[] {
    const slots: Slot[] = [];
    let mins = 9 * 60; // 09:00
    for (let i = 0; i < periods; i++) {
        const start = fromMins(mins);
        const end = fromMins(mins + 40);
        slots.push({ index: i, label: `${i + 1}교시`, start, end, assignable: true, kind: 'lesson' });
        mins += 50; // 40분 수업 + 10분 쉼
    }
    return slots;
}

/** 새 표용 기본 시간 틀 (월~금 × N교시) */
export function defaultSpec(periods = DEFAULT_PERIODS): TimetableSpec {
    const slots = defaultSlots(periods);
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

function fromMins(total: number): string {
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
