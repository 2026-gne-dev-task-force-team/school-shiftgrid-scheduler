/**
 * Table — 범용 표의 「얼굴 하나」. 엔진(useSheetCore) + 조립된 기능 모듈을 얹어 그린다.
 *   🔴 데이터를 안 들고 있다(controlled) — columns·rows·merges 를 props 로 받고, 확정은 onCommit(tx) 로 통째로 올린다.
 *      그래서 같은 데이터를 두 탭에 열면 한쪽 편집이 다른 쪽에 바로 비친다.
 *   🔴 한 번 확정 = TableTx 하나 = undo 한 단위. 되돌리기는 기본 소유자(onUndo/onRedo), 없고 history 모듈이 끼면 내장 스택.
 *   ⛔ 색은 토큰 클래스만(bg-panel·border-line·ring-accent …) — 하드코딩 색 0(구조 검사 ①).
 *
 *   v3(2026-11-08): 얼굴을 노션 「페이지 안 단순 표 블록」으로 다시 지었다 — 행 번호·툴바·설명문·「줄 추가」 단추 ⛔.
 *     · 표에 마우스를 올리면 행은 왼쪽 바깥에 ⋮⋮ 손잡이, 열은 위에 ⋮⋮ 손잡이가 뜬다(손잡이 = 고르기 + 메뉴 + 끌어서 순서).
 *     · 오른쪽 가장자리 + 막대(열 추가)·아래 가장자리 + 막대(행 추가) · 열 경계를 끌면 너비(파란 세로선).
 *     · 범위를 고르면 파란 테두리 + 떠있는 「칸 합치기」 · 우클릭 메뉴로도 합치기/풀기/내용 지우기.
 *     · 머리 행/열 켜기(옅은 바탕)·색은 첫 손잡이 메뉴에서. 엔진·기능 모듈(엑셀식 키·IME·붙여넣기·병합)은 그대로.
 */
import {
    forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState,
} from 'react';
import { useSheetCore } from './core/useSheetCore';
import type { CellChange, CommitSource, SheetCoreAdapter, SheetCoreHandle } from './core/types';
import type {
    CellChange as TxCellChange, CellTone, HeaderMenuEntry, TableCapability, TableColumn, TableProps, TableRow, TableState, TableTx,
    TableStylePreset,
} from './contracts/table';
import { quickCalc, fmtNum } from './core/quickcalc';
import { buildConfig } from './features/install';
import { DEFAULT_FEATURES } from './features/modules';
import { lookupFeature } from './features/registry';
import { buildMergeMap, regionFromSelection, anchorCovering } from './core/merge';
import { inverseTx, txHasEffect } from './core/history';
import { isChecked, toggledValue } from './core/coltypes';
import { Menu, type MenuItem } from './Menu';

export type { SheetCoreHandle as TableHandle };

const EMPTY_STATE: TableState = {
    active: { r: 0, c: 0 }, anchor: { r: 0, c: 0 },
    sel: { r1: 0, r2: 0, c1: 0, c2: 0 }, editing: false, rowCount: 0, colCount: 0,
};

/** decorate 의 tone → 바탕 틴트 토큰 클래스. */
const TONE_BG: Record<string, string> = {
    accent: 'bg-accent/15', ok: 'bg-ok/15', bad: 'bg-bad/15', warn: 'bg-warn/15', muted: 'bg-muted/10',
};

/** 색 메뉴에 올리는 틴트 — 라벨 + tone(없음은 undefined). 색은 토큰 이름으로만(구조 검사 ①). */
const TONE_CHOICES: { label: string; tone?: CellTone }[] = [
    { label: '색 없음', tone: undefined },
    { label: '강조색', tone: 'accent' },
    { label: '초록색', tone: 'ok' },
    { label: '노란색', tone: 'warn' },
    { label: '빨간색', tone: 'bad' },
    { label: '회색', tone: 'muted' },
];

