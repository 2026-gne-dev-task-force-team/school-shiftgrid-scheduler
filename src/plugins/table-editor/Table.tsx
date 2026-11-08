/**
 * Table — 범용 표의 「얼굴 하나」. 엔진(useSheetCore) + 조립된 기능 모듈을 얹어 그린다.
 *   🔴 데이터를 안 들고 있다(controlled) — columns·rows·merges 를 props 로 받고, 확정은 onCommit(tx) 로 통째로 올린다.
 *      그래서 같은 데이터를 두 탭에 열면 한쪽 편집이 다른 쪽에 바로 비친다.
 *   🔴 한 번 확정 = TableTx 하나 = undo 한 단위. 되돌리기는 기본 소유자(onUndo/onRedo), 없고 history 모듈이 끼면 내장 스택.
 *   ⛔ 색은 토큰 클래스만(bg-panel·border-line·ring-accent …) — 하드코딩 색 0(구조 검사 ①).
 *
 *   M2: 병합(merge)·열 폭(col-resize)·머리 고정(sticky-headers)·행열 편집(axis-edit)·행 높이(row-weight)·
 *       열 타입(col-types)·검증(validate) + 확장 지점 decorate·headerMenu. 얼굴은 여전히 이 파일 하나.
 */
import {
    forwardRef, useEffect, useImperativeHandle, useRef, useState,
} from 'react';
import { useSheetCore } from './core/useSheetCore';
import type { CellChange, CommitSource, SheetCoreAdapter, SheetCoreHandle } from './core/types';
import type {
    CellChange as TxCellChange, HeaderMenuEntry, TableCapability, TableProps, TableState, TableTx,
} from './contracts/table';
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

