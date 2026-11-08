/**
 * 🔴 약속 「record-view」 0.1 — 노션 표 보기를 본뜬 「도메인을 모르는 목록 화면」의 규격(타입만).
 *   제공자: record-view 꾸러미(provides: record-view · 모듈 값 recordViewApi). 손님은 host.modules 로
 *   record-view 모듈(RecordViewApi)을 받아 RecordView 컴포넌트를 쓴다. ⛔ 손님은 꾸러미 속 파일을 직접 import 안 한다
 *   — 타입은 이 contracts 파일에서 import type, 값은 host.modules.use<RecordViewApi>('record-view') 로.
 *
 * 🔴 ⛔ 도메인을 한 글자도 모른다. 쓰는 쪽(사람 명단·계정·달력…)이 「칸 정의 + 행 + 콜백」만
 *    넘기면 목록 화면을 공짜로 얻는다. 데이터는 바깥 소유, 이 부품은 **보기 상태(view state)만** 쥔다.
 *
 * ⭐ 「제어형(controlled)」이다 — 셀을 고치면 onCellChange 로 바깥에 알리고, 바깥이 records 를 바꿔 되돌려 준다.
 *    이 부품은 records 를 저장하지 않는다(정렬·필터·검색·숨긴 칸·칸 폭만 viewKey 로 보관).
 */
import type { ReactElement } from 'react';

/** 칸(필드) 종류 — 여섯. 셀 표시·편집·정렬·필터가 전부 이 종류로 갈린다. */
export type FieldType = 'text' | 'number' | 'select' | 'multi' | 'date' | 'check';

/** select·multi 가 고를 수 있는 값 하나. color 는 알약 색 이름(colors.ts 의 PILL_COLORS). */
export interface FieldOption {
    value: string;
    label: string;
    /** 알약 색 이름(gray·blue·green…). 없으면 gray */
    color?: string;
}

/** 한 칸의 정의 — 바깥이 준다. */
export interface RecordField {
    key: string;
    label: string;
    type: FieldType;
    /** select·multi 전용 — 고를 수 있는 값 목록 */
    options?: FieldOption[];
    /** 기본 칸 폭(px). 보기 상태의 widths 가 덮을 수 있다 */
    width?: number;
    /** 참이면 이 칸은 못 고친다(표시만) */
    readOnly?: boolean;
}

/** 셀 하나가 가질 수 있는 값 — 종류별로 다르다. text/select/date=string · number=number · check=boolean · multi=string[]. */
export type RecordCellValue = string | number | boolean | string[] | null;

/** 필터 연산자 — 칸 종류마다 쓸 수 있는 집합이 다르다(logic.opsFor). */
export type FilterOp =
    | 'contains' | 'notContains'      // text
    | 'eq' | 'ne'                     // text·number·select·date
    | 'gt' | 'gte' | 'lt' | 'lte'     // number
    | 'before' | 'after'             // date
    | 'has' | 'notHas'               // multi
    | 'empty' | 'notEmpty'           // 모두
    | 'isTrue' | 'isFalse';          // check

/** 필터 한 줄 — 「이 칸이, 이 연산자로, 이 값과」. 여러 줄은 AND 로 묶인다. */
export interface FilterRule {
    key: string;
    op: FilterOp;
    /** empty·notEmpty·isTrue·isFalse 는 값이 없다 */
    value?: string | number;
}

/** 정렬 한 줄 — 「이 칸을 오름/내림」. 여러 줄은 앞선 것이 먼저다(안정 정렬). */
export interface SortRule {
    key: string;
    dir: 'asc' | 'desc';
}

/** 보기 종류 — 지금은 표 하나. 🔑 보드·달력·갤러리를 나중에 꽂을 자리(두 번째 판). */
export type RecordViewKind = 'table';

/** 보기 상태 — viewKey 로 localStorage 에 보관되는 전부. ⛔ 데이터(records)는 여기 없다(바깥 소유). */
export interface RecordViewState {
    kind: RecordViewKind;
    /** 검색어(모든 칸의 표시 글자에서 찾는다) */
    search: string;
    /** 필터(AND) */
    filters: FilterRule[];
    /** 정렬(다중) */
    sorts: SortRule[];
    /** 숨긴 칸 key 목록 */
    hidden: string[];
    /** 칸별 폭 덮어쓰기(끌어서 바꾼 값) */
    widths: Record<string, number>;
}

/**
 * 레코드 뷰 props — 제어형. 데이터는 바깥 소유, 보기 상태만 안쪽.
 *   T 는 행 하나의 타입(객체). 셀 값은 (행)[field.key] 로 읽는다 — getId 로만 신원을 받는다.
 */
export interface RecordViewProps<T> {
    fields: RecordField[];
    records: T[];
    getId: (r: T) => string;
    /** 보기 상태(정렬·필터·숨긴 칸·칸 폭·검색) 저장 키 — storageKey 로 localStorage. 모듈마다 고유하게(예: 'people.list'). */
    viewKey: string;
    /** 셀을 고치면 부른다. 안 넘기면 모든 칸이 읽기 전용이 된다. */
    onCellChange?: (id: string, key: string, value: RecordCellValue) => void;
    /** 「+ 새로 만들기」 줄을 누르면. 안 넘기면 그 줄이 안 뜬다. */
    onAddRecord?: () => void;
    /** 고른 행들을 지우라고 부른다(일괄 삭제 막대). 안 넘기면 선택·삭제 UI 가 안 뜬다. */
    onDeleteRecords?: (ids: string[]) => void;
    /** 행의 「열기」 단추를 누르면. 안 넘기면 그 단추가 안 뜬다. */
    onOpenRecord?: (id: string) => void;
    /** 넘기면 칸 추가·이름·타입 바꾸기·삭제를 허용한다. 안 넘기면 칸 구조는 고정. */
    onFieldsChange?: (fields: RecordField[]) => void;
    className?: string;
}

/**
 * 🔴 host.modules 로 받는 record-view 모듈 — 손님이 쓰는 전부. provides 와 짝(모듈 값 recordViewApi).
 *   host.modules.use<RecordViewApi>('record-view') 가 돌려준다. 지금은 RecordView 컴포넌트 하나(버전 달린 표면).
 */
export interface RecordViewApi {
    version: 1;
    /** 제어형 목록 화면. T 는 행 하나의 타입(객체). */
    RecordView<T>(props: RecordViewProps<T>): ReactElement | null;
}
