/**
 * Sheet — 엑셀식 격자 편집기.
 *  열 정의(SheetColumn) + 행 배열(SheetRow[])을 받아 셀 선택·범위·복붙·채우기·행조작을
 *  키보드로 다 되게 한다. 데이터는 이 컴포넌트가 안 들고 있고(controlled), 편집이 확정될 때마다
 *  onCommit(nextRows) 로 통째로 돌려준다 — 그래서 한 번의 확정 = 한 번의 undo 이력이 된다.
 *
 *  ⭐ 아래 한 줄이 「지금 무엇을 할 수 있나」를 늘 보여준다(디자인 가이드 3절: 줄마다 뭔가/왜/고치는 곳).
 *  ⛔ window.prompt/confirm 안 쓴다. ⛔ 외부 라이브러리 0.
 */
import {
    useState, useRef, useEffect, useMemo, useCallback,
    type ReactNode, type CSSProperties, type MouseEvent as ReactMouseEvent,
} from 'react';

// ── 열·행 규격 ────────────────────────────────────────────────
export type CellValue = string | number | boolean | string[];
export type SheetRow = { _id: string } & Record<string, CellValue>;

export interface SheetColumn {
    key: string;
    title: string;
    type: 'text' | 'number' | 'select' | 'bool' | 'list';
    options?: string[];          // select·list 후보
    suggest?: string[];          // text·list 자동완성 후보 (options 와 달리 강제 아님)
    allowEmpty?: boolean;        // select 에서 빈 값 허용
    width?: number;              // px (없으면 120)
    readOnly?: boolean;
    align?: 'left' | 'center' | 'right';
    placeholder?: string;
    /** 읽기전용 파생 값 (예: 이름 = 학년-반). 있으면 편집 불가 */
    compute?: (row: SheetRow) => CellValue;
    /** 문장을 돌려주면 그 칸을 빨간 테두리 + 툴팁. 저장은 막지 않는다 */
    validate?: (value: CellValue, row: SheetRow) => string | undefined;
    /** 오류는 아니지만 알려줄 것(예: 「‘가람’ 교사를 새로 만듭니다」) — 파랑 테두리 + 툴팁 */
    note?: (value: CellValue, row: SheetRow) => string | undefined;
}

export interface SheetApi { addRow: () => void; deleteSelectedRows: () => void; }

export interface SheetProps {
    columns: SheetColumn[];
    rows: SheetRow[];
    /** 편집 확정·붙이기·채우기·행조작마다 한 번. 한 번이 한 undo 이력이다 */
    onCommit: (rows: SheetRow[]) => void;
    /** 새 행 하나 (Enter 로 내려가거나 붙이기가 넘칠 때) */
    newRow: () => SheetRow;
    onUndo?: () => void;
    onRedo?: () => void;
    /** 툴바 버튼(행 추가·선택 행 삭제)이 쓸 조작을 밖으로 준다 */
    onApi?: (api: SheetApi) => void;
    /** 상태줄 오른쪽에 덧붙일 것 (ⓘ 등) */
    statusExtra?: ReactNode;
    minWidth?: number;
}

// 테스트 훅은 개발 모드 또는 localStorage.SHEET_TEST 로만 (프로덕션 기본 꺼짐)
const TEST_ENABLED = (() => {
    try {
        return !!import.meta.env?.DEV || (typeof localStorage !== 'undefined' && localStorage.getItem('SHEET_TEST') === '1');
    } catch { return false; }
})();

// 마지막 복사한 TSV — 클립보드가 막힌 자리(파일 프로토콜 등)의 대비책
let lastCopiedTsv = '';

// ── 값 ↔ 글자 ─────────────────────────────────────────────────
function toText(col: SheetColumn, v: CellValue | undefined): string {
    if (v == null) return '';
    if (col.type === 'bool') return v ? 'Y' : '';
    if (col.type === 'list') return Array.isArray(v) ? v.join(', ') : String(v);
    return String(v);
}
function parseInput(col: SheetColumn, text: string): CellValue {
    const t = text.trim();
    if (col.type === 'number') return t === '' ? '' : (Number.isFinite(Number(t)) ? Number(t) : t);
    if (col.type === 'bool') return /^(y|예|true|1|o|✓|참)$/i.test(t);
    if (col.type === 'list') return t.split(',').map((s) => s.trim()).filter(Boolean);
    if (col.type === 'select') {
        if (!col.options) return t;
        const exact = col.options.find((o) => o === t);
        if (exact) return exact;
        const ci = col.options.find((o) => o.toLowerCase() === t.toLowerCase());
        return ci ?? t;
    }
    return text;
}

