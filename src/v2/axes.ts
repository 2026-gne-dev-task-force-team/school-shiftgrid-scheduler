/**
 * 축 유도 — 표(틀)에서 「행·열이 무엇인지」를 뽑는다.
 * 🔴 격자를 그리는 쪽은 이 결과만 받는다. 요일·교시를 격자 코드에 박지 않는다
 *    (나중에 당직표·교대근무 같은 자유 축이 오면 이 함수만 갈아끼운다 — 설계 「나중에 갈아끼울 데」).
 */
import type { Sheet } from './model';
import { DAY_LABEL } from '../ui/lib';

/** 축 머리 하나 — 격자가 아는 전부(키와 보여줄 이름, 그리고 수업 칸인지) */
export interface AxisHead {
    key: string;
    label: string;
    /** 행에서만 의미 — 수업을 넣을 수 있는 칸인지(점심·쉬는 시간이면 false). 열은 항상 true */
    assignable: boolean;
}

export interface SheetAxes {
    cols: AxisHead[]; // 세로 열 = 요일 (지금은)
    rows: AxisHead[]; // 가로 행 = 교시 (지금은)
}

/**
 * 표의 축 — 지금은 「요일 × 교시」다. 열은 틀의 activeDays, 행은 틀의 slots.
 * cycleDays 가 7 이 아니면 요일 이름 대신 「N일차」로 — v1 lib.dayName 과 같은 규약.
 */
export function sheetAxes(sheet: Sheet): SheetAxes {
    const spec = sheet.spec;
    const weekly = spec.cycleDays === 7;
    const days = spec.activeDays?.length ? spec.activeDays : [0, 1, 2, 3, 4];
    const cols: AxisHead[] = days.map((d) => ({
        key: String(d),
        label: weekly ? (DAY_LABEL[d] ?? `${d + 1}일차`) : `${d + 1}일차`,
        assignable: true,
    }));
    const rows: AxisHead[] = spec.slots.map((s) => ({
        key: String(s.index),
        label: s.label,
        assignable: s.assignable,
    }));
    return { cols, rows };
}