export const Table = forwardRef<SheetCoreHandle, TableProps>(function Table(props, ref) {
    const {
        columns, rows, onCommit, features, onUndo, onRedo, emptyHint, labels, className,
        decorate, validate, headerMenu, merges,
        headerRow, headerCol, hideColHeader, onSetHeaderRow, onSetHeaderCol, onColor,
        footerRow, onSetFooterRow, tableStyle, onSetTableStyle,
    } = props;

    const stateRef = useRef<TableState>(EMPTY_STATE);
    const outerRef = useRef<HTMLDivElement>(null);   // 바깥 래퍼 — 떠있는 알약을 스크롤러 바깥에 띄운다(안 잘리게)
    const config = buildConfig(features ?? DEFAULT_FEATURES, lookupFeature, () => stateRef.current);
    const has = (c: TableCapability): boolean => config.caps.has(c);
    const hasRows = has('rows');
    const hasFill = has('fill');
    const hasColResize = has('col-resize');
    const hasSticky = has('sticky-headers');
    const hasRowWeight = has('row-weight');
    const hasAxisEdit = has('axis-edit');
    const hasColTypes = has('col-types');
    const hasValidate = has('validate');
    const hasMerge = has('merge');
    const hasQuickCalc = has('quick-calc');
    const preset: TableStylePreset = has('table-style') ? tableStyle ?? 'basic' : 'basic';
    const historyOwned = !onUndo && has('history');
    // 머리 행·꼬리 행(넘버스) — 채우기 씨앗·합계 바에서 뺀다. 꼬리는 줄이 둘 이상일 때만.
    const isHeadRow = (r: number): boolean => !!headerRow && r === 0;
    const isFootRow = (r: number): boolean => !!footerRow && rows.length > 1 && r === rows.length - 1;

    // 내장 되돌리기 스택(역트랜잭션) — 소유자가 undo 를 안 쥘 때만 선다.
    const undoStack = useRef<TableTx[]>([]);
    const redoStack = useRef<TableTx[]>([]);
    const applyingHistory = useRef(false);
    const rowsRef = useRef(rows); rowsRef.current = rows;
    const colsRef = useRef(columns); colsRef.current = columns;
    const mergesRef = useRef(merges); mergesRef.current = merges;

    // 편집기가 매기는 새 id(행·열) — 내장 되돌리기가 add↔remove 를 짝 맞추려면 안정된 id 가 필요하다.
    const idSeq = useRef(0);
    const genIds = (n: number): string[] => Array.from({ length: n }, () => `tbl_${idSeq.current++}`);
    const genColKey = (): string => `col_${idSeq.current++}`;

    const colOf = (c: number) => columns[c];
    const idByView = (r: number) => (r < rows.length ? rows[r].id : undefined);

    const emit = (tx: TableTx, fromHistory: boolean): void => {
        let out = tx;
        for (const w of config.commitWrappers) out = w(out);
        if (historyOwned && !fromHistory && txHasEffect(out)) {
            undoStack.current.push(inverseTx(out, rowsRef.current, colsRef.current, mergesRef.current));
            redoStack.current = [];
        }
        onCommit(out);
    };

    const internalUndo = (): void => {
        const tx = undoStack.current.pop();
        if (!tx) return;
        redoStack.current.push(inverseTx(tx, rowsRef.current, colsRef.current, mergesRef.current));
        applyingHistory.current = true; emit(tx, true); applyingHistory.current = false;
    };
    const internalRedo = (): void => {
        const tx = redoStack.current.pop();
        if (!tx) return;
        undoStack.current.push(inverseTx(tx, rowsRef.current, colsRef.current, mergesRef.current));
        applyingHistory.current = true; emit(tx, true); applyingHistory.current = false;
    };

    /** 엔진의 (r,c) 커밋 → TableTx. 넘치는 행은 붙여넣기 정책/rows 능력에 따라 행 추가 또는 버림. */
    const handleCommit = (input: CellChange[], source: CommitSource): void => {
        let changes = input;
        if (source === 'fill') {
            // 넘버스 — 머리·꼬리 칸은 채우기 씨앗이 못 되고 채워지지도 않는다.
            if (isHeadRow(core.sel.r1) || isFootRow(core.sel.r1)) return;
            changes = changes.filter((ch) => !isHeadRow(ch.r) && !isFootRow(ch.r));
        }
        const cells: TxCellChange[] = [];
        const overflow = new Map<number, Record<string, string>>();
        for (const ch of changes) {
            const col = colOf(ch.c);
            if (!col) continue;
            const id = idByView(ch.r);
            if (id != null) cells.push({ rowId: id, key: col.key, value: ch.text });
            else {
                const k = ch.r - rows.length;
                const rec = overflow.get(k) ?? {};
                rec[col.key] = ch.text;
                overflow.set(k, rec);
            }
        }
        const wantAdd = source === 'paste' ? config.pasteOverflow === 'append' : hasRows;
        let rowsTx: TableTx['rows'];
        if (overflow.size && wantAdd) {
            const count = Math.max(...overflow.keys()) + 1;
            const cellsArr: Record<string, string>[] = [];
            for (let k = 0; k < count; k++) cellsArr.push(overflow.get(k) ?? {});
            rowsTx = { add: [{ at: rows.length, count, cells: cellsArr, ids: genIds(count) }] };
        }
        if (!cells.length && !rowsTx) return;
        emit({ cells, source, ...(rowsTx ? { rows: rowsTx } : {}) }, applyingHistory.current);
    };

    /** bool 칸 뒤집기(col-types · 키보드 space/enter·체크박스 클릭). */
    const toggleCell = (r: number, c: number): void => {
        const row = rows[r]; const col = colOf(c);
        if (!row || !col) return;
        emit({ cells: [{ rowId: row.id, key: col.key, value: toggledValue(row.cells[col.key] ?? '') }], source: 'edit' }, false);
    };

    const rowCount = Math.max(1, rows.length);
    const adapter: SheetCoreAdapter = {
        rowCount,
        dataRowCount: rows.length,
        colCount: columns.length,
        getText: (r, c) => (r < rows.length ? rows[r].cells[colOf(c)?.key ?? ''] ?? '' : ''),
        editable: (_r, c) => { const col = colOf(c); return !!col && !col.readOnly; },
        commit: handleCommit,
        cellKind: (r, c) => {
            const col = colOf(c);
            if (!col || col.readOnly) return 'readonly';
            if (hasColTypes && col.type === 'bool' && r < rows.length) return 'toggle';
            return 'edit';
        },
        editInitial: (r, c, typed) => (typed != null ? typed : (r < rows.length ? rows[r].cells[colOf(c)?.key ?? ''] ?? '' : '')),
        toggle: toggleCell,
        onUndo: onUndo ?? (historyOwned ? internalUndo : undefined),
        onRedo: onRedo ?? (historyOwned ? internalRedo : undefined),
        insert: hasRows ? (axis, at) => {
            if (axis === 'row') insertRow(at);
            else if (hasAxisEdit) addColAt(at);
        } : undefined,
    };

    const core = useSheetCore(adapter);
    stateRef.current = {
        active: core.active, anchor: core.anchor, sel: core.sel,
        editing: !!core.edit, rowCount, colCount: columns.length,
    };
    useImperativeHandle(ref, () => core.handle, [core.handle]);

    const lb = {
        addRow: labels?.addRow ?? '줄 추가',
        addCol: labels?.addCol ?? '칸 추가',
        emptyHint: emptyHint ?? labels?.emptyHint ?? '빈 표 — 오른쪽·아래 + 를 눌러 칸과 줄을 더한다.',
        deleteRow: labels?.deleteRow ?? '줄 지우기',
        insertAbove: labels?.insertAbove ?? '위에 줄 넣기', insertBelow: labels?.insertBelow ?? '아래에 줄 넣기',
        dupRow: '줄 복제', dupCol: '칸 복제', clearRow: '내용 지우기', clearCol: '내용 지우기',
        insertColLeft: labels?.insertColLeft ?? '왼쪽에 칸 넣기', insertColRight: labels?.insertColRight ?? '오른쪽에 칸 넣기',
        deleteCol: labels?.deleteCol ?? '이 칸 지우기', renameCol: labels?.renameCol ?? '이름 바꾸기',
        mergeCells: labels?.mergeCells ?? '칸 합치기', unmergeCells: labels?.unmergeCells ?? '합친 칸 풀기',
        headerRowOn: '머리 행 켜기', headerRowOff: '머리 행 끄기',
        headerColOn: '머리 열 켜기', headerColOff: '머리 열 끄기',
    };

    const showColHandles = hasAxisEdit && !emptyGrid();
    function emptyGrid(): boolean { return columns.length === 0; }
    const mergeMap = buildMergeMap(merges, rows, columns);

    // ── 행·열 조작 ────────────────────────────────────────────
    const insertRow = (at: number): void => emit({ cells: [], rows: { add: [{ at, count: 1, cells: [{}], ids: genIds(1) }] }, source: 'menu' }, false);
    const removeRow = (id: string): void => emit({ cells: [], rows: { remove: [id] }, source: 'menu' }, false);
    const moveRow = (id: string, to: number): void => emit({ cells: [], rows: { move: [{ id, to }] }, source: 'drag' }, false);
    const duplicateRow = (viewR: number): void => {
        const row = rows[viewR]; if (!row) return;
        emit({ cells: [], rows: { add: [{ at: viewR + 1, count: 1, cells: [{ ...row.cells }], ids: genIds(1) }] }, source: 'menu' }, false);
    };
    const clearRow = (row: TableRow): void => {
        const cells = columns.filter((c) => !c.readOnly).map((c) => ({ rowId: row.id, key: c.key, value: '' }));
        if (cells.length) emit({ cells, source: 'clear' }, false);
    };

    const addColAt = (at: number): void => {
        const key = genColKey();
        emit({ cells: [], cols: { add: [{ at, key, title: lb.addCol }] }, source: 'menu' }, false);
    };
    const removeCol = (key: string): void => emit({ cells: [], cols: { remove: [key] }, source: 'menu' }, false);
    const moveCol = (key: string, to: number): void => emit({ cells: [], cols: { move: [{ key, to }] }, source: 'drag' }, false);
    const renameCol = (key: string, title: string): void => emit({ cells: [], cols: { rename: [{ key, title }] }, source: 'menu' }, false);
    const duplicateCol = (idx: number): void => {
        const src = columns[idx]; if (!src) return;
        const key = genColKey();
        const cells = rows.map((row) => ({ rowId: row.id, key, value: row.cells[src.key] ?? '' }));
        emit({ cells, cols: { add: [{ at: idx + 1, key, title: src.title }] }, source: 'menu' }, false);
    };
    const clearCol = (key: string): void => {
        const cells = rows.map((row) => ({ rowId: row.id, key, value: '' }));
        if (cells.length) emit({ cells, source: 'clear' }, false);
    };

    const mergeSelection = (): void => {
        const region = regionFromSelection(core.sel, rows, columns);
        if (region) emit({ cells: [], merge: { set: [region] }, source: 'menu' }, false);
    };
    const unmergeAtActive = (): void => {
        const a = anchorCovering(merges, core.active.r, core.active.c, rows, columns);
        if (a) emit({ cells: [], merge: { clear: [{ rowId: a.rowId, key: a.key }] }, source: 'menu' }, false);
    };

    // ── 열 폭 끌기(col-resize) ────────────────────────────────
    const [liveResize, setLiveResize] = useState<{ key: string; width: number } | null>(null);
    const resizeDrag = useRef<{ key: string; startX: number; startW: number; curW: number } | null>(null);
    const beginResize = (e: React.MouseEvent, key: string): void => {
        e.preventDefault(); e.stopPropagation();
        const col = columns.find((c) => c.key === key);
        const startW = col?.width ?? 120;
        resizeDrag.current = { key, startX: e.clientX, startW, curW: startW };
        setLiveResize({ key, width: startW });
    };
    const autoFitCol = (key: string): void => {
        const idx = columns.findIndex((c) => c.key === key);
        if (idx < 0) return;
        let max = columns[idx].title.length;
        for (const row of rows) max = Math.max(max, (row.cells[key] ?? '').length);
        const width = Math.max(60, Math.min(400, max * 9 + 24));
        emit({ cells: [], cols: { resize: [{ key, width }] }, source: 'menu' }, false);
    };
    useEffect(() => {
        if (!liveResize) return;
        const move = (e: MouseEvent): void => {
            const d = resizeDrag.current; if (!d) return;
            d.curW = Math.max(48, d.startW + (e.clientX - d.startX));
            setLiveResize({ key: d.key, width: d.curW });
        };
        const up = (): void => {
            const d = resizeDrag.current;
            resizeDrag.current = null;
            if (d && d.curW !== d.startW) emit({ cells: [], cols: { resize: [{ key: d.key, width: Math.round(d.curW) }] }, source: 'drag' }, false);
            setLiveResize(null);
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [liveResize?.key]);
    const widthOf = (key: string, w?: number): number | undefined => (liveResize?.key === key ? liveResize.width : w);

    // ── 행 높이 끌기(row-weight) ──────────────────────────────
    const [liveWeight, setLiveWeight] = useState<{ id: string; weight: number } | null>(null);
    const weightDrag = useRef<{ id: string; startY: number; startW: number; curW: number } | null>(null);
    const beginWeight = (e: React.MouseEvent, id: string, cur: number): void => {
        e.preventDefault(); e.stopPropagation();
        weightDrag.current = { id, startY: e.clientY, startW: cur, curW: cur };
        setLiveWeight({ id, weight: cur });
    };
    useEffect(() => {
        if (!liveWeight) return;
        const move = (e: MouseEvent): void => {
            const d = weightDrag.current; if (!d) return;
            d.curW = Math.max(24, d.startW + (e.clientY - d.startY));
            setLiveWeight({ id: d.id, weight: d.curW });
        };
        const up = (): void => {
            const d = weightDrag.current;
            weightDrag.current = null;
            if (d) {
                const snapped = Math.round(d.curW / 5) * 5;   // 5 단위 스냅
                const delta = snapped - d.startW;
                if (delta !== 0) emit({ cells: [], axis: { rowWeight: [{ id: d.id, delta }] }, source: 'drag' }, false);
            }
            setLiveWeight(null);
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [liveWeight?.id]);
    const heightOf = (row: { id: string; weight?: number }): number | undefined =>
        (liveWeight?.id === row.id ? liveWeight.weight : row.weight);

    // ── 손잡이 끌어서 순서 바꾸기(행·열) ──────────────────────
    // reorder.kind: 끄는 축 · idx: 집은 자리 · over: 떨굴 자리(앞 경계) · pos: 표시선 위치(px, 컨테이너 기준)
    const [reorder, setReorder] = useState<{ kind: 'row' | 'col'; idx: number; over: number } | null>(null);
    const reorderRef = useRef(reorder); reorderRef.current = reorder;
    const beginReorder = (e: React.MouseEvent, kind: 'row' | 'col', idx: number): void => {
        e.preventDefault(); e.stopPropagation();
        selectLine(kind, idx);
        setReorder({ kind, idx, over: idx });
    };
    useEffect(() => {
        if (!reorder) return;
        const move = (e: MouseEvent): void => {
            const cur = reorderRef.current; if (!cur) return;
            const cont = core.containerRef.current; if (!cont) return;
            const sel = cur.kind === 'row' ? '[data-row-idx]' : '[data-col-idx]';
            const els = [...cont.querySelectorAll<HTMLElement>(sel)];
            let over = els.length;
            for (let i = 0; i < els.length; i++) {
                const r = els[i].getBoundingClientRect();
                const mid = cur.kind === 'row' ? r.top + r.height / 2 : r.left + r.width / 2;
                const p = cur.kind === 'row' ? e.clientY : e.clientX;
                if (p < mid) { over = i; break; }
            }
            if (over !== cur.over) setReorder({ ...cur, over });
        };
        const up = (): void => {
            const cur = reorderRef.current;
            setReorder(null);
            if (!cur) return;
            // over 는 「그 앞」 경계. 집은 자리를 빼고 나서의 목표 index 로 환산한다.
            let to = cur.over > cur.idx ? cur.over - 1 : cur.over;
            to = Math.max(0, Math.min((cur.kind === 'row' ? rows.length : columns.length) - 1, to));
            if (to === cur.idx) return;
            if (cur.kind === 'row') { const id = rows[cur.idx]?.id; if (id != null) moveRow(id, to); }
            else { const key = columns[cur.idx]?.key; if (key != null) moveCol(key, to); }
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reorder?.kind, reorder?.idx]);

    /** 손잡이를 집으면 그 행/열 전체를 고른다(노션식). */
    const selectLine = (kind: 'row' | 'col', idx: number): void => {
        if (kind === 'row') core.handle.select(idx, 0, idx, Math.max(0, columns.length - 1));
        else core.handle.select(0, idx, Math.max(0, rows.length - 1), idx);
    };

    // ── 손잡이·+막대 띄우기(표에 마우스가 올라왔을 때) ────────
    const [hoverTable, setHoverTable] = useState(false);
    const leaveTable = (): void => { setHoverTable(false); };
    // 넘버스 — 참조 탭(A,B,C · 1,2,3)·표 손잡이는 표에 포커스가 있을 때만 뜬다.
    const [focused, setFocused] = useState(false);
    const [hoverTab, setHoverTab] = useState<number | null>(null);   // ▾ 는 마우스가 올라온 열 탭에만

    // ── 둥근 추가 단추 — 누르면 1개, 끌면 끈 만큼 여러 개(한 tx = undo 1) ──
    const ROW_STEP = 36, COL_STEP = 120;
    const [addDrag, setAddDrag] = useState<{ axis: 'row' | 'col'; start: number; n: number } | null>(null);
    const addDragRef = useRef(addDrag); addDragRef.current = addDrag;
    const draggedAdd = useRef(false);   // 끌어서 이미 더했으면 뒤따르는 click 을 삼킨다
    const addMany = (axis: 'row' | 'col', n: number): void => {
        if (axis === 'row') {
            emit({ cells: [], rows: { add: [{ at: rows.length, count: n, cells: Array.from({ length: n }, () => ({})), ids: genIds(n) }] }, source: 'drag' }, false);
        } else {
            const add = Array.from({ length: n }, (_, i) => ({ at: columns.length + i, key: genColKey(), title: lb.addCol }));
            emit({ cells: [], cols: { add }, source: 'drag' }, false);
        }
    };
    const beginAddDrag = (e: React.MouseEvent, axis: 'row' | 'col'): void => {
        if (e.button !== 0) return;
        e.preventDefault();
        draggedAdd.current = false;
        setAddDrag({ axis, start: axis === 'row' ? e.clientY : e.clientX, n: 1 });
    };
    useEffect(() => {
        if (!addDrag) return;
        const move = (e: MouseEvent): void => {
            const d = addDragRef.current; if (!d) return;
            const delta = (d.axis === 'row' ? e.clientY : e.clientX) - d.start;
            const n = Math.max(1, 1 + Math.floor(delta / (d.axis === 'row' ? ROW_STEP : COL_STEP)));
            if (n !== d.n) setAddDrag({ ...d, n });
        };
        const up = (e: MouseEvent): void => {
            const d = addDragRef.current;
            setAddDrag(null);
            if (!d) return;
            const moved = Math.abs((d.axis === 'row' ? e.clientY : e.clientX) - d.start) > 4;
            if (moved) { draggedAdd.current = true; addMany(d.axis, d.n); }
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [addDrag?.axis]);
    const clickAdd = (axis: 'row' | 'col'): void => {
        if (draggedAdd.current) { draggedAdd.current = false; return; }
        addMany(axis, 1);
    };

    // ── 머리 메뉴(손잡이) + 셀 우클릭 메뉴 ────────────────────
    const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
    const domainEntries = (kind: 'row' | 'col', id: string): MenuItem[] =>
        (headerMenu?.(kind, id) ?? []).map((e: HeaderMenuEntry) => ({ label: e.label, onClick: () => e.onSelect?.() }));
    const colorItems = (kind: 'row' | 'col', id: string): MenuItem[] =>
        onColor ? TONE_CHOICES.map((t) => ({ label: t.label, onClick: () => onColor(kind, id, t.tone) })) : [];

    // 열 머리 이름 고치기(인라인) — 제목 머리가 보일 때만.
    const [renaming, setRenaming] = useState<{ key: string; text: string } | null>(null);

    const openColMenu = (e: React.MouseEvent, key: string, idx: number): void => {
        e.preventDefault(); e.stopPropagation();
        selectLine('col', idx);
        const items: MenuItem[] = [];
        if (hasAxisEdit) {
            items.push(
                { label: lb.insertColLeft, onClick: () => addColAt(idx) },
                { label: lb.insertColRight, onClick: () => addColAt(idx + 1) },
                { label: lb.dupCol, onClick: () => duplicateCol(idx) },
            );
            if (!hideColHeader) items.push({ label: lb.renameCol, onClick: () => setRenaming({ key, text: columns[idx]?.title ?? '' }) });
            if (hasColResize) items.push({ label: '너비를 내용에 맞춤', onClick: () => autoFitCol(key) });
            items.push({ label: lb.clearCol, onClick: () => clearCol(key) });
            if (idx === 0 && onSetHeaderCol) items.push({ label: headerCol ? lb.headerColOff : lb.headerColOn, onClick: () => onSetHeaderCol(!headerCol) });
            items.push(...colorItems('col', key));
            items.push({ label: lb.deleteCol, danger: true, onClick: () => removeCol(key) });
        }
        items.push(...domainEntries('col', key));
        if (items.length) setMenu({ x: e.clientX, y: e.clientY, items });
    };
    const openRowMenu = (e: React.MouseEvent, id: string, viewR: number): void => {
        e.preventDefault(); e.stopPropagation();
        selectLine('row', viewR);
        const row = rows[viewR];
        const items: MenuItem[] = [];
        if (hasRows && row) {
            items.push(
                { label: lb.insertAbove, onClick: () => insertRow(viewR) },
                { label: lb.insertBelow, onClick: () => insertRow(viewR + 1) },
                { label: lb.dupRow, onClick: () => duplicateRow(viewR) },
                { label: lb.clearRow, onClick: () => clearRow(row) },
            );
            if (viewR === 0 && onSetHeaderRow) items.push({ label: headerRow ? lb.headerRowOff : lb.headerRowOn, onClick: () => onSetHeaderRow(!headerRow) });
            items.push(...colorItems('row', id));
            items.push({ label: lb.deleteRow, danger: true, onClick: () => removeRow(id) });
        }
        items.push(...domainEntries('row', id));
        if (items.length) setMenu({ x: e.clientX, y: e.clientY, items });
    };
    /** 표 손잡이(왼쪽 위) 메뉴 — 표 스타일 · 머리 행/열 · 꼬리 행(넘버스 「표」 탭의 작은 판). */
    const STYLE_LABEL: Record<TableStylePreset, string> = { basic: '기본', lined: '가로선', striped: '줄무늬', headed: '머리 강조' };
    const openTableMenu = (e: React.MouseEvent): void => {
        e.preventDefault(); e.stopPropagation();
        const items: MenuItem[] = [];
        if (has('table-style') && onSetTableStyle) {
            for (const p of Object.keys(STYLE_LABEL) as TableStylePreset[]) {
                items.push({ label: `${p === preset ? '✓ ' : '　'}스타일: ${STYLE_LABEL[p]}`, onClick: () => onSetTableStyle(p) });
            }
        }
        if (onSetHeaderRow) items.push({ label: headerRow ? lb.headerRowOff : lb.headerRowOn, onClick: () => onSetHeaderRow(!headerRow) });
        if (onSetHeaderCol) items.push({ label: headerCol ? lb.headerColOff : lb.headerColOn, onClick: () => onSetHeaderCol(!headerCol) });
        if (onSetFooterRow) items.push({ label: footerRow ? '꼬리 행 끄기' : '꼬리 행 켜기', onClick: () => onSetFooterRow(!footerRow) });
        if (items.length) setMenu({ x: e.clientX, y: e.clientY, items });
    };
    const selectAll = (): void => core.handle.select(0, 0, Math.max(0, rows.length - 1), Math.max(0, columns.length - 1));

    const openCellMenu = (e: React.MouseEvent, r: number, c: number): void => {
        if (r >= rows.length) return;
        // 우클릭한 칸이 선택 밖이면 그 칸을 고른다(노션식).
        if (!core.inSel(r, c)) core.handle.click(r, c);
        const items: MenuItem[] = [];
        if (hasMerge) {
            const region = regionFromSelection(core.sel, rows, columns);
            const covered = anchorCovering(merges, core.active.r, core.active.c, rows, columns);
            if (region) items.push({ label: lb.mergeCells, onClick: mergeSelection });
            if (covered) items.push({ label: lb.unmergeCells, onClick: unmergeAtActive });
        }
        items.push({ label: lb.clearRow, onClick: () => core.handle.clear() });
        if (items.length) { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, items }); }
    };

    const sel = core.sel;
    const stickyColHandleCls = hasSticky ? 'sticky top-0 z-20' : '';

    // ── 선택 테두리 한 겹 — 고른 범위를 2px 파란 상자로 통째로 감싼다(칸마다 테두리를 박지 않아 이중선·어긋남이 안 난다) ──
    //    칸 안쪽 옅은 파란 바탕은 칸이 직접 칠한다(bg-accent/10) — 병합 칸도 자연히 덮인다.
    const [selRect, setSelRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
    useLayoutEffect(() => {
        const cont = core.containerRef.current; if (!cont) return;
        // 범위 안에서 실제로 그려진 칸들의 바깥 경계를 모은다(덮인 병합 칸은 그 앵커 하나로 이미 덮여 있다).
        let minL = Infinity, minT = Infinity, maxR = -Infinity, maxB = -Infinity;
        const cells = cont.querySelectorAll<HTMLElement>('[data-rc]');
        const cr = cont.getBoundingClientRect();
        cells.forEach((el) => {
            const rc = el.getAttribute('data-rc'); if (!rc) return;
            const [cr0, cc0] = rc.split(':').map(Number);
            if (cr0 < sel.r1 || cr0 > sel.r2 || cc0 < sel.c1 || cc0 > sel.c2) return;
            const b = el.getBoundingClientRect();
            minL = Math.min(minL, b.left); minT = Math.min(minT, b.top);
            maxR = Math.max(maxR, b.right); maxB = Math.max(maxB, b.bottom);
        });
        if (minL === Infinity) { setSelRect(null); return; }
        setSelRect({
            left: minL - cr.left + cont.scrollLeft, top: minT - cr.top + cont.scrollTop,
            width: maxR - minL, height: maxB - minT,
        });
    }, [sel.r1, sel.c1, sel.r2, sel.c2, rows, columns, merges, liveResize, liveWeight, core.containerRef]);

    const invalidCount = hasValidate && validate
        ? rows.reduce((n, row) => n + columns.filter((col) => validate(row.id, col.key, row.cells[col.key] ?? '')).length, 0)
        : 0;

    const showColTitles = !hideColHeader;

    // ── 하단 합계 바(quick-calc) — 범위면 합·평균·최소·최대·개수, 칸 하나면 그 칸 원래 값 ──
    const multi = sel.r1 !== sel.r2 || sel.c1 !== sel.c2;
    let calcText: string | null = null;
    if (hasQuickCalc && focused && rows.length && columns.length) {
        if (multi) {
            const texts: string[] = [];
            for (let r = sel.r1; r <= Math.min(sel.r2, rows.length - 1); r++) {
                if (isHeadRow(r) || isFootRow(r)) continue;
                for (let c = sel.c1; c <= sel.c2; c++) texts.push(rows[r].cells[columns[c]?.key ?? ''] ?? '');
            }
            const q = quickCalc(texts);
            calcText = q
                ? (q.nums ? `합계 ${fmtNum(q.sum)}   평균 ${fmtNum(q.avg)}   최솟값 ${fmtNum(q.min)}   최댓값 ${fmtNum(q.max)}   개수 ${q.count}` : `개수 ${q.count}`)
                : '';
        } else {
            calcText = rows[core.active.r]?.cells[columns[core.active.c]?.key ?? ''] ?? '';
        }
    }
    const colLetter = (i: number): string => {
        let s = ''; let n = i + 1;
        while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
        return s;
    };
    const tabsOn = focused || reorder != null;

    return (
        <div ref={outerRef} className={`relative text-[13px] ${className ?? ''}`}>
            {hasValidate && invalidCount > 0 && (
                <div className="mb-1 text-[11px] text-bad tabular-nums">확인 필요 {invalidCount}곳</div>
            )}
            {/* 떠있는 + 막대는 스크롤러(overflow-auto) 밖에 둬야 표 가장자리에서 안 잘린다.
                이 래퍼가 표 + 오른쪽·아래 16px 투명 띠를 함께 감싸 호버 범위로 쓴다 — 쉬는 상태엔 자국이 없다(투명 여백). */}
            <div
                className="relative w-max max-w-full pr-4 pb-4"
                onMouseEnter={() => setHoverTable(true)}
                onMouseLeave={leaveTable}
            >
            <div
                ref={core.containerRef}
                tabIndex={0}
                data-testid="table-grid"
                onFocus={() => { core.onFocus(); setFocused(true); }}
                onBlur={(e) => { core.onBlur(e); if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false); }}
                className="relative overflow-auto outline-none max-h-full w-max max-w-full"
            >
                <table className="border-collapse">
                    <thead>
                        {/* 넘버스 참조 탭 줄 — 포커스가 있을 때만 A,B,C… 가 뜬다. 왼쪽 위 모서리는 표 손잡이(누르면 표 전체). */}
                        {showColHandles && (
                            <tr>
                                <td className={`w-7 p-0 border-0 ${stickyColHandleCls}`}>
                                    <div
                                        data-testid="table-handle"
                                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                        onClick={(e) => { e.stopPropagation(); selectAll(); }}
                                        onContextMenu={openTableMenu}
                                        title="눌러서 표 전체 고르기 · 우클릭 표 메뉴(스타일·머리·꼬리)"
                                        className={`ml-auto h-5 w-6 grid place-items-center cursor-pointer select-none transition-opacity
                                            ${tabsOn ? 'opacity-100' : 'opacity-0'} bg-panel2 hover:bg-accent/20 text-muted`}
                                    >
                                        <span className="block h-2 w-2 rounded-[1px] border border-current" />
                                    </div>
                                </td>
                                {columns.map((col, idx) => {
                                    const lineSel = sel.c1 <= idx && idx <= sel.c2 && sel.r1 === 0 && sel.r2 >= rows.length - 1;
                                    return (
                                        <th
                                            key={col.key}
                                            data-col-idx={idx}
                                            className={`relative p-0 h-5 border-0 align-bottom ${stickyColHandleCls}`}
                                            style={{ width: widthOf(col.key, col.width), minWidth: widthOf(col.key, col.width) }}
                                        >
                                            <div
                                                data-testid="col-handle"
                                                onMouseDown={(e) => beginReorder(e, 'col', idx)}
                                                onClick={(e) => { e.stopPropagation(); selectLine('col', idx); }}
                                                onContextMenu={(e) => openColMenu(e, col.key, idx)}
                                                onMouseEnter={() => setHoverTab(idx)}
                                                onMouseLeave={() => setHoverTab(null)}
                                                title="눌러서 열 고르기 · 끌어서 옮기기 · ▾ 메뉴"
                                                className={`relative h-5 grid place-items-center border-r border-bg cursor-pointer leading-none select-none text-[11px] font-medium tabular-nums transition-opacity
                                                    ${tabsOn ? 'opacity-100' : 'opacity-0'}
                                                    ${lineSel ? 'bg-accent text-bg' : 'bg-panel2 text-muted hover:bg-text/[0.10]'}`}
                                            >
                                                {colLetter(idx)}
                                                <span
                                                    data-testid="col-menu"
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    onClick={(e) => openColMenu(e, col.key, idx)}
                                                    className={`absolute right-1 top-0 h-5 px-0.5 grid place-items-center text-[9px] ${hoverTab === idx ? 'opacity-100' : 'opacity-0'}`}
                                                >▾</span>
                                            </div>
                                            {reorder?.kind === 'col' && reorder.over === idx && (
                                                <span className="absolute left-0 top-0 h-5 w-0.5 bg-accent" />
                                            )}
                                            {hasColResize && (
                                                <span
                                                    data-testid="col-resize"
                                                    onMouseDown={(e) => beginResize(e, col.key)}
                                                    onDoubleClick={(e) => { e.stopPropagation(); autoFitCol(col.key); }}
                                                    title="끌어서 폭 조절 · 더블클릭 내용에 맞춤"
                                                    className={`absolute top-0 right-0 h-5 w-1 cursor-col-resize hover:bg-accent/40 ${liveResize?.key === col.key ? 'bg-accent' : ''}`}
                                                />
                                            )}
                                        </th>
                                    );
                                })}
                            </tr>
                        )}
                        {/* 열 제목 줄 — 노션 단순 표에선 감춘다(hideColHeader). 손님(명단·그리드)은 제목을 쓴다. */}
                        {showColTitles && columns.length > 0 && (
                            <tr>
                                <td className="w-7 p-0 border-0" />
                                {columns.map((col, idx) => (
                                    <th
                                        key={col.key}
                                        className={`relative bg-panel border border-line px-2 py-1 text-left font-medium text-muted ${hasSticky ? 'sticky z-10' : ''} ${hasSticky && !showColHandles ? 'top-0' : ''}`}
                                        style={{ width: widthOf(col.key, col.width), minWidth: widthOf(col.key, col.width) }}
                                        onContextMenu={(hasAxisEdit || headerMenu) ? (e) => openColMenu(e, col.key, idx) : undefined}
                                        onDoubleClick={hasAxisEdit ? () => setRenaming({ key: col.key, text: col.title }) : undefined}
                                    >
                                        {renaming?.key === col.key ? (
                                            <input
                                                autoFocus
                                                value={renaming.text}
                                                onChange={(e) => setRenaming({ key: col.key, text: e.target.value })}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') { renameCol(col.key, renaming.text); setRenaming(null); }
                                                    else if (e.key === 'Escape') setRenaming(null);
                                                }}
                                                onBlur={() => { renameCol(col.key, renaming.text); setRenaming(null); }}
                                                aria-label="칸 이름"
                                                className="w-full bg-bg text-text outline-none ring-1 ring-inset ring-accent px-1 select-text"
                                            />
                                        ) : col.title}
                                        {hasColResize && !showColHandles && (
                                            <span
                                                data-testid="col-resize"
                                                onMouseDown={(e) => beginResize(e, col.key)}
                                                onDoubleClick={(e) => { e.stopPropagation(); autoFitCol(col.key); }}
                                                title="끌어서 폭 조절 · 더블클릭 자동 맞춤"
                                                className="absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-accent/40"
                                            />
                                        )}
                                    </th>
                                ))}
                            </tr>
                        )}
                    </thead>
                    <tbody>
                        {rows.map((row, r) => {
                            const h = heightOf(row);
                            return (
                                <tr key={row.id} data-row-idx={r} style={h ? { height: h } : undefined}>
                                    {/* 넘버스 참조 탭(행 번호) — 포커스가 있을 때만 왼쪽 바깥에 1,2,3… */}
                                    <td className="relative w-7 p-0 border-0 align-middle">
                                        {hasRows && (
                                            <div className="h-full flex items-stretch justify-end">
                                                <div
                                                    data-testid="row-handle"
                                                    onMouseDown={(e) => beginReorder(e, 'row', r)}
                                                    onClick={(e) => { e.stopPropagation(); selectLine('row', r); }}
                                                    onContextMenu={(e) => openRowMenu(e, row.id, r)}
                                                    title="눌러서 행 고르기 · 끌어서 옮기기 · 우클릭 메뉴"
                                                    className={`grid place-items-center w-6 min-h-6 border-b border-bg cursor-pointer leading-none select-none text-[11px] font-medium tabular-nums transition-opacity
                                                        ${tabsOn ? 'opacity-100' : 'opacity-0'}
                                                        ${sel.r1 <= r && r <= sel.r2 && sel.c1 === 0 && sel.c2 >= columns.length - 1
                                                            ? 'bg-accent text-bg' : 'bg-panel2 text-muted hover:bg-text/[0.10]'}`}
                                                >
                                                    {r + 1}
                                                </div>
                                            </div>
                                        )}
                                        {hasRowWeight && (
                                            <span
                                                data-testid="row-weight"
                                                onMouseDown={(e) => beginWeight(e, row.id, heightOf(row) ?? 24)}
                                                title="끌어서 줄 높이 조절"
                                                className="absolute left-0 bottom-0 w-full h-1 cursor-row-resize hover:bg-accent/40"
                                            />
                                        )}
                                        {reorder?.kind === 'row' && reorder.over === r && (
                                            <span className="absolute left-7 top-0 h-0.5 w-screen max-w-[600px] bg-accent" />
                                        )}
                                    </td>
                                    {columns.map((col, c) => {
                                        if (mergeMap.covered.has(`${r}:${c}`)) return null;   // 병합에 덮인 칸은 안 그린다
                                        const span = mergeMap.anchors.get(`${r}:${c}`);
                                        const value = row.cells[col.key] ?? '';
                                        const editing = core.edit?.r === r && core.edit?.c === c;
                                        const selected = core.inSel(r, c);
                                        const inFill = core.fillActiveRef.current && core.fillTo != null
                                            && c >= sel.c1 && c <= sel.c2 && r > sel.r2 && r <= core.fillTo;
                                        const deco = decorate ? decorate(row.id, col.key, value) : undefined;
                                        const vErr = hasValidate && validate ? validate(row.id, col.key, value) : undefined;
                                        const isBool = hasColTypes && col.type === 'bool';
                                        const isFoot = isFootRow(r);
                                        const isHeadCell = isHeadRow(r) || (headerCol && c === 0) || isFoot;
                                        // 표 스타일(넘버스 프리셋) — 교대 행은 머리·꼬리를 건너뛴 본문 줄만 센다.
                                        const bodyIdx = r - (headerRow ? 1 : 0);
                                        const striped = (preset === 'striped' || preset === 'headed') && !isHeadCell && bodyIdx % 2 === 1;
                                        const headTone = preset === 'headed' && isHeadRow(r);
                                        // 🔴 선택 테두리는 칸이 아니라 바깥 상자(selRect) 한 겹으로 그린다 — 칸엔 안쪽 옅은 바탕만(이중선·어긋남 방지).
                                        //    편집 중인 칸은 input 자신의 테두리만 보이게 바탕을 빼지 않는다(input 이 흰 바탕으로 덮는다).
                                        const cls = [
                                            'relative border px-1.5 py-0.5 h-6 align-middle text-text whitespace-pre-wrap leading-5 min-w-[96px]',
                                            // 머리 칸은 바탕이 옅은 회색(panel2)이라 line 경계가 묻힌다 — 한 단 진한 edge 로 본문 칸과 같은 또렷함을 준다(세로 칸선이 보이게).
                                            isHeadCell ? 'border-edge' : 'border-line',
                                            preset === 'lined' ? 'border-x-transparent' : '',
                                            isFoot ? 'border-t-2' : '',
                                            col.readOnly ? 'text-muted' : '',
                                            headTone ? 'bg-accent/15 font-semibold' : isHeadCell ? 'bg-panel2 font-semibold' : '',
                                            isHeadRow(r) ? 'border-b-2 border-b-edge' : '',
                                            headerCol && c === 0 && !isHeadRow(r) ? 'border-r-2 border-r-edge' : '',
                                            striped ? 'bg-text/[0.03]' : '',
                                            deco?.tone ? TONE_BG[deco.tone] ?? '' : '',
                                            selected || inFill ? 'bg-accent/10' : '',
                                            vErr ? (vErr.level === 'bad' ? 'ring-1 ring-inset ring-bad' : 'ring-1 ring-inset ring-warn') : '',
                                            col.align === 'right' || col.type === 'number' || (!col.align && !isHeadCell && /^-?[\d,]+(\.\d+)?%?$/.test(value.trim())) ? 'text-right' : col.align === 'center' || isBool ? 'text-center' : '',
                                        ].filter(Boolean).join(' ');
                                        const title = vErr?.message ?? deco?.title;
                                        return (
                                            <td
                                                key={col.key}
                                                data-rc={`${r}:${c}`}
                                                className={cls}
                                                style={{ width: widthOf(col.key, col.width), minWidth: widthOf(col.key, col.width) }}
                                                rowSpan={span?.rowSpan}
                                                colSpan={span?.colSpan}
                                                title={title}
                                                onMouseDown={(e) => core.beginDrag(r, c, e)}
                                                onMouseEnter={() => core.onCellEnter(r, c)}
                                                onContextMenu={(e) => openCellMenu(e, r, c)}
                                                onDoubleClick={() => !isBool && core.beginEdit(r, c)}
                                            >
                                                {editing && !isBool ? (
                                                    renderEditor(col, core)
                                                ) : (
                                                    <>
                                                        {isBool ? (
                                                            <input type="checkbox" checked={isChecked(value)} aria-label={col.title}
                                                                onChange={() => toggleCell(r, c)}
                                                                className="accent-accent align-middle" />
                                                        ) : (
                                                            <span>{value}</span>
                                                        )}
                                                        {deco?.badge && <span className="ml-1 px-1 rounded bg-accent/15 text-accent text-[11px] align-middle">{deco.badge}</span>}
                                                    </>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                        {rows.length === 0 && (
                            <tr>
                                <td className="w-7 p-0 border-0" />
                                <td colSpan={Math.max(1, columns.length)} className="border border-line px-2 py-6 text-center text-muted">
                                    {lb.emptyHint}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>

                {/* 선택 테두리 — 고른 범위를 2px 파란 상자 한 겹으로(칸 안쪽 옅은 바탕은 칸이 칠한다). */}
                {selRect && columns.length > 0 && rows.length > 0 && (
                    <div
                        className="pointer-events-none absolute z-20 rounded-[2px] border-2 border-accent"
                        style={{ top: selRect.top - 1, left: selRect.left - 1, width: selRect.width, height: selRect.height }}
                    >
                        {/* 넘버스 — 흰 점(오른쪽 아래)을 끌면 범위가 늘고, 노란 점(아래 가운데)을 끌면 아래로 채운다. */}
                        {focused && !core.edit && (
                            <span
                                data-testid="extend-handle"
                                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); core.beginExtend(); }}
                                title="끌어서 범위 넓히기"
                                className="pointer-events-auto absolute -right-[5px] -bottom-[5px] h-2.5 w-2.5 rounded-full border-2 border-accent bg-bg cursor-nwse-resize"
                            />
                        )}
                        {hasFill && focused && !core.edit && !isHeadRow(sel.r1) && !isFootRow(sel.r1) && (
                            <span
                                data-testid="fill-handle"
                                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); core.startFill(); }}
                                title="끌어서 아래로 채우기"
                                className="pointer-events-auto absolute left-1/2 -translate-x-1/2 -bottom-[5px] h-2.5 w-2.5 rounded-full border-2 border-bg bg-warn cursor-ns-resize"
                            />
                        )}
                    </div>
                )}

            </div>

            {/* 넘버스 둥근 추가 단추 — 오른쪽 위 = 열, 왼쪽 아래 = 행. 누르면 1개, 바깥쪽으로 끌면 끈 만큼 여러 개. */}
            {hasAxisEdit && columns.length > 0 && (
                <button
                    type="button"
                    data-testid="add-col"
                    aria-label={lb.addCol}
                    onMouseDown={(e) => beginAddDrag(e, 'col')}
                    onClick={() => clickAdd('col')}
                    title={`${lb.addCol} · 오른쪽으로 끌면 여러 개`}
                    className={`absolute top-6 right-0 h-4 w-4 grid place-items-center rounded-full border border-line bg-panel shadow-sm cursor-ew-resize transition-opacity
                        ${hoverTable || focused || addDrag ? 'opacity-100' : 'opacity-0'} text-muted hover:text-accent hover:border-accent`}
                >
                    <span className="text-[11px] leading-none">{addDrag?.axis === 'col' && addDrag.n > 1 ? addDrag.n : '＋'}</span>
                </button>
            )}
            {hasRows && (
                <button
                    type="button"
                    data-testid="add-row"
                    aria-label={lb.addRow}
                    onMouseDown={(e) => beginAddDrag(e, 'row')}
                    onClick={() => clickAdd('row')}
                    title={`${lb.addRow} · 아래로 끌면 여러 개`}
                    className={`absolute left-7 bottom-0 h-4 w-4 grid place-items-center rounded-full border border-line bg-panel shadow-sm cursor-ns-resize transition-opacity
                        ${hoverTable || focused || addDrag ? 'opacity-100' : 'opacity-0'} text-muted hover:text-accent hover:border-accent`}
                >
                    <span className="text-[11px] leading-none">{addDrag?.axis === 'row' && addDrag.n > 1 ? addDrag.n : '＋'}</span>
                </button>
            )}
            </div>
            {/* 넘버스 하단 합계 바 — 범위면 합·평균·최소·최대·개수, 칸 하나면 원래 값. */}
            {calcText != null && (
                <div data-testid="quick-calc" className="mt-2 ml-6 h-6 px-2 flex items-center border-t border-line text-[12px] text-muted tabular-nums truncate select-none">
                    {calcText || ' '}
                </div>
            )}

            {menu && <Menu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
        </div>
    );
});

/** 편집창 — 열 타입에 따라 input / select 로 그린다(col-types). bool 은 셀에서 체크박스로 따로 그린다. */
function renderEditor(
    col: TableColumn,
    core: ReturnType<typeof useSheetCore>,
): React.ReactNode {
    const text = core.edit!.text;
    if (col.type === 'select') {
        const options = col.options ?? [];
        return (
            <select
                autoFocus
                value={text}
                aria-label={col.title}
                onChange={(e) => core.commitEdit(1, 0, e.target.value)}
                onBlur={() => core.commitEdit(0, 0)}
                className="w-full bg-bg text-text outline-none ring-1 ring-inset ring-accent"
            >
                <option value="" />
                {options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
        );
    }
    return (
        <input
            autoFocus
            size={1}
            value={text}
            inputMode={col.type === 'number' ? 'numeric' : undefined}
            onChange={(e) => core.setEditText(e.target.value)}
            onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                const k = e.key;
                if (k === 'Escape') { e.preventDefault(); core.cancelEdit(); return; }
                if (k === 'Enter') {
                    if (e.altKey) {
                        e.preventDefault();
                        const el = e.currentTarget;
                        const s = el.selectionStart ?? el.value.length;
                        const en = el.selectionEnd ?? s;
                        core.setEditText(el.value.slice(0, s) + '\n' + el.value.slice(en));
                        return;
                    }
                    e.preventDefault(); core.commitEdit(e.shiftKey ? -1 : 1, 0); return;
                }
                if (k === 'Tab') { e.preventDefault(); core.commitEdit(0, e.shiftKey ? -1 : 1); return; }
            }}
            onBlur={() => core.commitEdit(0, 0)}
            aria-label={col.title}
            // 노션식 — 칸 안엔 글자만. 바탕·테두리·링 없이 셀 글자와 같은 자리에 뜬다(파란 테두리는 바깥 selRect 가 그린다).
            // w-full·min-w-0·size=1 로 편집창이 열을 넓히지 않게(열 폭 고정) · p-0 로 셀 글자와 자리를 맞춰 글자가 안 튀게.
            className="w-full min-w-0 appearance-none border-0 bg-transparent text-text leading-normal p-0 outline-none select-text"
        />
    );
}
