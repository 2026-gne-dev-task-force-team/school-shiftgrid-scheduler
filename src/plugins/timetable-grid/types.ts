/**
 * 시간표 한 장의 모양 — 그리드 자기 데이터 꼴(범위 · 열 · 행 · 칸). 명세 [[시간표 그리드 요구명세]].
 *   📌 옛 약속 contract-week-grid 에 있던 것을 2026-11-10 약속 전부 걷으며 그리드 안으로 들였다(쥔님 「다시 정의」).
 *   ⛔ 학교 낱말 0 — 「1교시」를 박지 않는다. 글자의 뜻은 그리드가 모른다.
 */

/** 분 — 자정부터 센 분(0~1439). */
export type Minute = number;

/** 시각 구간 — [start, end) · 분 단위(맞닿기만 하면 안 겹친다). */
export interface TimeRange {
    start: Minute;
    end: Minute;
}

/** 요일 — 1=월 … 6=토. */
export type GridDay = 1 | 2 | 3 | 4 | 5 | 6;

/** 범위 — 언제 적용되나. 기간(start~end, 빈 문자열이면 그쪽 경계 없음) 또는 N회 반복. */
export type RangeSpec =
    | { kind: 'period'; start: string; end: string }   // 'YYYY-MM-DD' (빈 문자열 = 미설정/무기한)
    | { kind: 'repeat'; count: number };               // N회 반복(날짜 축에서는 무기한으로 본다 — 1차)

/** 열(가로 축) — 요일(월~토 중 고름) 또는 1·2·3…일차(교대 순환). */
export type ColumnSpec =
    | { kind: 'weekday'; days: GridDay[] }
    | { kind: 'cycle'; count: number };

/** 행(세로 축) 하나 — 사용자가 짓는 이름 + 시각. 이름은 빈 문자열 가능. */
export interface RowSpec {
    id: string;
    name: string;
    range: TimeRange;
}

/**
 * 칸 하나 — 글자 + 셀 병합 + (숨은) 칸별 시각 덮어쓰기.
 *   🔴 병합: 왼쪽-위 앵커 칸만 rowSpan/colSpan>1 을 들고, 덮인 칸은 저장 맵에서 빠진다(coveredBy 로 계산).
 *   🔴 time: 행 시각을 이 칸만 다르게(수요일만 일찍 끝나는 날). 없으면 행 시각 — UI 는 숨겨 둔다.
 */
export interface Cell {
    text: string;
    rowSpan?: number;
    colSpan?: number;
    time?: TimeRange;
}

/** 칸 주소 — 열·행 인덱스(0부터). */
export interface CellAddr {
    col: number;
    row: number;
}

/** 시간표 한 장의 데이터 — 노드 data 에 그대로 들어간다. */
export interface TimetableData {
    range: RangeSpec;
    columns: ColumnSpec;
    rows: RowSpec[];
    /** 칸 — 열쇠 cellKey(col,row) → Cell. 빈 칸(글자 없고 병합 1)은 저장하지 않는다. */
    cells: Record<string, Cell>;
    /** 열 머리 이름 덮어쓰기 — 열쇠는 열 인덱스 문자열. */
    colNames?: Record<string, string>;
    /** 열 너비(px) — 열쇠는 열 인덱스 문자열(T2). */
    colWidths?: Record<string, number>;
    /** 그리드에 보일 시각 범위(분) — 없으면 행 시각에서 자동(T4·T5). */
    view?: { start: Minute; end: Minute };
}

/** 일정 한 줄 — 「어느 날짜·시각에 무엇이 적용되나」(날짜+시작~끝+글자). */
export interface ScheduleEntry {
    date: string;      // 'YYYY-MM-DD'
    col: number;
    row: number;       // 병합 앵커
    start: Minute;
    end: Minute;
    text: string;
}
