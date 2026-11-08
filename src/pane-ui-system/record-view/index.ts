/**
 * 레코드 뷰 배럴 — 바깥(앱·플러그인)이 쓰는 문. pane-ui-system/index 가 다시 내보낸다.
 *   ⭐ 공통 목록 화면 부품 하나 + 순수 로직(필터·정렬·검색) + 보기 상태 도우미 + 알약 색.
 */
export { RecordView } from './RecordView';
export { PILL_COLORS, pillStyle, type PillColor } from './colors';
export {
    deriveRows, matchesRule, matchesSearch, compareByField, applySorts,
    opsFor, opNeedsValue, isEmptyValue, displayText, rawValue, toNumber,
} from './logic';
export {
    defaultState, normalizeState, loadState, saveState,
    DEFAULT_COL_WIDTH, MIN_COL_WIDTH,
} from './view-state';
export type {
    FieldType, FieldOption, RecordField, RecordCellValue,
    FilterOp, FilterRule, SortRule, RecordViewKind, RecordViewState, RecordViewProps,
} from './types';
