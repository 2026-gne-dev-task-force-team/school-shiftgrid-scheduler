/**
 * v1 TimetableSpec(요일 × 교시, 시각이 박힌 Slot[]) → v2 rows/cols(시각이 파생되는 자유 격자).
 * migrate.ts(v1 Doc) 와 persist.ts(옛 v2 schemaVersion 4) 양쪽이 이 변환을 재사용한다.
 *
 * 🔴 줄·열 키는 옛 index 를 문자열로 그대로 재사용한다(`String(slot.index)`, `String(dayIndex)`) —
 *    그래야 칸(cells)은 한 글자도 안 건드리고 그대로 옮겨진다(키가 안 바뀌니 cellKey 가 그대로 유효하다).
 * ⚠️ v1 의 「교시」 라벨(예: "1교시")은 사용자가 실제로 쓰던 글자이므로 그대로 들고 온다 —
 *    이 낱말을 새로 만들어 쓰는 게 아니라 과거 데이터를 보존하는 것이다.
 */
import type { TimetableSpec } from '../types/schema';
import type { Row, Col } from './model';
import { DAY_LABEL } from '../ui/lib';
import { toMins } from './time';

export interface RowsCols { startTime: string; rows: Row[]; cols: Col[] }

export function specToRowsCols(spec: TimetableSpec | undefined | null): RowsCols {
    const slots = spec?.slots ?? [];
    const startTime = slots[0]?.start ?? spec?.dayStart ?? '09:00';

    const rows: Row[] = slots.map((s, i) => {
        const minutes = Math.max(1, toMins(s.end) - toMins(s.start));
        const next = slots[i + 1];
        const gapAfter = next ? Math.max(0, toMins(next.start) - toMins(s.end)) : 0;
        return {
            key: String(s.index),
            label: s.label,
            minutes,
            gapAfter,
            assignable: !!s.assignable,
        };
    });

    const weekly = (spec?.cycleDays ?? 7) === 7;
    const days = spec?.activeDays?.length ? spec.activeDays : [0, 1, 2, 3, 4];
    const cols: Col[] = days.map((d) => ({
        key: String(d),
        label: weekly ? (DAY_LABEL[d] ?? `${d + 1}일차`) : `${d + 1}일차`,
    }));

    return { startTime, rows: rows.length ? rows : [defaultEmptyRow()], cols: cols.length ? cols : [] };
}

/** 틀이 아예 비어 있던 옛 자료용 — 격자가 설 자리는 있어야 한다 */
function defaultEmptyRow(): Row {
    return { key: '0', minutes: 40, gapAfter: 0, assignable: true };
}
