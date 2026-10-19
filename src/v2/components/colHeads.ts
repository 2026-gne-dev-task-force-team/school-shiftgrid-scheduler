/**
 * 컴포넌트 — 열 머리 (id: col-heads). 정의(순수 로직)만 — 폼은 colHeadsForm.tsx.
 * 꼴(요일 월~금 / N일차 / 직접 입력) · 열 수 → 적용하면 열 수를 맞추고 머리를 채운다.
 * 🔴 열 수가 늘면 기존 열은 자리(순번)를 그대로 지켜 칸 글자가 안 사라진다.
 *    줄면 빠지는 열의 칸 글자는 undo 로만 돌아온다(설계 그대로).
 */
import type { Col } from '../model';
import { pruneCells } from '../cells';
import { uid } from '../../store/ids';
import type { SheetComponentDef } from './types';

export type ColHeadsStyle = 'weekday' | 'cycle' | 'custom';

export interface ColHeadsProps extends Record<string, unknown> {
    style: ColHeadsStyle;
    count: number;
    /** style==='custom' 일 때 — 쉼표로 구분한 라벨 */
    customLabels: string;
}

const WEEKDAY = ['월', '화', '수', '목', '금', '토', '일'];

export function labelFor(props: ColHeadsProps, i: number): string {
    if (props.style === 'weekday') return WEEKDAY[i % 7] ?? `${i + 1}`;
    if (props.style === 'cycle') return `${i + 1}일차`;
    const custom = (props.customLabels ?? '').split(',').map((s) => s.trim());
    return custom[i] || `${i + 1}`;
}

export const colHeadsDef: SheetComponentDef<ColHeadsProps> = {
    id: 'col-heads',
    title: '열 머리',
    defaultProps: { style: 'weekday', count: 5, customLabels: '' },
    apply(sheet, props) {
        const count = Math.max(1, Math.min(14, Math.floor(Number(props.count)) || 1));
        const oldCols = sheet.cols;
        const cols: Col[] = Array.from({ length: count }, (_, i) => ({
            key: oldCols[i]?.key ?? uid('col'),
            label: labelFor(props, i),
        }));
        const cells = pruneCells(sheet.cells, cols.map((c) => c.key), sheet.rows.map((r) => r.key));
        return { ...sheet, cols, cells };
    },
};
