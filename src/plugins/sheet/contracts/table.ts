/**
 * 🔴 약속 「table」 0.1 — 범용 표(스프레드시트식) 편집기. 타입만(값 0).
 *   한 칸 = 한 글자, (r,c) 뷰 좌표만 안다. 요일·교시·사람 같은 도메인은 모른다(손님이 밖에서 꽂는다).
 *   제공자: sheet(provides: table). 손님은 host.modules 로 table 모듈(TableApi)을 받아 Table 컴포넌트를 쓴다.
 *
 * ⭐ 범용 바닥(core:true) — 쥔님 2026-11-08 16:20 *"범용 표야"*. ⛔ 흡수한 엔진(옛 도메인 부품)의 이름을 여기 남기지 않는다.
 * ⭐ 「한 번 확정 = undo 한 단위」가 뼈대다(TableTx 하나 = 되돌리기 한 칸). 병합(merge)은 M2 — 모델이 막지 않게만 둔다.
 */
import type { ComponentType, ReactNode } from 'react';
import type { Disposable } from '../../../pane-ui-system/plugin';

/** 열 정의 — 편집기는 key·title·width·readOnly·align 만 안다(type 은 M2 col-types 가 해석). */
export interface TableColumn {
    key: string;
    title: string;
    width?: number;
    /** M2(col-types) 가 해석 — M1 은 전부 'text' 로 다룬다. */
    type?: 'text' | 'number' | 'bool' | 'select' | 'multiselect';
    options?: string[];
    readOnly?: boolean;
    align?: 'left' | 'center' | 'right';
}

/** 행 — id 하나 + { 열 key → 문자열 값 }. label/sub 는 격자꼴 행 머리(없으면 머리 없음). weight 는 행 높이 가중(편집기는 이게 분(分)인 줄 모른다). */
export interface TableRow {
    id: string;
    cells: Record<string, string>;
    label?: string;
    sub?: string;
    weight?: number;
}

export interface CellPos { r: number; c: number }

/** 한 칸 글자 변경 — 뷰가 아니라 데이터(rowId·key) 기준이라 정렬·필터가 섞여도 안전하다. */
export interface CellChange { rowId: string; key: string; value: string }

/**
 * 🔴 병합 영역(M2 merge) — 앵커 칸(rowId·key)에서 아래로 rowSpan 행·오른쪽으로 colSpan 열을 한 칸으로 덮는다.
 *   뷰(r,c)가 아니라 **데이터(rowId·key)** 기준이라 무관한 행이 움직여도 앵커가 안 흔들린다.
 *   ⚠️ 그래도 span 은 「앵커 아래 뷰 N행」이라, 뷰 순서를 바꾸는 sort·filter·virtual 과는 conflicts 다.
 */
export interface MergeRegion { rowId: string; key: string; rowSpan: number; colSpan: number }

/** 칸 검증 결과(M2 validate) — 손님(③)이 돌려준다. 저장을 막지는 않는다(빨강/노랑 테두리 + 툴팁). */
export interface CellValidation { level: 'bad' | 'warn'; message?: string }

/** 커밋을 일으킨 동작 — 손님이 분기에 쓸 수 있게 싣는다. */
export type TableTxSource = 'edit' | 'paste' | 'fill' | 'clear' | 'menu' | 'drag';

/**
 * 🔴 한 번 = undo 한 단위. 칸 변경·행 넣기/빼기/옮기기·열 조작·행 높이 조정을 한 객체로.
 *   붙여넣기 50칸도, 범위 지우기도 트랜잭션 하나다.
 */
