/**
 * 시간표 그리드 화면 — 달력 주 보기 꼴(Q4 T5): 왼쪽에 시각 눈금 + 행 머리, 위에 열 머리, 칸 줄.
 *   🔴 행(교시 같은 것)은 **시각 띠**다 — 높이 = 그 행이 차지하는 시간이라 행 사이 쉬는 틈도 그대로 보인다.
 *   🔴 데이터는 받은 data 를 읽고 edit(순수 함수)로만 바꾼다 — 저장·되돌리기는 위(GridTab → nodes.ts)가 쥔다.
 *   🔴 W10a: 행 길이(분)가 1급 값 — 행 아래 끝을 끌면 길이가 바뀌고 뒤 행이 같이 밀린다(5분 단위 · 최소 5분).
 *         쉬는 시간은 행이 아니라 행 사이 갭 — 빈 띠 + 「쉬는 시간 N분」, 갭 아래 끝을 끌어 늘리고 줄인다(뒤 행이 밀림).
 *         끄는 동안은 모델 함수(setRowLength·setGapBefore)로 미리 그리고, 놓을 때 한 번 저장 = 되돌리기 한 칸.
 *   조작: 칸 글자는 칸에서 바로 · 열 너비는 열 머리 오른쪽 가장자리를 끌어서
 *         · 병합·행/열 넣고 빼기는 우클릭(길게 누르기) 메뉴. 위쪽 도구 줄은 W10b 툴바(GridToolbar)가 Frame 툴바 자리에.
 *   칸은 스프레드시트처럼 두 상태다(W-T): 선택(격자에 초점 — 화살표·Tab·⇧Enter 이동 · ⇧/끌기/⇧클릭 범위 · Delete 지우기 · ⌘C/X/V TSV)
 *         ↔ 편집(타자 시작·F2·Enter·더블클릭 — Enter 확정+아래 · Tab 확정+옆 · Esc 취소 · ⌥Enter 줄바꿈). 이동은 gridNav.ts(병합을 한 칸으로).
 *   shortcut: 시트 엔진(useSheetCore)은 안 쓴다 — 병합·시각 띠 배치를 모르는 엔진이라. 채우기 손잡이는 없다.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { step, ownerOf, rangeTsv, clearRange, pasteTsv, type Pos } from '../gridNav';
import { isMod, isAlt, Button, ContextMenu, FrameToolbarPortal, Icon, isImeEnter, useContextTrigger, type MenuEntry } from '../../../pane-ui-system';
import { GridToolbar } from './GridToolbar';
import {
    columnCount, rowCount, colName, getCell, isCovered, canMerge, mergeCells, unmergeCells, addRow, removeRow,
    addColumn, removeColumn, renameRow, renameColumn, setCellText, setRowLength, setGapBefore, rowLength, gapBefore, setColWidth, colWidth, viewRange,
    COL_MIN_W, type TimetableData, type Selection,
} from '../model';

const DEFAULT_PPM = 0.8;  // 1분 = 0.8px → 50분 ≈ 40px, 1시간 = 48px (툴바 확대/축소로 바뀐다)
const TIME_W = 44;        // 왼쪽 시각 눈금 폭
const HEAD_W = 76;        // 행 머리(이름·시각) 폭
const LEFT_W = TIME_W + HEAD_W;
const HEADER_H = 32;
const SNAP = 5;           // 분

function fmt(min: number): string {
    return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** 입력칸 — 타자마다 저장하지 않고 Enter·포커스 빠질 때 한 번만 넘긴다(Esc 는 취소). 한 단계 = 되돌리기 한 칸. */
function CommitField({ value, onCommit, className, label, placeholder, multiline, onFocus }: {
    value: string; onCommit: (v: string) => void; className: string; label: string;
    placeholder?: string; multiline?: boolean; onFocus?: () => void;
}) {
    const [draft, setDraft] = useState<string | null>(null);
    const skip = useRef(false);
    const common = {
        value: draft ?? value, placeholder, 'aria-label': label, className, onFocus,
        onBlur: () => { if (!skip.current && draft !== null && draft !== value) onCommit(draft); skip.current = false; setDraft(null); },
    };
    const onKey = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (e.key === 'Escape') { skip.current = true; e.currentTarget.blur(); }
        else if (e.key === 'Enter' && !e.shiftKey && !isImeEnter(e)) { e.preventDefault(); e.currentTarget.blur(); }
    };
    return multiline
        ? <textarea {...common} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} />
        : <input {...common} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} />;
}

