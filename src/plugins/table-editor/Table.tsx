/**
 * Table — 범용 표의 「얼굴 하나」. 엔진(useSheetCore) + 조립된 기능 모듈을 얹어 그린다.
 *   🔴 데이터를 안 들고 있다(controlled) — columns·rows 를 props 로 받고, 확정은 onCommit(tx) 로 통째로 올린다.
 *      그래서 같은 데이터를 두 탭에 열면 한쪽 편집이 다른 쪽에 바로 비친다.
 *   🔴 한 번 확정 = TableTx 하나 = undo 한 단위. 되돌리기는 기본 소유자(onUndo/onRedo), 없고 history 모듈이 끼면 내장 스택.
 *   ⛔ 색은 토큰 클래스만(bg-panel·border-line·ring-accent …) — 하드코딩 색 0(구조 검사 ①).
 */
import {
    forwardRef, useImperativeHandle, useRef,
    type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useSheetCore } from './core/useSheetCore';
import type { CellChange, CommitSource, SheetCoreAdapter, SheetCoreHandle } from './core/types';
import type { CellChange as TxCellChange, TableProps, TableState, TableTx } from './contracts/table';
import { buildConfig } from './features/install';
import { DEFAULT_FEATURES } from './features/modules';
import { lookupFeature } from './features/registry';

export type { SheetCoreHandle as TableHandle };

const EMPTY_STATE: TableState = {
    active: { r: 0, c: 0 }, anchor: { r: 0, c: 0 },
    sel: { r1: 0, r2: 0, c1: 0, c2: 0 }, editing: false, rowCount: 0, colCount: 0,
};

