/**
 * 엔진이 쓰는 자료형 — 범용 표 엔진(옛 도메인 부품에서 흡수 · 이름은 전부 범용으로).
 *   좌표는 늘 '뷰' 좌표(화면에 보이는 행·열)다. 뷰↔데이터 변환은 Table 의 adapter 가 한다.
 */

/** 한 칸에 들어갈 글자 변경 — 뷰 좌표(r,c) 기준. 파싱·행 성장은 adapter.commit 이 한다. */
export interface CellChange {
    r: number;
    c: number;
    text: string;
}

export interface CellPos {
    r: number;
    c: number;
}

/** 커밋을 일으킨 동작 — adapter.commit 이 받아 TableTx.source 로 올린다. */
export type CommitSource = 'edit' | 'paste' | 'fill' | 'clear';

/** 엔진이 한 표에서 알아야 하는 전부. Table 이 columns/rows 로 이걸 채워 넘긴다. */
export interface SheetCoreAdapter {
    /** 커서가 오갈 수 있는 행 수(맨 아래 「새 행」 자리를 포함하면 +1). */
    rowCount: number;
    /** 실제 데이터 행 수(지우기·전체선택의 아래 끝). */
    dataRowCount: number;
    colCount: number;
    /** 복사·채우기에 쓰는 '날 것' 글자. */
    getText: (r: number, c: number) => string;
    /** 그 칸이 글자를 받을 수 있나(열이 읽기전용이면 false). 행 범위는 보지 않는다. */
    editable: (r: number, c: number) => boolean;
    /** 한 번 = undo 한 단위. 글자 + 동작 종류를 받아 Table 이 트랜잭션으로 올린다. */
    commit: (changes: CellChange[], source: CommitSource) => void;
    /** 그 칸의 성격 — 'toggle'(편집창 없이 뒤집음) · 'edit'(편집창) · 'readonly'. */
    cellKind: (r: number, c: number) => 'toggle' | 'edit' | 'readonly';
    /** 편집창을 열 때 처음 넣을 글자. typed 는 글자 키로 열렸을 때 그 글자. */
    editInitial: (r: number, c: number, typed?: string) => string;
    /** 'toggle' 칸을 뒤집는다. */
    toggle?: (r: number, c: number) => void;
    onUndo?: () => void;
    onRedo?: () => void;
}

/** 테스트·호스트가 쓰는 명령형 손잡이. */
export interface SheetCoreHandle {
    focus: () => void;
    state: () => { active: CellPos; anchor: CellPos; editing: boolean; rows: number };
    click: (r: number, c: number) => void;
    select: (r1: number, c1: number, r2: number, c2: number) => void;
    beginEditAt: (r: number, c: number) => void;
    type: (s: string, r?: number, c?: number) => void;
    setText: (s: string) => void;
    commit: () => void;
    commitPick: (text: string) => void;
    press: (key: string) => void;
    paste: (tsv: string, r?: number, c?: number) => void;
    copy: () => string;
    fill: (toR: number) => void;
    clear: () => void;
}
