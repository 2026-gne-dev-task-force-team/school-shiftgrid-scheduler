/**
 * 🔴 약속 「table」 0.1 — 범용 표(스프레드시트식) 편집기. 타입만(값 0).
 *   한 칸 = 한 글자, (r,c) 뷰 좌표만 안다. 요일·교시·사람 같은 도메인은 모른다(손님이 밖에서 꽂는다).
 *   제공자: table-editor(provides: table). 손님은 host.modules 로 table 모듈(TableApi)을 받아 Table 컴포넌트를 쓴다.
 *
 * ⭐ 범용 바닥(core:true) — 쥔님 2026-11-08 16:20 *"범용 표야"*. ⛔ 흡수한 엔진(옛 도메인 부품)의 이름을 여기 남기지 않는다.
 * ⭐ 「한 번 확정 = undo 한 단위」가 뼈대다(TableTx 하나 = 되돌리기 한 칸). 병합(merge)은 M2 — 모델이 막지 않게만 둔다.
 */
import type { ComponentType } from 'react';
import type { Disposable } from '../../pane-ui-system/plugin';

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

/** 커밋을 일으킨 동작 — 손님이 분기에 쓸 수 있게 싣는다. */
export type TableTxSource = 'edit' | 'paste' | 'fill' | 'clear' | 'menu' | 'drag';

/**
 * 🔴 한 번 = undo 한 단위. 칸 변경·행 넣기/빼기/옮기기·열 조작·행 높이 조정을 한 객체로.
 *   붙여넣기 50칸도, 범위 지우기도 트랜잭션 하나다.
 */
export interface TableTx {
    cells: CellChange[];
    rows?: {
        add?: { at: number; count: number; cells?: Record<string, string>[] }[];
        remove?: string[];
        move?: { id: string; to: number }[];
    };
    cols?: {
        add?: { at: number; key: string; title: string }[];
        remove?: string[];
        resize?: { key: string; width: number }[];
    };
    /** 경계 끌기(M2 row-weight) — 밀지 말지는 소유자가 정한다. */
    axis?: { rowWeight?: { id: string; delta: number }[] };
    source: TableTxSource;
}

/** 칸 꾸밈 — ③(손님)이 글자를 해석해 돌려준다(M2 decorate). 색은 토큰 이름으로만. */
export interface CellDecoration {
    tone?: 'accent' | 'ok' | 'bad' | 'warn' | 'muted';
    badge?: string;
    title?: string;
}

/** 머리 메뉴 한 줄 — ③(손님)이 더한다(M2 headerMenu). 동작은 commandId 또는 onSelect. */
export interface HeaderMenuEntry { label: string; commandId?: string; onSelect?: () => void }

/** 글자 바꿀 수 있는 자리 — 손님이 labels 로 덮는다. */
export interface TableLabels {
    addRow: string;
    emptyHint: string;
    rowMenuTitle: string;
    insertAbove: string;
    insertBelow: string;
    deleteRow: string;
    moveUp: string;
    moveDown: string;
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

/** 편집기가 켠 능력 — 손님/다른 모듈이 읽을 수 있게 기능 모듈이 켠다. */
export type TableCapability = 'rows' | 'fill' | 'history';

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
    /** ③ 글자 해석(M2) — 지금은 받아 두기만 한다. */
    decorate?(rowId: string, key: string, value: string): CellDecoration | undefined;
    /** ③ 머리 메뉴(M2). */
    headerMenu?(kind: 'row' | 'col', id: string): HeaderMenuEntry[];
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