export interface TableTx {
    cells: CellChange[];
    rows?: {
        /** ids: 편집기가 미리 매긴 새 행 id(내장 되돌리기가 add↔remove 를 짝 맞추려면 필요). 소유자는 있으면 그대로 쓴다. */
        add?: { at: number; count: number; cells?: Record<string, string>[]; ids?: string[] }[];
        remove?: string[];
        move?: { id: string; to: number }[];
        /** 행 머리 이름 고치기(row-head + axis-edit) — 행 머리 더블클릭. */
        rename?: { id: string; label: string }[];
    };
    cols?: {
        add?: { at: number; key: string; title: string }[];
        remove?: string[];
        resize?: { key: string; width: number }[];
        /** 머리 이름 고치기(M2 axis-edit). */
        rename?: { key: string; title: string }[];
        /** 열 순서 바꾸기(v3 — 손잡이 끌기). to 는 「옮긴 뒤」 index. */
        move?: { key: string; to: number }[];
    };
    /** 경계 끌기(M2 row-weight) — 밀지 말지는 소유자가 정한다. */
    axis?: {
        rowWeight?: { id: string; delta: number }[];
        /** 행 앞 틈 끌기(row-gaps) — 그 행 위 틈 크기를 delta(px)만큼. 뜻(분·쉬는 시간)은 소유자가 정한다. */
        rowGap?: { id: string; delta: number }[];
    };
    /** 칸 병합·해제(M2 merge). set 은 앵커를 더하거나 덮고, clear 는 앵커를 푼다. */
    merge?: { set?: MergeRegion[]; clear?: { rowId: string; key: string }[] };
    source: TableTxSource;
}

/** 바탕 틴트 — 토큰 이름으로만(하드코딩 색 금지). 색 메뉴·decorate 가 쓴다. */
export type CellTone = 'accent' | 'ok' | 'bad' | 'warn' | 'muted';

/** 칸 꾸밈 — ③(손님)이 글자를 해석해 돌려준다(M2 decorate). 색은 토큰 이름으로만. */
export interface CellDecoration {
    tone?: CellTone;
    badge?: string;
    title?: string;
}

/** 머리 메뉴 한 줄 — ③(손님)이 더한다(M2 headerMenu). 동작은 commandId 또는 onSelect. */
export interface HeaderMenuEntry { label: string; commandId?: string; onSelect?: () => void }

/** 글자 바꿀 수 있는 자리 — 손님이 labels 로 덮는다. */
export interface TableLabels {
    addRow: string;
    addCol: string;
    emptyHint: string;
    rowMenuTitle: string;
    insertAbove: string;
    insertBelow: string;
    deleteRow: string;
    moveUp: string;
    moveDown: string;
    insertColLeft: string;
    insertColRight: string;
    deleteCol: string;
    renameCol: string;
    mergeCells: string;
    unmergeCells: string;
}

/** 엔진 상태 읽기 — 기능 모듈·호스트가 본다. */
export interface TableState {
    active: CellPos;
    anchor: CellPos;
    sel: { r1: number; r2: number; c1: number; c2: number };
    editing: boolean;
    rowCount: number;
    colCount: number;
}

/** 붙여넣기가 표보다 클 때 — 행을 더한다(append) / 잘라낸다(clip). */
export type PasteOverflow = 'append' | 'clip';

/**
 * 편집기가 켠 능력 — 손님/다른 모듈이 읽을 수 있게 기능 모듈이 켠다. Table 이 이걸 보고 무엇을 그릴지 정한다.
 *   M1: rows·fill·history. M2: col-resize·sticky-headers·row-weight·axis-edit·col-types·validate·merge.
 */
export type TableCapability =
    | 'rows' | 'fill' | 'history'
    | 'col-resize' | 'sticky-headers' | 'row-weight' | 'axis-edit' | 'col-types' | 'validate' | 'merge'
    | 'quick-calc' | 'table-style'
    /** 리치 셀 2단계 — 시간표 같은 손님이 확장하는 자리: 행 머리 열(label·sub) · 행 사이 틈(rowGap) */
    | 'row-head' | 'row-gaps';

/**
 * M5(넘버스) 표 스타일 — 프리셋 넷. 색은 토큰 조합의 이름일 뿐(하드코딩 색 0).
 *   basic 칸선 전부 · lined 가로선만 · striped 칸선 + 교대 행 · headed 머리 강조 + 교대 행.
 */