/** 칸 편집창 — 열릴 때 스크롤을 밀지 않고 초점·커서를 끝에 둔다(useLayoutEffect 라 한글 첫 키 조합을 그 자리에서 잇는다). ⌥Enter = 줄바꿈. */
function CellEditor({ text, label, onChange, onKey, onBlur }: {
    text: string; label: string; onChange: (t: string) => void;
    onKey: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void; onBlur: () => void;
}) {
    const ref = useRef<HTMLTextAreaElement | null>(null);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.focus({ preventScroll: true });
        el.setSelectionRange(el.value.length, el.value.length);
    }, []);
    return (
        <textarea ref={ref} value={text} aria-label={label} onChange={(e) => onChange(e.target.value)} onBlur={onBlur}
            onKeyDown={(e) => {
                if (e.key === 'Enter' && isAlt(e) && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    const el = e.currentTarget, a = el.selectionStart ?? el.value.length, b = el.selectionEnd ?? a;
                    onChange(el.value.slice(0, a) + '\n' + el.value.slice(b));
                    return;
                }
                onKey(e);
            }}
            className="h-full w-full resize-none rounded-sm bg-panel px-1.5 py-1 text-small text-text outline-none ring-1 ring-inset ring-accent" />
    );
}

type Live = { kind: 'row'; row: number; len: number } | { kind: 'gap'; row: number; gap: number } | { kind: 'col'; col: number; width: number } | null;

export interface TimeGridToolbarProps {
    /** Frame 툴바 자리 — 없으면 툴바를 안 그린다 */
    toolbarHost?: HTMLElement | null;
    onNotice?: (msg: string) => void;
    undo?: () => void; redo?: () => void; canUndo?: boolean; canRedo?: boolean;
}

