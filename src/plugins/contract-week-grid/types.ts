/**
 * 🔴 약속 「week-grid」 0.1.0 — **시간표 한 장의 모양**(쥔님 2026-11-08 판정으로 다시 씀).
 *   📌 옛 초안(월~금 고정 · 칸 열쇠 'd3p4' · 교시)은 16:03·16:13 판정과 어긋나 폐기했다 — 학교 낱말을 걷었다.
 *   시간표 한 장이 담는 것은 넷뿐이다: **범위 · 열 · 행 · 칸**(명세 [[시간표 그리드 요구명세]]).
 *     - 범위  : 언제 적용되나 — 기간(시작~끝) 또는 N회 반복
 *     - 열    : 가로 축 — 요일(월~토 중 고름) 또는 1·2·3…일차(교대 순환)
 *     - 행    : 세로 축 — 사용자가 짓는 이름 + 시각([start,end))  (⛔ 「1교시」를 박지 않는다)
 *     - 칸    : 한 칸의 글자 + 셀 병합(세로 필수·가로 허용). 글자의 뜻은 그리드가 모른다(나중 플러그인이 알아본다).
 *   🔗 uses: clock — 행 시각(TimeRange·Minute)이 contract-clock 의 공용 시각 낱말을 쓴다.
 *   ⭐ 이 약속은 **타입만**(값 0) — 제공자(그리드)가 자기 시간표를 이 꼴로 노출하고, 소비자(달력 연동 등)가 읽는다.
 *      특히 `ScheduleEntry` 목록이 「날짜+시각+글자+출처」로, 나중에 달력으로 가는 재료다(달력 약속은 다른 레인 몫).
 */
import type { Minute, TimeRange } from '../contract-clock/types';

/** 요일 — 1=월 … 6=토(그리드는 토까지). ⛔ clock 의 Weekday(월~금)를 넓히지 않고 제 낱말로 둔다(그 둘은 timetable·absence 가 쓴다). */
export type GridDay = 1 | 2 | 3 | 4 | 5 | 6;

/** 범위 — 언제 적용되나. 기간(start~end, 빈 문자열이면 그쪽 경계 없음) 또는 N회 반복. */
export type RangeSpec =
    | { kind: 'period'; start: string; end: string }   // 'YYYY-MM-DD' (빈 문자열 = 미설정/무기한)
    | { kind: 'repeat'; count: number };               // N회 반복(날짜 축에서는 무기한으로 본다 — 1차)

/** 열(가로 축) — 요일(월~토 중 고름) 또는 1·2·3…일차(교대 순환). */
export type ColumnSpec =
    | { kind: 'weekday'; days: GridDay[] }              // 고른 요일들(순서 있음)
    | { kind: 'cycle'; count: number };                // 1일차 … N일차

/** 행(세로 축) 하나 — 사용자가 짓는 이름 + 시각. 이름은 빈 문자열 가능. */
export interface RowSpec {
    id: string;
    name: string;
    range: TimeRange;   // 그 행의 기본 시각([start,end))
}

/**
 * 칸 하나 — 글자 + 셀 병합 + (숨은) 칸별 시각 덮어쓰기.
 *   🔴 병합: 왼쪽-위 앵커 칸만 rowSpan/colSpan>1 을 들고, 덮인 칸은 저장 맵에서 빠진다(coveredBy 로 계산).
 *   🔴 time: 행 시각을 이 칸만 다르게(수요일만 일찍 끝나는 날). 없으면 행 시각을 쓴다 — UI 는 숨겨 둔다(명세 16:24).
 */
export interface Cell {
    text: string;
    rowSpan?: number;   // 세로 병합(행 수, 기본 1)
    colSpan?: number;   // 가로 병합(열 수, 기본 1)
    time?: TimeRange;   // 칸별 시각 덮어쓰기(숨은 기능)
}

/** 칸 주소 — 열·행 인덱스(0부터). */
export interface CellAddr {
    col: number;
    row: number;
}

/** 시간표 한 장의 데이터 — 노드 data 에 그대로 들어간다(범위·열·행·칸). */
export interface TimetableData {
    range: RangeSpec;
    columns: ColumnSpec;
    rows: RowSpec[];
    /** 칸 — 열쇠 cellKey(col,row) → Cell. 빈 칸(글자 없고 병합 1)은 저장하지 않는다. */
    cells: Record<string, Cell>;
    /** 열 머리 이름 덮어쓰기 — 열쇠는 열 인덱스 문자열. 없으면 꼴에서 뽑은 기본 이름(요일/일차)을 쓴다. */
    colNames?: Record<string, string>;
}

/** 특별 시간표가 아래 층(기본·다른 특별)에 얹히는 방식. */
export type SpecialMode =
    | 'overlay'    // 우선 적용 — 글자가 든 칸만 바뀐다
    | 'replace';   // 덮어쓰기 — 그 범위 동안 통째로 바뀐다

/**
 * 특별 시간표 — 기본 시간표와 같은 모양(열·행) 위에 범위 동안 얹힌다(1차: 모양 공유, 칸 글자만 다르다).
 *   우선순위: priority 숫자가 있으면 그게 먼저(쥔님 16:28), 없으면 노드 위치로 매긴다.
 */
export interface SpecialData extends TimetableData {
    mode: SpecialMode;
    /** 사용자가 직접 매긴 우선순위(클수록 위). 없으면 노드 위치로 정한다. */
    priority?: number;
}

/** 일정 한 줄 — 「어느 날짜·시각에 무엇이 적용되나」. 🔴 나중에 달력으로 갈 재료(날짜+시작~끝+글자+출처). */
export interface ScheduleEntry {
    date: string;      // 'YYYY-MM-DD'
    col: number;       // 적용된 열 인덱스
    row: number;       // 행 인덱스(병합 앵커)
    start: Minute;     // 시작(분)
    end: Minute;       // 끝(분)
    text: string;      // 칸 글자
    source: string;    // 출처 — 'base' 또는 특별 시간표 노드 id
}

/**
 * week-grid 모듈 — 제공자(그리드)가 자기 시간표를 이 꼴로 내준다(소비자가 읽기만).
 *   ⛔ 값 0(타입만) — 구현은 제공자 플러그인 안에 산다.
 */
export interface WeekGrid {
    /** 살아 있는 시간표들의 id·이름. */
    sheets(): readonly { id: string; name: string }[];
    /** 그 시간표의 데이터(없으면 null). */
    dataOf(sheetId: string): TimetableData | null;
    /** 그 시간표가 [from,to] 날짜 구간에 내는 일정 목록(특별 시간표까지 반영). */
    schedule(sheetId: string, from: string, to: string): readonly ScheduleEntry[];
}