export type TableStylePreset = 'basic' | 'lined' | 'striped' | 'headed';

/**
 * 🔴 기능이 엔진에 손대는 창구 전부 — 이 밖은 없다(0.1). cell/header 렌더 주입·clipboard 파서는 M2 에서 넓힌다.
 *   install 안에서 이것들로 건 Disposable 은 조립기가 모아 표가 사라질 때 거둔다.
 */
export interface FeatureCtx {
    /** 키 한 벌 더하기 — 다른 모듈과 겹치면 조립기가 그 자리에서 던진다. */
    keymap: { add(key: string, run: () => void): Disposable };
    /** 붙여넣기 넘침 정책 — paste-policy 모듈이 정한다(append 와 clip 은 서로 conflicts). */
    paste: { overflow(policy: PasteOverflow): Disposable };
    /** 확정 직전 트랜잭션을 손본다(검증·서식 — M2 validate 가 쓴다). 여러 개면 등록 순서대로. */
    commit: { wrap(fn: (tx: TableTx) => TableTx): Disposable };
    /** 이 표가 켜는 능력 — rows(행 조작) · fill(채우기 핸들) · history(내장 되돌리기). */
    capabilities: { enable(cap: TableCapability): void };
    /** 엔진 상태 읽기·구독. */
    state: { get(): TableState; on(fn: () => void): Disposable };
}

/** 기능 모듈 — 객체 하나. 소비자가 목록으로 조립한다(needs 위상 · conflicts 던짐). */
export interface TableFeature {
    id: string;
    version: string;
    needs?: string[];
    conflicts?: string[];
    install(ctx: FeatureCtx): Disposable | void;
}

/**
 * 손님이 받는 전부(TableProps) — columns·rows 는 props 로 받고 편집기는 **안 들고 있다**(controlled).
 *   되돌리기는 기본 「소유자」(onUndo/onRedo). 없고 history 모듈을 끼우면 내장 스택이 선다.
 */
