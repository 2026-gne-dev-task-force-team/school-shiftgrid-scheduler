/**
 * 컴포넌트 — 학교 수업 시간 (id: school-periods). 정의(순수 로직)만 — 폼은 schoolPeriodsForm.tsx.
 * 🔴 화면 이름은 「학교 수업 시간」이다 — 「교시」 낱말을 피한다(설계 금기).
 * 적용하면 줄을 규칙대로 다시 센다. 점심은 수업 못 넣는 줄(assignable:false, label '점심')로 끼운다.
 * 🔴 칸 글자는 같은 순번 줄에 남는다 — 새 줄의 key 를 "결과 줄 목록에서의 순번"으로 옛 줄 key 와 맞춘다.
 *    (순번이 같은 자리에 옛 줄이 있으면 그 key 를 그대로 쓴다 → cellKey 가 안 바뀌어 글자가 안 사라진다)
 */
import type { Row } from '../model';
import { pruneCells } from '../cells';
import { uid } from '../../store/ids';
import type { SheetComponentDef } from './types';

export interface SchoolPeriodsProps extends Record<string, unknown> {
    start: string;
    lessonMinutes: number;
    breakMinutes: number;
    rows: number;
    /** 몇 번째 수업 줄 뒤에 점심을 끼우나(1부터) — null/0 이면 점심 없음 */
    lunchAfter: number | null;
    lunchMinutes: number;
}

function clampInt(n: unknown, lo: number, hi: number, fallback: number): number {
    const v = Math.floor(Number(n));
    if (!Number.isFinite(v)) return fallback;
    return Math.max(lo, Math.min(hi, v));
}

export const schoolPeriodsDef: SheetComponentDef<SchoolPeriodsProps> = {
    id: 'school-periods',
    title: '학교 수업 시간',
    defaultProps: {
        start: '09:00', lessonMinutes: 40, breakMinutes: 10, rows: 6, lunchAfter: null, lunchMinutes: 50,
    },
    apply(sheet, props) {
        const rowsCount = clampInt(props.rows, 0, 20, 6);
        const lessonMinutes = clampInt(props.lessonMinutes, 1, 240, 40);
        const breakMinutes = clampInt(props.breakMinutes, 0, 120, 10);
        const lunchAfter = props.lunchAfter != null && Number(props.lunchAfter) > 0
            ? clampInt(props.lunchAfter, 1, rowsCount, 1) : null;
        const lunchMinutes = clampInt(props.lunchMinutes, 1, 180, 50);

        const oldRows = sheet.rows;
        const next: Row[] = [];
        const nextKey = () => oldRows[next.length]?.key ?? uid('row');

        let placed = 0;
        while (placed < rowsCount) {
            next.push({ key: nextKey(), minutes: lessonMinutes, gapAfter: 0, assignable: true });
            placed += 1;
            const lunchHere = lunchAfter !== null && placed === lunchAfter && placed < rowsCount;
            if (lunchHere) {
                next.push({ key: nextKey(), label: '점심', minutes: lunchMinutes, gapAfter: breakMinutes, assignable: false });
            } else if (placed < rowsCount) {
                next[next.length - 1].gapAfter = breakMinutes;
            }
        }

        const rows = next.length ? next : [{ key: nextKey(), minutes: lessonMinutes, gapAfter: 0, assignable: true }];
        const cells = pruneCells(sheet.cells, sheet.cols.map((c) => c.key), rows.map((r) => r.key));
        return { ...sheet, startTime: props.start || sheet.startTime, rows, cells };
    },
};