export const Table = forwardRef<SheetCoreHandle, TableProps>(function Table(props, ref) {
    const {
        columns, rows, onCommit, features, onUndo, onRedo, emptyHint, labels, className,
        decorate, validate, headerMenu, merges,
    } = props;

    const stateRef = useRef<TableState>(EMPTY_STATE);
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
    const historyOwned = !onUndo && has('history');

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
    const handleCommit = (changes: CellChange[], source: CommitSource): void => {
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

    const rowCount = Math.max(1, rows.length + (hasRows ? 1 : 0));
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
        emptyHint: emptyHint ?? labels?.emptyHint ?? '아직 비어 있다 — 「줄 추가」 하거나 엑셀·한글 표를 붙여 넣는다.',
        moveUp: labels?.moveUp ?? '위로', moveDown: labels?.moveDown ?? '아래로', deleteRow: labels?.deleteRow ?? '지우기',
        insertAbove: labels?.insertAbove ?? '위에 줄 넣기', insertBelow: labels?.insertBelow ?? '아래에 줄 넣기',
        insertColLeft: labels?.insertColLeft ?? '왼쪽에 칸 넣기', insertColRight: labels?.insertColRight ?? '오른쪽에 칸 넣기',
        deleteCol: labels?.deleteCol ?? '이 칸 지우기', renameCol: labels?.renameCol ?? '이름 바꾸기',
        mergeCells: labels?.mergeCells ?? '칸 합치기', unmergeCells: labels?.unmergeCells ?? '합친 칸 풀기',
    };

    const showRowHead = hasRows || hasRowWeight || rows.some((r) => r.label != null || r.sub != null);
    const totalCols = columns.length + (showRowHead ? 1 : 0);
    const mergeMap = buildMergeMap(merges, rows, columns);

    // ── 행·열 조작(axis-edit) · 병합 ───────────────────────────
    const addRowAtEnd = (): void => emit({ cells: [], rows: { add: [{ at: rows.length, count: 1, cells: [{}], ids: genIds(1) }] }, source: 'menu' }, false);
    const insertRow = (at: number): void => emit({ cells: [], rows: { add: [{ at, count: 1, cells: [{}], ids: genIds(1) }] }, source: 'menu' }, false);
    const removeRow = (id: string): void => emit({ cells: [], rows: { remove: [id] }, source: 'menu' }, false);
    const moveRow = (id: string, to: number): void => emit({ cells: [], rows: { move: [{ id, to }] }, source: 'menu' }, false);
    const addColAt = (at: number): void => {
        const key = genColKey();
        emit({ cells: [], cols: { add: [{ at, key, title: lb.addCol }] }, source: 'menu' }, false);
    };
    const removeCol = (key: string): void => emit({ cells: [], cols: { remove: [key] }, source: 'menu' }, false);
    const renameCol = (key: string, title: string): void => emit({ cells: [], cols: { rename: [{ key, title }] }, source: 'menu' }, false);

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

    // ── 머리 메뉴(axis-edit + 손님 headerMenu) ────────────────
    const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
    const domainEntries = (kind: 'row' | 'col', id: string): MenuItem[] =>
        (headerMenu?.(kind, id) ?? []).map((e: HeaderMenuEntry) => ({ label: e.label, onClick: () => e.onSelect?.() }));

    const openColMenu = (e: React.MouseEvent, key: string, idx: number): void => {
        e.preventDefault();
        const items: MenuItem[] = [];
        if (hasAxisEdit) {
            items.push(
                { label: lb.insertColLeft, onClick: () => addColAt(idx) },
                { label: lb.insertColRight, onClick: () => addColAt(idx + 1) },
                { label: lb.renameCol, onClick: () => setRenaming({ key, text: columns[idx]?.title ?? '' }) },
                { label: lb.deleteCol, danger: true, onClick: () => removeCol(key) },
            );
        }
        items.push(...domainEntries('col', key));
        if (items.length) setMenu({ x: e.clientX, y: e.clientY, items });
    };
    const openRowMenu = (e: React.MouseEvent, id: string, viewR: number): void => {
        e.preventDefault();
        const items: MenuItem[] = [];
        if (hasAxisEdit) {
            items.push(
                { label: lb.insertAbove, onClick: () => insertRow(viewR) },
                { label: lb.insertBelow, onClick: () => insertRow(viewR + 1) },
                { label: lb.deleteRow, danger: true, onClick: () => removeRow(id) },
            );
        }
        items.push(...domainEntries('row', id));
        if (items.length) setMenu({ x: e.clientX, y: e.clientY, items });
    };

    // 열 머리 이름 고치기(인라인) — axis-edit 일 때 머리 더블클릭 또는 메뉴에서.
    const [renaming, setRenaming] = useState<{ key: string; text: string } | null>(null);

    const sel = core.sel;
    const stickyHeadCls = hasSticky ? 'sticky top-0 z-20' : '';
    const stickyRowHeadCls = hasSticky ? 'sticky left-0 z-10' : '';

    const mergeCount = merges?.length ?? 0;
    const canMergeSel = hasMerge && regionFromSelection(sel, rows, columns) != null;
    const canUnmerge = hasMerge && anchorCovering(merges, core.active.r, core.active.c, rows, columns) != null;
    const invalidCount = hasValidate && validate
        ? rows.reduce((n, row) => n + columns.filter((col) => validate(row.id, col.key, row.cells[col.key] ?? '')).length, 0)
        : 0;

    const showToolbar = hasMerge || hasAxisEdit || hasValidate;

    return (
        <div className={`flex flex-col gap-2 text-[13px] ${className ?? ''}`}>
            {showToolbar && (
                <div className="flex items-center gap-1.5 flex-wrap">
                    {hasAxisEdit && (
                        <button type="button" onClick={() => addColAt(columns.length)}
                            className="inline-flex items-center gap-1 h-btn px-2 rounded border border-line text-[12px] text-muted hover:text-text hover:bg-panel">
                            ＋ {lb.addCol}
                        </button>
                    )}
                    {hasMerge && (
                        <>
                            <button type="button" onClick={mergeSelection} disabled={!canMergeSel}
                                className={`inline-flex items-center gap-1 h-btn px-2 rounded border border-line text-[12px] ${canMergeSel ? 'text-muted hover:text-text hover:bg-panel' : 'text-muted/40 cursor-default'}`}>
                                ⊞ {lb.mergeCells}
                            </button>
                            <button type="button" onClick={unmergeAtActive} disabled={!canUnmerge}
                                className={`inline-flex items-center gap-1 h-btn px-2 rounded border border-line text-[12px] ${canUnmerge ? 'text-muted hover:text-text hover:bg-panel' : 'text-muted/40 cursor-default'}`}>
                                ⊟ {lb.unmergeCells}
                            </button>
                            {mergeCount > 0 && <span className="text-[11px] text-muted tabular-nums">합친 칸 {mergeCount}</span>}
                        </>
                    )}
                    {hasValidate && invalidCount > 0 && (
                        <span className="text-[11px] text-bad tabular-nums">확인 필요 {invalidCount}곳</span>
                    )}
                </div>
            )}
            <div
                ref={core.containerRef}
                tabIndex={0}
                data-testid="table-grid"
                onFocus={core.onFocus}
                onBlur={core.onBlur}
                className="overflow-auto outline-none max-h-full"
            >
                <table className="border-collapse">
                    <thead>
                        <tr>
                            {showRowHead && <th className={`bg-panel border border-line w-10 ${stickyHeadCls} ${stickyRowHeadCls} z-30`} />}
                            {columns.map((col, idx) => (
                                <th
                                    key={col.key}
                                    className={`relative bg-panel border border-line px-2 py-1 text-left font-medium text-muted ${stickyHeadCls}`}
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
                                    {hasColResize && (
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
                    </thead>
                    <tbody>
                        {Array.from({ length: rowCount }, (_, r) => {
                            const row = r < rows.length ? rows[r] : undefined;
                            const isGhost = r >= rows.length;
                            const h = row ? heightOf(row) : undefined;
                            return (
                                <tr key={row?.id ?? `__ghost_${r}`} style={h ? { height: h } : undefined}>
                                    {showRowHead && (
                                        <td
                                            className={`relative bg-panel border border-line px-1 text-center text-xs text-muted align-top ${stickyRowHeadCls}`}
                                            onContextMenu={row && (hasAxisEdit || headerMenu) ? (e) => openRowMenu(e, row.id, r) : undefined}
                                        >
                                            {row?.label != null ? (
                                                <div className="flex flex-col leading-tight">
                                                    <span className="text-text">{row.label}</span>
                                                    {row.sub != null && <span className="text-muted">{row.sub}</span>}
                                                </div>
                                            ) : isGhost ? '＋' : r + 1}
                                            {hasRows && !isGhost && row && (
                                                <div className="flex justify-center gap-0.5">
                                                    <button type="button" title={lb.moveUp} aria-label={lb.moveUp}
                                                        onClick={() => moveRow(row.id, Math.max(0, r - 1))}
                                                        className="text-muted hover:text-text">↑</button>
                                                    <button type="button" title={lb.moveDown} aria-label={lb.moveDown}
                                                        onClick={() => moveRow(row.id, r + 1)}
                                                        className="text-muted hover:text-text">↓</button>
                                                    <button type="button" title={lb.deleteRow} aria-label={lb.deleteRow}
                                                        onClick={() => removeRow(row.id)}
                                                        className="text-muted hover:text-bad">✕</button>
                                                </div>
                                            )}
                                            {hasRowWeight && !isGhost && row && (
                                                <span
                                                    data-testid="row-weight"
                                                    onMouseDown={(e) => beginWeight(e, row.id, heightOf(row) ?? 28)}
                                                    title="끌어서 줄 높이 조절"
                                                    className="absolute left-0 bottom-0 w-full h-1 cursor-row-resize hover:bg-accent/40"
                                                />
                                            )}
                                        </td>
                                    )}
                                    {columns.map((col, c) => {
                                        if (mergeMap.covered.has(`${r}:${c}`)) return null;   // 병합에 덮인 칸은 안 그린다
                                        const span = mergeMap.anchors.get(`${r}:${c}`);
                                        const value = row?.cells[col.key] ?? '';
                                        const editing = core.edit?.r === r && core.edit?.c === c;
                                        const selected = core.inSel(r, c);
                                        const isActive = core.active.r === r && core.active.c === c;
                                        const inFill = core.fillActiveRef.current && core.fillTo != null
                                            && c >= sel.c1 && c <= sel.c2 && r > sel.r2 && r <= core.fillTo;
                                        const deco = !isGhost && decorate ? decorate(row!.id, col.key, value) : undefined;
                                        const vErr = hasValidate && validate && !isGhost ? validate(row!.id, col.key, value) : undefined;
                                        const isBool = hasColTypes && col.type === 'bool';
                                        const cls = [
                                            'relative border border-line px-2 py-0.5 align-top text-text whitespace-pre-wrap',
                                            col.readOnly ? 'text-muted' : '',
                                            deco?.tone ? TONE_BG[deco.tone] ?? '' : '',
                                            selected || inFill ? 'bg-accent/10' : '',
                                            isActive ? 'ring-1 ring-inset ring-accent' : '',
                                            vErr ? (vErr.level === 'bad' ? 'ring-1 ring-inset ring-bad' : 'ring-1 ring-inset ring-warn') : '',
                                            col.align === 'right' || col.type === 'number' ? 'text-right' : col.align === 'center' || isBool ? 'text-center' : '',
                                        ].filter(Boolean).join(' ');
                                        const title = vErr?.message ?? deco?.title;
                                        return (
                                            <td
                                                key={col.key}
                                                className={cls}
                                                style={{ width: widthOf(col.key, col.width), minWidth: widthOf(col.key, col.width) }}
                                                rowSpan={span?.rowSpan}
                                                colSpan={span?.colSpan}
                                                title={title}
                                                onMouseDown={(e) => core.beginDrag(r, c, e)}
                                                onMouseEnter={() => core.onCellEnter(r, c)}
                                                onDoubleClick={() => !isBool && core.beginEdit(r, c)}
                                            >
                                                {editing && !isBool ? (
                                                    renderEditor(col, core)
                                                ) : (
                                                    <>
                                                        {isBool && !isGhost ? (
                                                            <input type="checkbox" checked={isChecked(value)} aria-label={col.title}
                                                                onChange={() => toggleCell(r, c)}
                                                                className="accent-accent align-middle" />
                                                        ) : (
                                                            <span>{value}</span>
                                                        )}
                                                        {deco?.badge && <span className="ml-1 px-1 rounded bg-accent/15 text-accent text-[11px] align-middle">{deco.badge}</span>}
                                                        {hasFill && isActive && !col.readOnly && !isBool && (
                                                            <span
                                                                data-testid="fill-handle"
                                                                onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); core.startFill(); }}
                                                                title="끌어서 아래로 채우기"
                                                                className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 bg-accent cursor-crosshair"
                                                            />
                                                        )}
                                                    </>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                        {rows.length === 0 && !hasRows && (
                            <tr>
                                <td colSpan={totalCols} className="border border-line px-2 py-6 text-center text-muted">
                                    {lb.emptyHint}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            {hasRows && (
                <div>
                    <button
                        type="button"
                        onClick={addRowAtEnd}
                        className="inline-flex items-center gap-1 h-btn px-2 rounded border border-line text-[12px] text-muted hover:text-text hover:bg-panel"
                    >
                        ＋ {lb.addRow}
                    </button>
                </div>
            )}
            {menu && <Menu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
        </div>
    );
});

/** 편집창 — 열 타입에 따라 input / select 로 그린다(col-types). bool 은 셀에서 체크박스로 따로 그린다. */
function renderEditor(
    col: TableProps['columns'][number],
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
            className="w-full bg-bg text-text outline-none ring-1 ring-inset ring-accent px-1 select-text"
        />
    );
}