function builtinValidate(col: SheetColumn, value: CellValue, row: SheetRow): string | undefined {
    if (col.type === 'select' && col.options) {
        const s = String(value ?? '');
        if (s === '') { if (!col.allowEmpty) return `${col.title}을(를) 골라 주세요`; }
        else if (!col.options.includes(s)) return `'${s}' 은(는) ${col.title} 목록에 없습니다`;
    }
    return col.validate?.(value, row);
}

function cellValueOf(rows: SheetRow[], r: number, col: SheetColumn, emptyRow: SheetRow): CellValue {
    const row = r < rows.length ? rows[r] : emptyRow;
    if (col.compute) return col.compute(row);
    return row[col.key] ?? (col.type === 'bool' ? false : col.type === 'list' ? [] : '');
}

// ══════════════════════════════════════════════════════════════
export default function Sheet({ columns, rows, onCommit, newRow, onUndo, onRedo, onApi, statusExtra, minWidth }: SheetProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [active, setActive] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
    const [anchor, setAnchor] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
    const [edit, setEdit] = useState<{ r: number; c: number; text: string } | null>(null);
    const [menuRow, setMenuRow] = useState<number | null>(null);
    const [sugIdx, setSugIdx] = useState(0);
    const dragRef = useRef(false);
    const fillRef = useRef(false);
    const [fillTo, setFillTo] = useState<number | null>(null);
    const focusedRef = useRef(false);

    const ghostR = rows.length;                    // 맨 아래 빈 「새 행」 자리
    const emptyRow = useMemo<SheetRow>(() => ({ _id: '__ghost__' }), []);
    const nCols = columns.length;

    const sel = useMemo(() => ({
        r1: Math.min(active.r, anchor.r), r2: Math.max(active.r, anchor.r),
        c1: Math.min(active.c, anchor.c), c2: Math.max(active.c, anchor.c),
    }), [active, anchor]);

    const inSel = (r: number, c: number) => r >= sel.r1 && r <= sel.r2 && c >= sel.c1 && c <= sel.c2;

    const clamp = useCallback((r: number, c: number) => ({
        r: Math.max(0, Math.min(ghostR, r)), c: Math.max(0, Math.min(nCols - 1, c)),
    }), [ghostR, nCols]);

    const focusGrid = () => { containerRef.current?.focus(); };

    // ── 선택 이동 ────────────────────────────────────────────
    const moveTo = useCallback((r: number, c: number, extend = false) => {
        const p = clamp(r, c);
        setActive(p);
        if (!extend) setAnchor(p);
    }, [clamp]);

    // ── 값 쓰기 (한 번의 onCommit = 한 undo) ──────────────────
    const setCells = useCallback((changes: { r: number; c: number; value: CellValue }[]) => {
        // 필요하면 행을 늘린다 (ghost 이상으로 붙이기)
        const maxR = changes.reduce((m, ch) => Math.max(m, ch.r), -1);
        const next = rows.map((row) => ({ ...row }));
        while (next.length <= maxR) next.push(newRow());
        for (const ch of changes) {
            const col = columns[ch.c];
            if (!col || col.readOnly || col.compute) continue;
            next[ch.r][col.key] = ch.value;
        }
        onCommit(next);
    }, [rows, columns, newRow, onCommit]);

    // ── 편집 시작·확정 ───────────────────────────────────────
    const beginEdit = useCallback((r: number, c: number, initialText?: string) => {
        const col = columns[c];
        if (!col || col.readOnly || col.compute) return;
        if (col.type === 'bool') {          // 불리언은 편집창 없이 토글
            const cur = !!cellValueOf(rows, r, col, emptyRow);
            setCells([{ r, c, value: !cur }]);
            return;
        }
        const text = initialText != null ? initialText : toText(col, cellValueOf(rows, r, col, emptyRow));
        setEdit({ r, c, text });
        setSugIdx(0);
    }, [columns, rows, emptyRow, setCells]);

    const commitEdit = useCallback((moveR: number, moveC: number, pickText?: string) => {
        if (!edit) return;
        const col = columns[edit.c];
        const raw = pickText != null ? pickText : edit.text;
        setCells([{ r: edit.r, c: edit.c, value: parseInput(col, raw) }]);
        setEdit(null);
        moveTo(edit.r + moveR, edit.c + moveC);
        focusGrid();
    }, [edit, columns, setCells, moveTo]);

    const cancelEdit = useCallback(() => { setEdit(null); focusGrid(); }, []);

    // ── 지우기 (선택 범위 비우기) ─────────────────────────────
    const clearSelection = useCallback(() => {
        const changes: { r: number; c: number; value: CellValue }[] = [];
        for (let r = sel.r1; r <= Math.min(sel.r2, rows.length - 1); r++) {
            for (let c = sel.c1; c <= sel.c2; c++) {
                const col = columns[c];
                if (!col || col.readOnly || col.compute) continue;
                changes.push({ r, c, value: col.type === 'bool' ? false : col.type === 'list' ? [] : '' });
            }
        }
        if (changes.length) setCells(changes);
    }, [sel, rows.length, columns, setCells]);

    // ── 채우기 (Ctrl+D · 핸들) ────────────────────────────────
    const fillDown = useCallback((toR: number) => {
        const changes: { r: number; c: number; value: CellValue }[] = [];
        for (let c = sel.c1; c <= sel.c2; c++) {
            const col = columns[c];
            if (!col || col.readOnly || col.compute) continue;
            const src = cellValueOf(rows, sel.r1, col, emptyRow);
            for (let r = sel.r1 + 1; r <= toR; r++) changes.push({ r, c, value: src });
        }
        if (changes.length) setCells(changes);
    }, [sel, columns, rows, emptyRow, setCells]);

    // ── 복사 / 붙이기 ─────────────────────────────────────────
    const buildTsv = useCallback(() => {
        const lines: string[] = [];
        for (let r = sel.r1; r <= sel.r2; r++) {
            const cells: string[] = [];
            for (let c = sel.c1; c <= sel.c2; c++) cells.push(toText(columns[c], cellValueOf(rows, r, columns[c], emptyRow)));
            lines.push(cells.join('\t'));
        }
        return lines.join('\n');
    }, [sel, columns, rows, emptyRow]);

    const doCopy = useCallback(() => {
        const tsv = buildTsv();
        lastCopiedTsv = tsv;
        try { void navigator.clipboard?.writeText(tsv); } catch { /* 조용히 — 내부 대비책이 있다 */ }
        return tsv;
    }, [buildTsv]);

    const doPaste = useCallback((tsv: string, atR = active.r, atC = active.c) => {
        const grid = tsv.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((l) => l.split('\t'));
        if (grid.length === 0) return;
        const changes: { r: number; c: number; value: CellValue }[] = [];
        grid.forEach((line, dr) => {
            line.forEach((raw, dc) => {
                const c = atC + dc;
                if (c >= nCols) return;
                const col = columns[c];
                if (col.readOnly || col.compute) return;
                changes.push({ r: atR + dr, c, value: parseInput(col, raw) });
            });
        });
        if (changes.length) setCells(changes);
        // 선택을 붙인 범위로
        const lastR = atR + grid.length - 1;
        const lastC = Math.min(nCols - 1, atC + Math.max(...grid.map((l) => l.length)) - 1);
        setAnchor({ r: atR, c: atC });
        setActive({ r: lastR, c: lastC });
    }, [active, columns, nCols, setCells]);

    // ── 행 조작 ───────────────────────────────────────────────
    const rowOp = useCallback((kind: 'above' | 'below' | 'dup' | 'del', r: number) => {
        setMenuRow(null);
        if (r >= rows.length && kind !== 'above' && kind !== 'below') return;
        const next = rows.map((row) => ({ ...row }));
        if (kind === 'above') next.splice(r, 0, newRow());
        else if (kind === 'below') next.splice(r + 1, 0, newRow());
        else if (kind === 'dup') { if (r < rows.length) next.splice(r + 1, 0, { ...rows[r], _id: newRow()._id }); }
        else if (kind === 'del') { if (r < rows.length) next.splice(r, 1); }
        onCommit(next);
    }, [rows, newRow, onCommit]);

    const deleteSelectedRows = useCallback(() => {
        const from = sel.r1, to = Math.min(sel.r2, rows.length - 1);
        if (from > rows.length - 1) return;
        const next = rows.filter((_, i) => i < from || i > to);
        onCommit(next);
        moveTo(Math.min(from, next.length), active.c);
    }, [sel, rows, onCommit, moveTo, active.c]);

    const addRow = useCallback(() => {
        const next = [...rows.map((row) => ({ ...row })), newRow()];
        onCommit(next);
        moveTo(next.length - 1, 0);
    }, [rows, newRow, onCommit, moveTo]);

    useEffect(() => { onApi?.({ addRow, deleteSelectedRows }); }, [onApi, addRow, deleteSelectedRows]);

    // ── 문서 레벨 키·복붙 (격자에 포커스가 있을 때만) ─────────
    const selectRange = useCallback((r1: number, c1: number, r2: number, c2: number) => {
        setAnchor(clamp(r1, c1)); setActive(clamp(r2, c2));
    }, [clamp]);
    const apiRef = useRef({ doCopy, doPaste, buildTsv, beginEdit, commitEdit, moveTo, selectRange, clearSelection, deleteSelectedRows, addRow, rows, columns });
    apiRef.current = { doCopy, doPaste, buildTsv, beginEdit, commitEdit, moveTo, selectRange, clearSelection, deleteSelectedRows, addRow, rows, columns };
    const apiRefActive = useRef(active); apiRefActive.current = active;
    const editRef = useRef(edit); editRef.current = edit;

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!focusedRef.current) return;
            if (edit) return;                          // 편집 중엔 입력창이 처리한다
            const meta = e.metaKey || e.ctrlKey;
            const k = e.key;
            if (meta && (k === 'z' || k === 'Z')) { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) onRedo?.(); else onUndo?.(); return; }
            if (meta && (k === 'y' || k === 'Y')) { e.preventDefault(); e.stopPropagation(); onRedo?.(); return; }
            if (meta && (k === 'c' || k === 'C')) { e.preventDefault(); e.stopPropagation(); doCopy(); return; }
            if (meta && (k === 'v' || k === 'V')) { e.preventDefault(); e.stopPropagation(); return; } // paste 이벤트가 처리
            if (meta && (k === 'd' || k === 'D')) { e.preventDefault(); e.stopPropagation(); fillDown(sel.r2); return; }
            if (meta && (k === 'a' || k === 'A')) { e.preventDefault(); e.stopPropagation(); setAnchor({ r: 0, c: 0 }); setActive({ r: Math.max(0, rows.length - 1), c: nCols - 1 }); return; }
            e.stopPropagation();
            if (k === 'ArrowDown') { e.preventDefault(); moveTo(active.r + 1, active.c, e.shiftKey); return; }
            if (k === 'ArrowUp') { e.preventDefault(); moveTo(active.r - 1, active.c, e.shiftKey); return; }
            if (k === 'ArrowLeft') { e.preventDefault(); moveTo(active.r, active.c - 1, e.shiftKey); return; }
            if (k === 'ArrowRight') { e.preventDefault(); moveTo(active.r, active.c + 1, e.shiftKey); return; }
            if (k === 'Tab') { e.preventDefault(); moveTo(active.r, active.c + (e.shiftKey ? -1 : 1)); return; }
            if (k === 'Enter') { e.preventDefault(); if (columns[active.c]?.type === 'bool') beginEdit(active.r, active.c); else moveTo(active.r + 1, active.c); return; }
            if (k === 'F2') { e.preventDefault(); beginEdit(active.r, active.c); return; }
            if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); clearSelection(); return; }
            if (k === 'Escape') { e.preventDefault(); setAnchor(active); return; }
            if (k === ' ') { e.preventDefault(); if (columns[active.c]?.type === 'bool') beginEdit(active.r, active.c); return; }
            // 글자 입력 → 그 글자로 편집 시작 (기존 값 덮음)
            if (!meta && !e.altKey && k.length === 1) { e.preventDefault(); beginEdit(active.r, active.c, k); }
        };
        const onPasteEvt = (e: ClipboardEvent) => {
            if (!focusedRef.current || edit) return;
            const tsv = e.clipboardData?.getData('text/plain') ?? '';
            e.preventDefault(); e.stopPropagation();
            doPaste(tsv || lastCopiedTsv);
        };
        const onCopyEvt = (e: ClipboardEvent) => {
            if (!focusedRef.current || edit) return;
            const tsv = buildTsv();
            lastCopiedTsv = tsv;
            e.clipboardData?.setData('text/plain', tsv);
            e.preventDefault(); e.stopPropagation();
        };
        document.addEventListener('keydown', onKey, true);
        document.addEventListener('paste', onPasteEvt, true);
        document.addEventListener('copy', onCopyEvt, true);
        return () => {
            document.removeEventListener('keydown', onKey, true);
            document.removeEventListener('paste', onPasteEvt, true);
            document.removeEventListener('copy', onCopyEvt, true);
        };
    }, [edit, active, sel, columns, rows.length, nCols, moveTo, beginEdit, clearSelection, fillDown, doCopy, doPaste, buildTsv, onUndo, onRedo]);

    // ── 마우스 드래그(범위 · 채우기 핸들) ─────────────────────
    useEffect(() => {
        const up = () => {
            if (fillRef.current && fillTo != null) fillDown(fillTo);
            dragRef.current = false; fillRef.current = false; setFillTo(null);
        };
        window.addEventListener('mouseup', up);
        return () => window.removeEventListener('mouseup', up);
    }, [fillTo, fillDown]);

    // ── 테스트 훅 ─────────────────────────────────────────────
    useEffect(() => {
        if (!TEST_ENABLED) return;
        const w = window as unknown as { __sheet?: unknown };
        w.__sheet = {
            focus: () => focusGrid(),
            click: (r: number, c: number) => { focusedRef.current = true; focusGrid(); apiRef.current.moveTo(r, c); },
            select: (r1: number, c1: number, r2: number, c2: number) => { focusedRef.current = true; focusGrid(); apiRef.current.selectRange(r1, c1, r2, c2); },
            type: (s: string, r?: number, c?: number) => {
                focusedRef.current = true;
                const rr = r ?? apiRefActive.current.r, cc = c ?? apiRefActive.current.c;
                apiRef.current.moveTo(rr, cc);
                apiRef.current.beginEdit(rr, cc, s);
            },
            setText: (s: string) => setEdit((ed) => (ed ? { ...ed, text: s } : ed)),
            commit: () => apiRef.current.commitEdit(1, 0),
            enter: () => apiRef.current.moveTo(apiRefActive.current.r + 1, apiRefActive.current.c),
            clear: () => apiRef.current.clearSelection(),
            addRow: () => apiRef.current.addRow(),
            deleteRows: () => apiRef.current.deleteSelectedRows(),
            press: (key: string) => { document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); },
            paste: (tsv: string, r?: number, c?: number) => { focusedRef.current = true; if (r != null && c != null) apiRef.current.moveTo(r, c); apiRef.current.doPaste(tsv, r, c); },
            copy: () => apiRef.current.doCopy(),
            state: () => ({ rows: apiRef.current.rows.length, active: apiRefActive.current, edit: !!editRef.current }),
        };
        return () => { delete (window as unknown as { __sheet?: unknown }).__sheet; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── 렌더 ──────────────────────────────────────────────────
    const totalRows = ghostR + 1;   // ghost 한 줄 포함
    return (
        <div className="flex flex-col min-h-0">
            <div
                ref={containerRef}
                tabIndex={0}
                onFocus={() => { focusedRef.current = true; }}
                onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) focusedRef.current = false; }}
                className="overflow-auto outline-none border border-line rounded-md select-none"
                style={{ maxHeight: '62vh' }}
            >
                <table className="border-collapse text-[12px]" style={{ minWidth: minWidth ?? 'auto' }}>
                    <thead className="sticky top-0 z-20">
                        <tr>
                            <th className="sticky left-0 z-30 bg-panel border-b border-r border-line w-10 min-w-[2.5rem]" />
                            {columns.map((col) => (
                                <th key={col.key}
                                    className="bg-panel border-b border-line px-2 py-1.5 text-left font-medium text-muted whitespace-nowrap"
                                    style={{ width: col.width ?? 120, minWidth: col.width ?? 120 }}>
                                    {col.title}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from({ length: totalRows }, (_, r) => {
                            const isGhost = r === ghostR;
                            const rowSelected = inSel(r, 0) && sel.c1 === 0 && sel.c2 === nCols - 1;
                            return (
                                <tr key={r < rows.length ? rows[r]._id : `__ghost_${r}`}
                                    className={isGhost ? 'opacity-70' : ''}>
                                    <RowHead r={r} isGhost={isGhost} selected={rowSelected}
                                        onSelectRow={() => { setAnchor({ r, c: 0 }); setActive({ r, c: nCols - 1 }); focusedRef.current = true; focusGrid(); }}
                                        menuOpen={menuRow === r} onToggleMenu={() => setMenuRow(menuRow === r ? null : r)}
                                        onOp={(kind) => rowOp(kind, r)} />
                                    {columns.map((col, c) => {
                                        const value = cellValueOf(rows, r, col, emptyRow);
                                        const err = isGhost ? undefined : builtinValidate(col, value, rows[r] ?? emptyRow);
                                        const note = isGhost || err ? undefined : col.note?.(value, rows[r] ?? emptyRow);
                                        const selected = inSel(r, c);
                                        const isActive = active.r === r && active.c === c;
                                        const inFill = fillRef.current && fillTo != null && c >= sel.c1 && c <= sel.c2 && r > sel.r2 && r <= fillTo;
                                        const editing = edit?.r === r && edit?.c === c;
                                        return (
                                            <Cell key={col.key} col={col} value={value} err={err} note={note}
                                                selected={selected || inFill} isActive={isActive}
                                                bottomRight={isActive && !editing}
                                                onFillStart={() => { fillRef.current = true; setFillTo(sel.r2); }}
                                                editing={editing} editText={edit?.text ?? ''}
                                                sugIdx={sugIdx} setSugIdx={setSugIdx}
                                                onMouseDown={(e) => {
                                                    if (e.button !== 0) return;
                                                    focusedRef.current = true; focusGrid();
                                                    setMenuRow(null);
                                                    if (e.shiftKey) setActive({ r, c });
                                                    else { setAnchor({ r, c }); setActive({ r, c }); }
                                                    if (!e.shiftKey) dragRef.current = true;
                                                }}
                                                onMouseEnter={() => {
                                                    if (fillRef.current) setFillTo(Math.max(sel.r2, r));
                                                    else if (dragRef.current) setActive({ r, c });
                                                }}
                                                onDoubleClick={() => beginEdit(r, c)}
                                                onEditChange={(t) => setEdit((ed) => (ed ? { ...ed, text: t } : ed))}
                                                onEditCommit={(dr, dc, pick) => commitEdit(dr, dc, pick)}
                                                onEditCancel={cancelEdit}
                                            />
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <StatusLine sel={sel} rowCount={rows.length} nCols={nCols} extra={statusExtra} />
        </div>
    );
}

// ── 행 머리 (번호 + ⋯ 메뉴) ───────────────────────────────────
function RowHead({ r, isGhost, selected, onSelectRow, menuOpen, onToggleMenu, onOp }: {
    r: number; isGhost: boolean; selected: boolean; onSelectRow: () => void;
    menuOpen: boolean; onToggleMenu: () => void; onOp: (kind: 'above' | 'below' | 'dup' | 'del') => void;
}) {
    return (
        <td className={`sticky left-0 z-10 border-b border-r border-line text-center align-middle relative ${selected ? 'bg-accent/25' : 'bg-panel'}`}>
            <div className="flex items-center justify-between px-1">
                <button className="text-[10px] text-muted hover:text-text w-5 text-left" title="행 선택"
                    onClick={onSelectRow}>{isGhost ? '＋' : r + 1}</button>
                {!isGhost && (
                    <button className="text-muted hover:text-text px-0.5 leading-none" title="행 메뉴" onClick={onToggleMenu}>⋯</button>
                )}
            </div>
            {menuOpen && !isGhost && (
                <div className="absolute left-8 top-0 z-40 bg-panel2 border border-line rounded-md shadow-xl text-[12px] text-text w-32 py-1">
                    {([['above', '위에 삽입'], ['below', '아래에 삽입'], ['dup', '복제'], ['del', '삭제']] as const).map(([kind, label]) => (
                        <button key={kind} onClick={() => onOp(kind)}
                            className={`block w-full text-left px-2 py-1 hover:bg-line ${kind === 'del' ? 'text-bad' : ''}`}>{label}</button>
                    ))}
                </div>
            )}
        </td>
    );
}

// ── 셀 ────────────────────────────────────────────────────────
interface CellProps {
    col: SheetColumn; value: CellValue; err?: string; note?: string;
    selected: boolean; isActive: boolean; bottomRight: boolean; editing: boolean; editText: string;
    sugIdx: number; setSugIdx: (n: number) => void;
    onFillStart: () => void;
    onMouseDown: (e: ReactMouseEvent) => void;
    onMouseEnter: () => void;
    onDoubleClick: () => void;
    onEditChange: (t: string) => void;
    onEditCommit: (dr: number, dc: number, pick?: string) => void;
    onEditCancel: () => void;
}
function Cell(p: CellProps) {
    const { col, value, err, note, selected, isActive, editing } = p;
    const align = col.align ?? (col.type === 'number' ? 'right' : col.type === 'bool' ? 'center' : 'left');
    const base: CSSProperties = { width: col.width ?? 120, minWidth: col.width ?? 120, maxWidth: col.width ?? 120 };
    const cls = [
        'border-b border-r border-line px-2 py-1 relative whitespace-nowrap overflow-hidden text-ellipsis cursor-cell',
        `text-${align}`,
        selected ? 'bg-accent/15' : '',
        isActive ? 'outline outline-2 -outline-offset-1 outline-accent z-10' : '',
        err ? 'ring-1 ring-inset ring-bad' : note ? 'ring-1 ring-inset ring-accent' : '',
        col.readOnly || col.compute ? 'text-muted' : 'text-text',
    ].join(' ');

    if (editing) {
        return (
            <td className="border-b border-r border-line px-2 py-1 relative z-30" style={{ ...base, overflow: 'visible' }}>
                <div className="relative w-full h-6">
                    <CellEditor col={col} initial={p.editText} sugIdx={p.sugIdx} setSugIdx={p.setSugIdx}
                        onChange={p.onEditChange} onCommit={p.onEditCommit} onCancel={p.onEditCancel} />
                </div>
            </td>
        );
    }

    let shown: ReactNode;
    if (col.type === 'bool') shown = value ? '✓' : '';
    else if (col.type === 'list') shown = Array.isArray(value) ? value.join(', ') : String(value ?? '');
    else shown = String(value ?? '');

    return (
        <td className={cls} style={base} title={err ?? note ?? undefined}
            onMouseDown={p.onMouseDown} onMouseEnter={p.onMouseEnter} onDoubleClick={p.onDoubleClick}>
            {shown === '' ? <span className="text-muted/40">{col.placeholder ?? ''}</span> : shown}
            {p.bottomRight && !col.readOnly && !col.compute && (
                <span
                    onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); p.onFillStart(); }}
                    className="absolute -bottom-[3px] -right-[3px] w-2 h-2 bg-accent border border-panel cursor-crosshair z-20"
                    title="끌어서 아래로 채우기" />
            )}
        </td>
    );
}

// ── 셀 편집창 (자동완성 · select) ─────────────────────────────
function CellEditor({ col, initial, sugIdx, setSugIdx, onChange, onCommit, onCancel }: {
    col: SheetColumn; initial: string; sugIdx: number; setSugIdx: (n: number) => void;
    onChange: (t: string) => void; onCommit: (dr: number, dc: number, pick?: string) => void; onCancel: () => void;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const selectRef = useRef<HTMLSelectElement>(null);
    useEffect(() => {
        if (col.type === 'select') selectRef.current?.focus();
        else { const el = inputRef.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (col.type === 'select') {
        const opts = [...(col.allowEmpty ? [''] : []), ...(col.options ?? [])];
        return (
            <select ref={selectRef} value={initial}
                onChange={(e) => onCommit(1, 0, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onCancel(); } if (e.key === 'Tab') { e.preventDefault(); onCommit(0, e.shiftKey ? -1 : 1, (e.target as HTMLSelectElement).value); } }}
                onBlur={(e) => onCommit(0, 0, e.target.value)}
                className="absolute inset-0 w-full h-full bg-panel2 text-text border-2 border-accent outline-none text-[12px] px-1">
                {opts.map((o) => <option key={o} value={o}>{o === '' ? '(없음)' : o}</option>)}
            </select>
        );
    }

    // text · number · list
    const pool = col.suggest ?? (col.type === 'list' ? col.options : undefined) ?? [];
    const frag = col.type === 'list' ? initial.split(',').pop()!.trim() : initial.trim();
    const sug = frag && pool.length
        ? pool.filter((o) => o.toLowerCase().includes(frag.toLowerCase())).slice(0, 8)
        : [];
    const applyPick = (pick: string): string => {
        if (col.type !== 'list') return pick;
        const parts = initial.split(',');
        parts[parts.length - 1] = ` ${pick}`;
        return parts.join(',').replace(/^\s+/, '');
    };

    return (
        <div className="absolute inset-0 z-30">
            <input ref={inputRef} value={initial}
                inputMode={col.type === 'number' ? 'decimal' : undefined}
                onChange={(e) => { onChange(e.target.value); setSugIdx(0); }}
                onKeyDown={(e) => {
                    if (e.key === 'Escape') { e.preventDefault(); onCancel(); return; }
                    if (e.key === 'ArrowDown' && sug.length) { e.preventDefault(); setSugIdx(Math.min(sug.length - 1, sugIdx + 1)); return; }
                    if (e.key === 'ArrowUp' && sug.length) { e.preventDefault(); setSugIdx(Math.max(0, sugIdx - 1)); return; }
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        if (sug.length && sug[sugIdx]) onCommit(1, 0, applyPick(sug[sugIdx]));
                        else onCommit(1, 0);
                        return;
                    }
                    if (e.key === 'Tab') {
                        e.preventDefault();
                        const pick = sug.length && sug[sugIdx] ? applyPick(sug[sugIdx]) : undefined;
                        onCommit(0, e.shiftKey ? -1 : 1, pick);
                        return;
                    }
                }}
                onBlur={() => onCommit(0, 0)}
                placeholder={col.placeholder}
                className="w-full h-full bg-panel2 text-text border-2 border-accent outline-none text-[12px] px-1" />
            {sug.length > 0 && (
                <div className="absolute left-0 top-full min-w-full bg-panel2 border border-line rounded-b-md shadow-xl z-40 max-h-48 overflow-auto">
                    {sug.map((o, i) => (
                        <button key={o} onMouseDown={(e) => { e.preventDefault(); onCommit(1, 0, applyPick(o)); }}
                            className={`block w-full text-left px-2 py-1 text-[12px] ${i === sugIdx ? 'bg-accent text-white' : 'text-text hover:bg-line'}`}>{o}</button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── 상태줄 ────────────────────────────────────────────────────
function StatusLine({ sel, rowCount, nCols, extra }: { sel: { r1: number; r2: number; c1: number; c2: number }; rowCount: number; nCols: number; extra?: ReactNode }) {
    const rows = sel.r2 - sel.r1 + 1;
    const cols = sel.c2 - sel.c1 + 1;
    const all = sel.c1 === 0 && sel.c2 === nCols - 1;
    return (
        <div className="shrink-0 flex items-center gap-2 px-2 py-1 text-[11px] text-muted border-x border-b border-line rounded-b-md bg-panel/60 overflow-x-auto whitespace-nowrap">
            <span>선택 {rows}행 × {cols}열</span>
            <span className="text-muted/50">·</span>
            <span>{all ? 'Del 값 비움 · ⌘V 붙이기' : '글자 입력=편집 · ⌘C 복사 · ⌘V 붙이기'}</span>
            <span className="text-muted/50">·</span>
            <span>Enter 아래(끝에서 새 행) · ⌘D 아래로 채우기 · ⋯ 행 삽입/삭제</span>
            <span className="text-muted/50">· 전체 {rowCount}행</span>
            {extra && <span className="ml-auto flex items-center">{extra}</span>}
        </div>
    );
}
