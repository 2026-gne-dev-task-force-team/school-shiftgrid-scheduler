/**
 * makeSpec — 학년별 교시 수·점심 위치로 시간표 규격(TimetableSpec)을 만든다.
 * lunchAfter 교시 뒤에 점심이 들어간다. 슬롯 index 는 0부터 연속(점심 포함).
 */
import type { Slot, TimetableSpec } from '../types/schema';
import type { MakeSpecInput } from './api';
import { fmt } from './context';

export function makeSpec(input: MakeSpecInput): TimetableSpec {
    const {
        id, name, periods, lunchAfter,
        dayStart = '09:00', lessonMin = 40, breakMin = 10, lunchMin = 50, lessonsPerDay,
    } = input;

    const [h, m] = dayStart.split(':').map(Number);
    let t = (h || 0) * 60 + (m || 0);
    const start = t;
    const slots: Slot[] = [];
    let idx = 0;

    for (let p = 1; p <= periods; p++) {
        const s = t;
        const e = t + lessonMin;
        slots.push({ index: idx++, label: `${p}교시`, start: fmt(s), end: fmt(e), assignable: true, kind: 'lesson' });
        t = e;
        if (p === lunchAfter) {
            slots.push({ index: idx++, label: '점심', start: fmt(t), end: fmt(t + lunchMin), assignable: false, kind: 'lunch' });
            t += lunchMin;
        } else if (p < periods) {
            t += breakMin;
        }
    }

    return {
        id, name,
        cycleDays: 7,
        activeDays: [0, 1, 2, 3, 4],
        dayStart: fmt(start),
        dayEnd: fmt(t),
        slots,
        ...(lessonsPerDay ? { lessonsPerDay } : {}),
    };
}