export const Table = forwardRef<SheetCoreHandle, TableProps>(function Table(props, ref) {
    const { columns, rows, onCommit, features, onUndo, onRedo, emptyHint, labels, className } = props;

    const stateRef = useRef<TableState>(EMPTY_STATE);
    const config = buildConfig(features ?? DEFAULT_FEATURES, lookupFeature, () => stateRef.current);
    const hasRows = config.caps.has('rows');
    const hasFill = config.caps.has('fill');
    const historyOwned = !onUndo && config.caps.has('history');

    // 내장 되돌리기 스택(cells-only 역트랜잭션) — 소유자가 undo 를 안 쥘 때만 선다.
    const undoStack = useRef<TableTx[]>([]);
    const redoStack = useRef<TableTx[]>([]);
    const applyingHistory = useRef(false);
    const rowsRef = useRef(rows);
    rowsRef.current = rows;

    const colOf = (c: number) => columns[c];
    const idByView = (r: number) => (r < rows.length ? rows[r].id : undefined);

    /** cells-only 트랜잭션의 역(지금 값으로) — history push·undo·redo 가 쓴다. */
    const inverseCells = (tx: TableTx): TableTx => {
        const cur = rowsRef.current;
        const cells = tx.cells.map((ch) => {
            const row = cur.find((x) => x.id === ch.rowId);
            return { rowId: ch.rowId, key: ch.key, value: row?.cells[ch.key] ?? '' };
        });
        return { cells, source: 'edit' };
    };

    const emit = (tx: TableTx, fromHistory: boolean): void => {
        let out = tx;
        for (const w of config.commitWrappers) out = w(out);
        // history: 사용자 확정이고 cells-only 이면 역트랜잭션을 쌓는다(행/열/축 조작은 M2).
        if (historyOwned && !fromHistory) {
            const cellsOnly = !out.rows && !out.cols && !out.axis;
            if (cellsOnly && out.cells.length) {
                undoStack.current.push(inverseCells(out));
                redoStack.current = [];
            }
        }
        onCommit(out);
    };

    const internalUndo = (): void => {
        const tx = undoStack.current.pop();
        if (!tx) return;
        redoStack.current.push(inverseCells(tx));
        applyingHistory.current = true;
        emit(tx, true);
        applyingHistory.current = false;
    };
    const internalRedo = (): void => {
        const tx = redoStack.current.pop();
        if (!tx) return;
        undoStack.current.push(inverseCells(tx));
        applyingHistory.current = true;
        emit(tx, true);
        applyingHistory.current = false;
    };

    /** 엔진의 (r,c) 커밋 → TableTx. 넘치는 행은 붙여넣기 정책/rows 능력에 따라 행 추가 또는 버림. */
    const handleCommit = (changes: CellChange[], source: CommitSource): void => {
        const cells: TxCellChange[] = [];
        const overflow = new Map<number, Record<string, string>>();  // (r - rows.length) → {key:value}
        for (const ch of changes) {
            const col = colOf(ch.c);
            if (!col) continue;
            const id = idByView(ch.r);
            if (id != null) {
                cells.push({ rowId: id, key: col.key, value: ch.text });
            } else {
                const k = ch.r - rows.length;
                const rec = overflow.get(k) ?? {};
                rec[col.key] = ch.text;
                overflow.set(k, rec);
            }
        }

        // 넘침 처리 — 붙여넣기는 정책(append 면 더하고 clip 이면 버린다), 그 밖(편집·채우기)은 rows 능력이면 새 행.
        const wantAdd = source === 'paste' ? config.pasteOverflow === 'append' : hasRows;
        let rowsTx: TableTx['rows'];
        if (overflow.size && wantAdd) {
            const count = Math.max(...overflow.keys()) + 1;
            const cellsArr: Record<string, string>[] = [];
            for (let k = 0; k < count; k++) cellsArr.push(overflow.get(k) ?? {});
            rowsTx = { add: [{ at: rows.length, count, cells: cellsArr }] };
        }

        if (!cells.length && !rowsTx) return;   // clip 으로 전부 버려졌다 — 올릴 게 없다
        const tx: TableTx = { cells, source, ...(rowsTx ? { rows: rowsTx } : {}) };
        emit(tx, applyingHistory.current);
    };

    const rowCount = Math.max(1, rows.length + (hasRows ? 1 : 0));   // rows 능력이면 맨 아래 「새 행」 자리
    const adapter: SheetCoreAdapter = {
        rowCount,
        dataRowCount: rows.length,
        colCount: columns.length,
        getText: (r, c) => (r < rows.length ? rows[r].cells[colOf(c)?.key ?? ''] ?? '' : ''),
        editable: (_r, c) => { const col = colOf(c); return !!col && !col.readOnly; },
        commit: handleCommit,
        cellKind: (_r, c) => (colOf(c)?.readOnly ? 'readonly' : 'edit'),
        editInitial: (r, c, typed) => (typed != null ? typed : (r < rows.length ? rows[r].cells[colOf(c)?.key ?? ''] ?? '' : '')),
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
        emptyHint: emptyHint ?? labels?.emptyHint ?? '아직 비어 있다 — 「줄 추가」 하거나 엑셀·한글 표를 붙여 넣는다.',
        moveUp: labels?.moveUp ?? '위로', moveDown: labels?.moveDown ?? '아래로', deleteRow: labels?.deleteRow ?? '지우기',
    };

    const showRowHead = hasRows || rows.some((r) => r.label != null || r.sub != null);
    const totalCols = columns.length + (showRowHead ? 1 : 0);

    const addRowAtEnd = (): void => emit({ cells: [], rows: { add: [{ at: rows.length, count: 1, cells: [{}] }] }, source: 'menu' }, false);
    const rowOp = (tx: TableTx): void => emit(tx, false);

    // 편집창 키 — 엑셀식(Enter 확정+아래 · Shift+Enter 위 · Alt+Enter 칸 안 줄바꿈 · Tab 옆 · Esc 취소).
    const onEditorKey = (e: ReactKeyboardEvent<HTMLInputElement>): void => {
        if (e.nativeEvent.isComposing) return;   // IME 조합 중엔 확정으로 안 읽는다
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
            e.preventDefault();
            core.commitEdit(e.shiftKey ? -1 : 1, 0);
            return;
        }
        if (k === 'Tab') { e.preventDefault(); core.commitEdit(0, e.shiftKey ? -1 : 1); return; }
    };

    const sel = core.sel;
    return (
        <div className={`flex flex-col gap-2 text-[13px] ${className ?? ''}`}>
            <div
                ref={core.containerRef}
                tabIndex={0}
                data-testid="table-grid"
                onFocus={core.onFocus}
                onBlur={core.onBlur}
                className="overflow-auto outline-none"
            >
                <table className="border-collapse">
                    <thead>
                        <tr>
                            {showRowHead && <th className="bg-panel border border-line w-10" />}
                            {columns.map((col) => (
                                <th
                                    key={col.key}
                                    className="bg-panel border border-line px-2 py-1 text-left font-medium text-muted"
                                    style={{ width: col.width, minWidth: col.width }}
                                >
                                    {col.title}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from({ length: rowCount }, (_, r) => {
                            const row = r < rows.length ? rows[r] : undefined;
                            const isGhost = r >= rows.length;
                            return (
                                <tr key={row?.id ?? `__ghost_${r}`} style={row?.weight ? { height: row.weight } : undefined}>
                                    {showRowHead && (
                                        <td className="bg-panel border border-line px-1 text-center text-xs text-muted align-top">
                                            {row?.label != null ? (
                                                <div className="flex flex-col leading-tight">
                                                    <span className="text-text">{row.label}</span>
                                                    {row.sub != null && <span className="text-muted">{row.sub}</span>}
                                                </div>
                                            ) : isGhost ? '＋' : r + 1}
                                            {hasRows && !isGhost && row && (
                                                <div className="flex justify-center gap-0.5">
                                                    <button type="button" title={lb.moveUp} aria-label={lb.moveUp}
                                                        onClick={() => rowOp({ cells: [], rows: { move: [{ id: row.id, to: Math.max(0, r - 1) }] }, source: 'menu' })}
                                                        className="text-muted hover:text-text">↑</button>
                                                    <button type="button" title={lb.moveDown} aria-label={lb.moveDown}
                                                        onClick={() => rowOp({ cells: [], rows: { move: [{ id: row.id, to: r + 1 }] }, source: 'menu' })}
                                                        className="text-muted hover:text-text">↓</button>
                                                    <button type="button" title={lb.deleteRow} aria-label={lb.deleteRow}
                                                        onClick={() => rowOp({ cells: [], rows: { remove: [row.id] }, source: 'menu' })}
                                                        className="text-muted hover:text-bad">✕</button>
                                                </div>
                                            )}
                                        </td>
                                    )}
                                    {columns.map((col, c) => {
                                        const editing = core.edit?.r === r && core.edit?.c === c;
                                        const selected = core.inSel(r, c);
                                        const isActive = core.active.r === r && core.active.c === c;
                                        const inFill = core.fillActiveRef.current && core.fillTo != null
                                            && c >= sel.c1 && c <= sel.c2 && r > sel.r2 && r <= core.fillTo;
                                        const cls = [
                                            'relative border border-line px-2 py-0.5 align-top text-text whitespace-pre-wrap',
                                            col.readOnly ? 'text-muted' : '',
                                            selected || inFill ? 'bg-accent/10' : '',
                                            isActive ? 'ring-1 ring-inset ring-accent' : '',
                                            col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : '',
                                        ].filter(Boolean).join(' ');
                                        return (
                                            <td
                                                key={col.key}
                                                className={cls}
                                                style={{ width: col.width, minWidth: col.width }}
                                                onMouseDown={(e) => core.beginDrag(r, c, e)}
                                                onMouseEnter={() => core.onCellEnter(r, c)}
                                                onDoubleClick={() => core.beginEdit(r, c)}
                                            >
                                                {editing ? (
                                                    <input
                                                        autoFocus
                                                        value={core.edit!.text}
                                                        onChange={(e) => core.setEditText(e.target.value)}
                                                        onKeyDown={onEditorKey}
                                                        onBlur={() => core.commitEdit(0, 0)}
                                                        aria-label={col.title}
                                                        className="w-full bg-bg text-text outline-none ring-1 ring-inset ring-accent px-1"
                                                    />
                                                ) : (
                                                    <>
                                                        <span>{row?.cells[col.key] ?? ''}</span>
                                                        {hasFill && isActive && !col.readOnly && (
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
        </div>
    );
});