export interface TableProps {
    columns: TableColumn[];
    rows: TableRow[];
    onCommit(tx: TableTx): void;
    /** id(내장·등록) 또는 모듈 객체 — 비우면 기본 묶음(rows·fill·paste-policy:append·history). */
    features?: (string | TableFeature)[];
    onUndo?(): void;
    onRedo?(): void;
    /** ③ 글자 해석(M2 decorate) — 손님이 칸 글자를 읽어 tone/badge/title 로 꾸민다. */
    decorate?(rowId: string, key: string, value: string): CellDecoration | undefined;
    /** ③ 칸 검증(M2 validate) — validate 기능이 켜졌을 때만 쓴다. 손님이 틀린 칸을 알려 준다(저장은 안 막는다). */
    validate?(rowId: string, key: string, value: string): CellValidation | undefined;
    /** ③ 머리 메뉴(M2 headerMenu) — 손님이 행·열 머리 우클릭 메뉴에 줄을 더한다. */
    headerMenu?(kind: 'row' | 'col', id: string): HeaderMenuEntry[];
    /** 🔴 병합 영역(M2 merge) — 소유자가 쥔다(controlled). 편집기는 onCommit 의 tx.merge 로 바꿔 달라고만 한다. */
    merges?: MergeRegion[];
    /** v3 노션식 — 첫 줄을 머리 행으로(옅은 바탕·굵게). 소유자가 쥔다(controlled). */
    headerRow?: boolean;
    /** v3 노션식 — 첫 칸을 머리 열로. */
    headerCol?: boolean;
    /** v3 — 열 제목 줄(thead 제목)을 감춘다(노션 단순 표: 열 이름 없음). 손잡이는 그대로 뜬다. */
    hideColHeader?: boolean;
    /** M5d — 표 위 도구 막대(되돌리기·복사·행/열 넣기·지우기·합치기·표 메뉴). 표 노드 화면이 켠다. */
    toolbar?: boolean;
    /** 툴바를 그릴 자리 — 창틀 Frame 의 toolbar 자리 요소. 주면 단추를 거기에 그린다(본문 스크롤 밖 고정). 없으면 표 위에 인라인. */
    toolbarHost?: HTMLElement | null;
    /** 행·열을 손으로 지웠다(내장 되돌리기 소유일 때) — undo 는 그 지우기를 되돌리고, isTop 은 뒤에 다른 작업이 안 쌓였나. 알림 「되돌리기」용. */
    onRemoved?: (kind: '행' | '열' | '병합', n: number, undo: () => void, isTop: () => boolean) => void;
    /** S1 — 열 머리(A·B·C…) 탭을 포커스 없이도 늘 보인다. 소유자가 쥔다. */
    colTabs?: boolean;
    /** 열 머리(A·B·C…) 줄과 행 번호 탭을 아예 안 그린다 — 열 제목·행 머리가 따로 있는 손님(시간표)용. 기본 꺼짐. */
    hideHandles?: boolean;
    /** v3 머리 토글 — 손잡이 메뉴에서 머리 행/열을 켜고 끈다(소유자가 저장). */
    onSetHeaderRow?(v: boolean): void;
    onSetHeaderCol?(v: boolean): void;
    /** v3 색 — 손잡이 메뉴에서 행·열 바탕 틴트를 고른다(소유자가 저장 → decorate 로 되비친다). undefined 는 색 없음. */
    onColor?(kind: 'row' | 'col', id: string, tone?: CellTone): void;
    /** M5 넘버스 — 마지막 줄을 꼬리 행으로(머리처럼 칠하고 합계 바·채우기에서 뺀다). 소유자가 쥔다. */
    footerRow?: boolean;
    onSetFooterRow?(v: boolean): void;
    /** M5 넘버스 — 표 스타일 프리셋(table-style 기능). 소유자가 쥔다. 없으면 basic. */
    tableStyle?: TableStylePreset;
    onSetTableStyle?(s: TableStylePreset): void;
    /**
     * 칸 글자 그리기 — 주면 (편집 중이 아닌) 칸 글자를 이걸로 그린다. 리치 셀(마크다운·노드 칩)을 꽂는 자리.
     *   🔴 저장은 그대로 글자다(복사·되돌리기·병합은 글자로 돈다) — 그리기만 바뀐다. 없으면 맨 글자.
     */
    renderText?(value: string): ReactNode;
    /** 칸 편집 중 `@` — 주면 고르기(Picker)를 띄워 고른 노드를 token(id) 글자로 `@` 자리에 넣는다. */
    mention?: {
        Picker: ComponentType<{ anchor: DOMRect; onPick(nodeId: string): void; onClose(): void }>;
        token(nodeId: string): string;
    };
    /**
     * 행 앞 틈(row-gaps 기능) — 행마다 그 행 **위** 빈 띠의 크기(px)와 글씨. undefined 면 틈 줄이 없다.
     *   틈은 칸이 아니다(선택·복사·이동이 건너뛴다). 아래 끝을 끌면 tx.axis.rowGap 으로 올린다.
     */
    rowGap?(rowId: string): { size: number; label?: string } | undefined;
    /** 행 머리 열 폭(row-head 기능) — 기본 76px */
    rowHeadWidth?: number;
    /** 고른 범위가 바뀔 때(뷰 좌표) — 손님이 자기 툴바를 고른 행에 맞출 때 */
    onSelectionChange?(sel: { r1: number; r2: number; c1: number; c2: number }): void;
    labels?: Partial<TableLabels>;
    emptyHint?: string;
    className?: string;
}

/** host.modules 로 받는 table 모듈 — 손님이 쓰는 전부. */
export interface TableApi {
    version: 1;
    Table: ComponentType<TableProps>;
    /** 다른 플러그인이 새 기능 모듈을 전역으로 꽂는 길(런타임 · Disposable). */
    features: { list(): string[]; register(f: TableFeature): Disposable };
    /** TSV 왕복 — 손님이 직접 파싱·생성할 때. */
    parseClipboard(text: string): string[][];
    toTsv(cells: string[][]): string;
}
