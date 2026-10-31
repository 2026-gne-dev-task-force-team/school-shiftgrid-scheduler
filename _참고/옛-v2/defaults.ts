/**
 * 새 표의 기본값 — 5열(월~금) × 6줄(40분 수업 · 쉬는 10분 · 09:00 시작).
 * 🔴 설계 확정(쥔님 2026-10-19): "정의 없이 시작" — 점심은 안 넣는다(컴포넌트가 넣는다).
 */
import type { Row, Col } from './model';
import { uid } from '../store/ids';

const DEFAULT_ROWS = 6;
const DEFAULT_MINUTES = 40;
const DEFAULT_GAP = 10;
export const DEFAULT_START_TIME = '09:00';
const DEFAULT_COL_LABELS = ['월', '화', '수', '목', '금'];

export function defaultRows(): Row[] {
    return Array.from({ length: DEFAULT_ROWS }, (_, i) => ({
        key: uid('row'),
        minutes: DEFAULT_MINUTES,
        gapAfter: i < DEFAULT_ROWS - 1 ? DEFAULT_GAP : 0,
        assignable: true,
    }));
}

export function defaultCols(): Col[] {
    return DEFAULT_COL_LABELS.map((label) => ({ key: uid('col'), label }));
}