export function TimeGrid({ data, edit, onRemoved, focusFirst, onFocusedFirst, toolbarHost, onNotice, undo, redo, canUndo, canRedo }: {
    data: TimetableData; edit: (fn: (d: TimetableData) => TimetableData) => void; onRemoved?: (title: string) => void;
    /** 새로 만든 직후 — 격자 첫 칸을 선택하고 초점을 준다(시트 「새로 만들기」와 같게) */
    focusFirst?: boolean; onFocusedFirst?: () => void;
} & TimeGridToolbarProps) {
    const [ppm, setPpm] = useState(DEFAULT_PPM);
    const nCols = columnCount(data.columns);
    const nRows = rowCount(data);
    const [live, setLive] = useState<Live>(null);
    // 끄는 중엔 모델 함수로 밀린 모습을 미리 그린다(놓을 때 같은 함수로 한 번 저장).
    const shown = live?.kind === 'row' ? setRowLength(data, live.row, live.len) : live?.kind === 'gap' ? setGapBefore(data, live.row, live.gap) : data;
    const view = viewRange(shown);
    const [sel, setSel] = useState<Selection | null>(null);
    const [menu, setMenu] = useState<{ x: number; y: number; items: MenuEntry[] } | null>(null);
    const dragRef = useRef<{ y0: number; x0: number; v0: number } | null>(null);

    // ── 칸 선택 ↔ 편집(W-T) — sel.col0/row0 = 활성 칸(앵커), col1/row1 = 범위 끝 ──
    const gridRef = useRef<HTMLDivElement | null>(null);
    const [editing, setEditingState] = useState<{ c: number; r: number; text: string; orig: string } | null>(null);
    const editRef = useRef(editing);
    const setEditing = (v: typeof editing) => { editRef.current = v; setEditingState(v); };
    const selRef = useRef(sel); selRef.current = sel;
    const dataRef = useRef(data); dataRef.current = data;
    const selDrag = useRef(false);
    const editFn = useRef(edit); editFn.current = edit;
    const onNoticeRef = useRef(onNotice); onNoticeRef.current = onNotice;
    const pointerRef = useRef(false);   // 마우스로 들어온 초점은 클릭이 칸을 고른다 — 키보드·코드 초점(탐색기에서 새로 만듦)일 때만 첫 칸
    const focusGrid = () => gridRef.current?.focus({ preventScroll: true });
    const reveal = (p: Pos) => gridRef.current?.querySelector<HTMLElement>(`[data-c="${p.c}"][data-r="${p.r}"]`)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    const selectAt = (p: Pos) => { setSel({ col0: p.c, row0: p.r, col1: p.c, row1: p.r }); reveal(p); };
    useEffect(() => {
        if (!focusFirst) return;
        selectAt({ c: 0, r: 0 }); focusGrid(); onFocusedFirst?.();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    /** 칸 지우기 — 바뀐 게 있을 때만 「알림+되돌리기」(행·열 지우기와 같은 길). */
    const clearSel = (s: Selection) => {
        const d0 = dataRef.current;
        if (clearRange(d0, s) === d0) return;
        editFn.current((d) => clearRange(d, s));
        onRemoved?.('칸 글자를 지웠습니다');
        
    };
    const beginEdit = (p: Pos, typed?: string) => {
        const orig = getCell(data, p.c, p.r)?.text ?? '';
        setSel({ col0: p.c, row0: p.r, col1: p.c, row1: p.r });
        setEditing({ c: p.c, r: p.r, text: typed ?? orig, orig });
    };
    /** 편집 확정 — 한 번 = 되돌리기 한 칸. move 가 있으면 그만큼 옮겨 선택 상태로(초점은 격자). */
    const commitEdit = (move: [number, number] | null, cancel = false) => {
        const e = editRef.current;
        if (!e) return;
        setEditing(null);
        if (!cancel && e.text !== e.orig) edit((d) => setCellText(d, e.c, e.r, e.text));
        if (move) { selectAt(step(data, e, move[0], move[1])); focusGrid(); }
    };
    const onGridKey = (e: React.KeyboardEvent) => {
        if (e.target !== gridRef.current || editRef.current) return;
        const k = e.key, meta = isMod(e);
        const cur: Pos = sel ? { c: sel.col0, r: sel.row0 } : { c: 0, r: 0 };
        const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        if (!sel && (dirs[k] || k === 'Tab' || k === 'Enter')) { e.preventDefault(); selectAt(cur); return; }
        if (dirs[k] && !meta && !isAlt(e)) {
            e.preventDefault();
            if (e.shiftKey && sel) { const end = step(data, { c: sel.col1, r: sel.row1 }, ...dirs[k]); setSel({ ...sel, col1: end.c, row1: end.r }); reveal(end); }
            else selectAt(step(data, cur, ...dirs[k]));
            return;
        }
        if (meta || isAlt(e)) return;   // ⌘Z 등은 위(GridTab)로 흘린다 · ⌘C/X/V 는 문서 clipboard 이벤트로
        if (k === 'Tab') {
            // Tab = 오른쪽 칸 · 행 끝이면 다음 행 첫 칸 · 마지막 칸(⇧: 첫 칸)에선 격자 밖으로(기본 동작)
            const o = ownerOf(data, cur.c, cur.r), nxt = step(data, cur, e.shiftKey ? -1 : 1, 0);
            if (nxt.c !== o.c || nxt.r !== o.r) { e.preventDefault(); selectAt(nxt); return; }
            const lastC = nCols - 1;
            if (!e.shiftKey) {
                const below = step(data, { c: o.c, r: o.r }, 0, 1);
                if (below.r === o.r) return;
                e.preventDefault(); selectAt(ownerOf(data, 0, below.r)); return;
            }
            const above = step(data, { c: o.c, r: o.r }, 0, -1);
            if (above.r === o.r) return;
            e.preventDefault(); selectAt(ownerOf(data, lastC, above.r)); return;
        }
        // 🙋17 시트와 같게(구글 시트 관례) — 선택 상태 Enter = 편집 시작 · ⇧Enter = 위로. 편집 중 Enter(확정+아래)는 편집창이 받는다.
        if (k === 'Enter') {
            if (isImeEnter(e)) return;
            e.preventDefault();
            if (e.shiftKey) selectAt(step(data, cur, 0, -1)); else beginEdit(cur);
            return;
        }
        if (k === 'F2') { e.preventDefault(); beginEdit(cur); return; }
        if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); if (sel) clearSel(sel); return; }
        if (k === 'Escape') { if (sel) setSel({ ...sel, col1: sel.col0, row1: sel.row0 }); return; }
        // 한글 첫 글자 — 조합 키는 막지 않고 빈 편집창을 동기로 열어 그 자리에서 조합을 이어받게 한다(시트와 같은 수).
        if (k === 'Process' || e.nativeEvent.isComposing) { flushSync(() => beginEdit(cur, '')); return; }
        if (k.length === 1) { e.preventDefault(); beginEdit(cur, k); }
    };
    // 복사·잘라내기·붙여넣기 — 초점 없는 div 엔 clipboard 이벤트가 안 오므로 문서에서 받는다(격자에 초점 · 선택 상태일 때만).
    useEffect(() => {
        const mine = () => document.activeElement === gridRef.current && !editRef.current && selRef.current;
        const onCopy = (e: ClipboardEvent, cut: boolean) => {
            const s = mine();
            if (!s) return;
            e.clipboardData?.setData('text/plain', rangeTsv(dataRef.current, s));
            e.preventDefault();
            if (cut) clearSel(s);
        };
        const onPaste = (e: ClipboardEvent) => {
            const s = mine();
            if (!s) return;
            e.preventDefault();
            const r = pasteTsv(dataRef.current, s, e.clipboardData?.getData('text/plain') ?? '');
            if (r.data !== dataRef.current) editFn.current(() => r.data);
            setSel(r.area);
            if (r.notice) onNoticeRef.current?.(r.notice);
        };
        const copy = (e: ClipboardEvent) => onCopy(e, false), cut = (e: ClipboardEvent) => onCopy(e, true);
        const up = () => { selDrag.current = false; };
        document.addEventListener('copy', copy); document.addEventListener('cut', cut); document.addEventListener('paste', onPaste);
        window.addEventListener('mouseup', up);
        return () => {
            document.removeEventListener('copy', copy); document.removeEventListener('cut', cut); document.removeEventListener('paste', onPaste);
            window.removeEventListener('mouseup', up);
        };
    }, []);
    const onCellDown = (e: React.MouseEvent, c: number, r: number) => {
        if (e.button !== 0) return;
        if (editRef.current?.c === c && editRef.current.r === r) return;   // 편집 중인 칸 안 클릭은 글 커서 몫
        e.preventDefault();   // 초점은 격자에 — 칸 클릭으로 스크롤이 밀리지 않게(preventScroll)
        commitEdit(null);
        if (e.shiftKey && sel) setSel({ ...sel, col1: c, row1: r });
        else { setSel({ col0: c, row0: r, col1: c, row1: r }); selDrag.current = true; }
        focusGrid();
    };
    const onCellOver = (c: number, r: number) => {
        if (selDrag.current && sel && (sel.col1 !== c || sel.row1 !== r)) setSel({ ...sel, col1: c, row1: r });
    };

    // ── 좌표 — 끄는 중엔 live 값으로 덮어 그린다(놓을 때 한 번만 저장) ──
    const rowStart = (r: number) => shown.rows[r].range.start;
    const rowEnd = (r: number) => shown.rows[r].range.end;
    const widthOf = (c: number) => (live?.kind === 'col' && live.col === c ? live.width : colWidth(data, c));
    const lefts: number[] = [];
    let gridW = 0;
    for (let c = 0; c < nCols; c++) { lefts.push(gridW); gridW += widthOf(c); }
    const yOf = (min: number) => Math.round((min - view.start) * ppm);
    const bodyH = yOf(view.end);

    // ── 끌기(행 시각 · 열 너비) ──
    function beginDrag(e: React.PointerEvent, next: Live, v0: number) {
        e.preventDefault(); e.stopPropagation();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        dragRef.current = { y0: e.clientY, x0: e.clientX, v0 };
        setLive(next);
    }
    function moveDrag(e: React.PointerEvent) {
        const d = dragRef.current;
        if (!d || !live) return;
        if (live.kind === 'col') { setLive({ ...live, width: Math.max(COL_MIN_W, Math.round(d.v0 + e.clientX - d.x0)) }); return; }
        const raw = Math.round((d.v0 + (e.clientY - d.y0) / ppm) / SNAP) * SNAP;
        if (live.kind === 'row') setLive({ ...live, len: Math.max(SNAP, raw) });
        else setLive({ ...live, gap: Math.max(0, raw) });
    }
    function endDrag() {
        const l = live;
        dragRef.current = null; setLive(null);
        if (!l) return;
        if (l.kind === 'col') { edit((d) => setColWidth(d, l.col, l.width)); return; }
        if (l.kind === 'row') { if (l.len !== rowLength(data, l.row)) edit((d) => setRowLength(d, l.row, l.len)); return; }
        if (l.gap !== gapBefore(data, l.row)) edit((d) => setGapBefore(d, l.row, l.gap));
    }
    const dragProps = { onPointerMove: moveDrag, onPointerUp: endDrag, onPointerCancel: endDrag };

    // ── 선택 · 우클릭 메뉴 ──
    const inSel = (c: number, r: number, c1: number, r1: number) => {
        if (!sel) return false;
        return c <= Math.max(sel.col0, sel.col1) && c1 >= Math.min(sel.col0, sel.col1) && r <= Math.max(sel.row0, sel.row1) && r1 >= Math.min(sel.row0, sel.row1);
    };
    const trigger = useContextTrigger((x, y, e) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>('[data-c],[data-r]');
        const c = el?.dataset.c !== undefined ? Number(el.dataset.c) : null;
        const r = el?.dataset.r !== undefined ? Number(el.dataset.r) : null;
        let cur = sel;
        if (c !== null && r !== null && !(sel && inSel(c, r, c, r))) { cur = { col0: c, row0: r, col1: c, row1: r }; setSel(cur); }
        const items: MenuEntry[] = [];
        if (c !== null && r !== null && cur) {
            const anchor = cur.col0 === cur.col1 && cur.row0 === cur.row1 ? getCell(data, cur.col0, cur.row0) : undefined;
            items.push(
                { label: '칸 병합', icon: 'layers', disabled: !canMerge(data, cur).ok, onClick: () => edit((d) => mergeCells(d, cur!)) },
                { label: '병합 해제', icon: 'x', disabled: !anchor || ((anchor.rowSpan ?? 1) <= 1 && (anchor.colSpan ?? 1) <= 1), onClick: () => { edit((d) => unmergeCells(d, cur!.col0, cur!.row0)); onRemoved?.('병합을 풀었습니다'); } },
                { sep: true },
            );
        }
        if (r !== null) {
            items.push(
                { label: '위에 교시 넣기', icon: 'plus', onClick: () => edit((d) => addRow(d, r)) },
                { label: '아래에 교시 넣기', icon: 'plus', onClick: () => edit((d) => addRow(d, r + 1)) },
                { label: '이 교시 삭제', icon: 'trash', danger: true, disabled: nRows <= 1, onClick: () => { edit((d) => removeRow(d, r)); setSel(null); onRemoved?.('교시 1개를 삭제했습니다'); } },
            );
        }
        if (c !== null) {
            if (r !== null) items.push({ sep: true });
            items.push(
                { label: '열 넣기(맨 끝)', icon: 'plus', disabled: addColumn(data) === data, onClick: () => edit((d) => addColumn(d)) },
                { label: '이 열 삭제', icon: 'trash', danger: true, disabled: nCols <= 1, onClick: () => { edit((d) => removeColumn(d, c)); setSel(null); onRemoved?.('열 1개를 삭제했습니다'); } },
            );
        }
        if (items.length) setMenu({ x, y, items });
    });

    // ── 그리기 ──
    const hours: number[] = [];
    for (let h = Math.ceil(view.start / 60); h * 60 <= view.end; h++) hours.push(h);

    return (<>
        <FrameToolbarPortal host={toolbarHost} fallback="none">
            <GridToolbar data={data} row={sel ? Math.min(sel.row0, sel.row1) : null} edit={edit} onNotice={onNotice} onRemoved={onRemoved}
                onRowRemoved={() => setSel(null)} onClear={() => { if (sel) clearSel(sel); }} canClear={!!sel}
                undo={undo} redo={redo} canUndo={canUndo} canRedo={canRedo} zoom={ppm} setZoom={setPpm} />
        </FrameToolbarPortal>
        <div className="h-full overflow-auto" {...trigger}>
            <div className="relative" style={{ width: LEFT_W + gridW + 40, minWidth: '100%' }}>
                {/* 열 머리 — 위에 붙는다 */}
                <div className="sticky top-0 z-20 flex border-b border-line bg-panel" style={{ height: HEADER_H }}>
                    <div className="sticky left-0 z-30 shrink-0 border-r border-line bg-panel" style={{ width: LEFT_W }} />
                    {Array.from({ length: nCols }, (_, c) => (
                        <div key={c} data-c={c} className="relative shrink-0 border-r border-line" style={{ width: widthOf(c) }}>
                            <CommitField value={colName(data, c)} label={`열 ${c + 1} 이름`} placeholder={`열 ${c + 1}`}
                                onCommit={(v) => edit((d) => renameColumn(d, c, v))}
                                className="h-full w-full bg-transparent px-1 text-center text-small font-medium text-text outline-none focus:bg-text/[0.04]" />
                            <div data-testid="col-resize" title="끌어서 열 너비 조절" onPointerDown={(e) => beginDrag(e, { kind: 'col', col: c, width: widthOf(c) }, widthOf(c))}
                                {...dragProps} className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-accent/40" />
                        </div>
                    ))}
                    <div className="flex shrink-0 items-center px-1">
                        <Button variant="plain" size="sm" title="열 넣기" aria-label="열 넣기" disabled={addColumn(data) === data} onClick={() => edit((d) => addColumn(d))}>
                            <Icon name="plus" size={12} />
                        </Button>
                    </div>
                </div>

                {/* 몸통 — 왼쪽 눈금·행 머리 + 칸 줄 */}
                <div className="flex">
                    <div className="sticky left-0 z-10 shrink-0 border-r border-line bg-panel" style={{ width: LEFT_W, height: bodyH }}>
                        {hours.map((h) => (
                            <span key={h} className="absolute left-0 bg-panel pr-1 text-micro leading-none tabular-nums text-muted text-right" style={{ top: Math.max(0, yOf(h * 60) - 5), width: TIME_W - 2 }}>
                                {fmt(h * 60)}
                            </span>
                        ))}
                        {data.rows.map((row, r) => {
                            const top = yOf(rowStart(r)), h = yOf(rowEnd(r)) - top;
                            return (
                                <div key={row.id} data-r={r} className="absolute overflow-hidden border-y border-line bg-text/[0.03]" style={{ left: TIME_W, width: HEAD_W, top, height: h }}>
                                    <CommitField value={row.name} label={`${r + 1}교시 이름`} placeholder={`${r + 1}교시`}
                                        onCommit={(v) => edit((d) => renameRow(d, r, v))}
                                        className="w-full bg-transparent px-1.5 pt-1 text-small text-text outline-none focus:bg-text/[0.04]" />
                                    {h >= 40 && <div className="px-1.5 text-micro tabular-nums text-muted">{fmt(rowStart(r))}~{fmt(rowEnd(r))}</div>}
                                    <div data-testid="row-edge-end" title="끌어서 길이 조절(뒤 행이 밀린다)" onPointerDown={(e) => beginDrag(e, { kind: 'row', row: r, len: rowLength(data, r) }, rowLength(data, r))}
                                        {...dragProps} className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize hover:bg-accent/40" />
                                </div>
                            );
                        })}
                        {/* 갭 손잡이 — 행 사이 쉬는 시간의 아래 끝(= 뒤 행 위 끝). 갭이 0이어도 잡을 수 있다. */}
                        {data.rows.map((row, r) => r === 0 ? null : (
                            <div key={`gap-${row.id}`} data-testid="gap-edge" title="끌어서 쉬는 시간 조절(뒤 행이 밀린다)"
                                onPointerDown={(e) => beginDrag(e, { kind: 'gap', row: r, gap: gapBefore(data, r) }, gapBefore(data, r))}
                                {...dragProps} className="absolute z-10 h-1.5 cursor-ns-resize hover:bg-accent/40" style={{ left: TIME_W, width: HEAD_W, top: yOf(rowStart(r)) - 1 }} />
                        ))}
                    </div>

                    <div ref={gridRef} tabIndex={0} role="grid" aria-label="시간표 칸" onKeyDown={onGridKey}
                        onPointerDownCapture={() => { pointerRef.current = true; }} onPointerUp={() => { pointerRef.current = false; }}
                        onFocus={(e) => { if (e.target === e.currentTarget && !pointerRef.current && !selRef.current) selectAt({ c: 0, r: 0 }); }}
                        className="relative shrink-0 outline-none" style={{ width: gridW, height: bodyH }}>
                        {hours.map((h) => <div key={h} className="absolute inset-x-0 border-t border-line/60" style={{ top: yOf(h * 60) }} />)}
                        {data.rows.map((row, r) => (
                            <div key={row.id} className="absolute inset-x-0 bg-text/[0.025]" style={{ top: yOf(rowStart(r)), height: yOf(rowEnd(r)) - yOf(rowStart(r)) }} />
                        ))}
                        {shown.rows.map((row, r) => {
                            const g = r > 0 ? rowStart(r) - rowEnd(r - 1) : 0;
                            if (g <= 0) return null;
                            const top = yOf(rowEnd(r - 1));
                            return (
                                <div key={`gap-${row.id}`} data-testid="gap" className="pointer-events-none absolute inset-x-0 flex items-center justify-center overflow-visible"
                                    style={{ top, height: yOf(rowStart(r)) - top }}>
                                    <span className="rounded bg-panel px-1 text-micro leading-none text-muted">쉬는 시간 {g}분</span>
                                </div>
                            );
                        })}
                        {lefts.map((l, c) => <div key={c} className="absolute inset-y-0 border-r border-line" style={{ left: l, width: widthOf(c) }} />)}
                        {Array.from({ length: nCols }, (_, c) => data.rows.map((row, r) => {
                            if (isCovered(data, c, r)) return null;
                            const cell = getCell(data, c, r);
                            const r1 = Math.min(r + (cell?.rowSpan ?? 1) - 1, nRows - 1), c1 = Math.min(c + (cell?.colSpan ?? 1) - 1, nCols - 1);
                            const top = yOf(rowStart(r)), height = yOf(rowEnd(r1)) - top;
                            const width = lefts[c1] + widthOf(c1) - lefts[c];
                            const merged = r1 > r || c1 > c;
                            const active = sel?.col0 === c && sel.row0 === r;
                            const single = !!sel && sel.col0 === sel.col1 && sel.row0 === sel.row1;
                            const label = `${colName(data, c) || `열 ${c + 1}`} ${row.name || `${r + 1}교시`} 칸`;
                            return (
                                <div key={`${c}:${row.id}`} data-c={c} data-r={r} className="absolute p-px" style={{ left: lefts[c], width, top, height }}
                                    onMouseDown={(e) => onCellDown(e, c, r)} onMouseOver={() => onCellOver(c, r)} onDoubleClick={() => beginEdit({ c, r })}>
                                    {editing && editing.c === c && editing.r === r
                                        ? <CellEditor text={editing.text} label={label}
                                            onChange={(t) => setEditing({ ...editing, text: t })}
                                            onKey={(e) => {
                                                if (e.nativeEvent.isComposing || isImeEnter(e)) return;   // 조합 중엔 확정·이동 키를 안 받는다
                                                if (e.key === 'Escape') { e.preventDefault(); commitEdit(null, true); selectAt({ c, r }); focusGrid(); }
                                                else if (e.key === 'Enter' && !isAlt(e)) { e.preventDefault(); commitEdit([0, e.shiftKey ? -1 : 1]); }
                                                else if (e.key === 'Tab') { e.preventDefault(); commitEdit([e.shiftKey ? -1 : 1, 0]); }
                                            }}
                                            onBlur={() => commitEdit(null)} />
                                        : <div aria-label={label} title={cell?.text || undefined} style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: Math.max(1, Math.floor((height - 10) / 18)) }} className={`h-full w-full overflow-hidden whitespace-pre-wrap break-words rounded-sm px-1.5 py-1 text-small text-text
                                            ${active ? 'ring-1 ring-inset ring-accent' : ''} ${inSel(c, r, c1, r1) && !single ? 'bg-accent/15' : merged ? 'bg-text/[0.05]' : ''}`}>{cell?.text ?? ''}</div>}
                                </div>
                            );
                        }))}
                    </div>
                </div>

                <div className="sticky left-0 w-max px-1 py-1">
                    <Button variant="plain" size="sm" className="whitespace-nowrap" title="교시 넣기" onClick={() => edit((d) => addRow(d))}><Icon name="plus" size={12} /> 교시</Button>
                </div>
            </div>
            {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
        </div>
    </>);
}
