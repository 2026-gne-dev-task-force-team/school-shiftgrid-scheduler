/**
 * 시간표 그리드 화면 — 달력 주 보기 꼴(Q4 T5): 왼쪽에 시각 눈금 + 행 머리, 위에 열 머리, 칸 줄.
 *   🔴 행(교시 같은 것)은 **시각 띠**다 — 높이 = 그 행이 차지하는 시간이라 행 사이 쉬는 틈도 그대로 보인다.
 *   🔴 데이터는 받은 data 를 읽고 edit(순수 함수)로만 바꾼다 — 저장·되돌리기는 위(GridTab → nodes.ts)가 쥔다.
 *   조작: 칸 글자는 칸에서 바로 · 행 시각은 띠 위·아래 가장자리를 끌어서(5분 단위) · 열 너비는 열 머리 오른쪽 가장자리를 끌어서
 *         · 병합·행/열 넣고 빼기는 우클릭(길게 누르기) 메뉴. ⛔ 위쪽 도구 막대는 없다(T3).
 *   shortcut: 칸 범위 복사·채우기는 없다(칸 하나의 글자 복사만) — 시트 엔진을 안 쓰는 대가. 쓸 일이 생기면 그때 붙인다.
 */
import { useRef, useState } from 'react';
import { Button, ContextMenu, Icon, isImeEnter, useContextTrigger, type MenuEntry } from '../../../pane-ui-system';
import {
    columnCount, rowCount, colName, getCell, isCovered, canMerge, mergeCells, unmergeCells, addRow, removeRow,
    addColumn, removeColumn, renameRow, renameColumn, setCellText, setRowTime, setColWidth, colWidth, viewRange,
    COL_MIN_W, type TimetableData, type Selection,
} from '../model';

const PPM = 0.8;          // 1분 = 0.8px → 50분 ≈ 40px, 1시간 = 48px
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

type Live = { kind: 'row'; row: number; edge: 'start' | 'end'; value: number } | { kind: 'col'; col: number; width: number } | null;

export function TimeGrid({ data, edit, onRemoved }: { data: TimetableData; edit: (fn: (d: TimetableData) => TimetableData) => void; onRemoved?: (title: string) => void }) {
    const nCols = columnCount(data.columns);
    const nRows = rowCount(data);
    const view = viewRange(data);
    const [sel, setSel] = useState<Selection | null>(null);
    const [menu, setMenu] = useState<{ x: number; y: number; items: MenuEntry[] } | null>(null);
    const [live, setLive] = useState<Live>(null);
    const dragRef = useRef<{ y0: number; x0: number; v0: number } | null>(null);

    // ── 좌표 — 끄는 중엔 live 값으로 덮어 그린다(놓을 때 한 번만 저장) ──
    const rowStart = (r: number) => (live?.kind === 'row' && live.row === r && live.edge === 'start' ? live.value : data.rows[r].range.start);
    const rowEnd = (r: number) => (live?.kind === 'row' && live.row === r && live.edge === 'end' ? live.value : data.rows[r].range.end);
    const widthOf = (c: number) => (live?.kind === 'col' && live.col === c ? live.width : colWidth(data, c));
    const lefts: number[] = [];
    let gridW = 0;
    for (let c = 0; c < nCols; c++) { lefts.push(gridW); gridW += widthOf(c); }
    const yOf = (min: number) => Math.round((min - view.start) * PPM);
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
        const raw = Math.round((d.v0 + (e.clientY - d.y0) / PPM) / SNAP) * SNAP;
        const { start, end } = data.rows[live.row].range;
        const value = live.edge === 'start' ? Math.min(Math.max(raw, view.start), end - SNAP) : Math.max(Math.min(raw, view.end), start + SNAP);
        setLive({ ...live, value });
    }
    function endDrag() {
        const l = live;
        dragRef.current = null; setLive(null);
        if (!l) return;
        if (l.kind === 'col') { edit((d) => setColWidth(d, l.col, l.width)); return; }
        const { start, end } = data.rows[l.row].range;
        if (l.value !== (l.edge === 'start' ? start : end)) edit((d) => setRowTime(d, l.row, l.edge === 'start' ? l.value : start, l.edge === 'end' ? l.value : end));
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
                { label: '위에 행 넣기', icon: 'plus', onClick: () => edit((d) => addRow(d, r)) },
                { label: '아래에 행 넣기', icon: 'plus', onClick: () => edit((d) => addRow(d, r + 1)) },
                { label: '이 행 삭제', icon: 'trash', danger: true, disabled: nRows <= 1, onClick: () => { edit((d) => removeRow(d, r)); setSel(null); onRemoved?.('행 1개를 삭제했습니다'); } },
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

    return (
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
                                    <CommitField value={row.name} label={`행 ${r + 1} 이름`} placeholder={`행 ${r + 1}`}
                                        onCommit={(v) => edit((d) => renameRow(d, r, v))}
                                        className="w-full bg-transparent px-1.5 pt-1 text-small text-text outline-none focus:bg-text/[0.04]" />
                                    {h >= 40 && <div className="px-1.5 text-micro tabular-nums text-muted">{fmt(rowStart(r))}~{fmt(rowEnd(r))}</div>}
                                    <div data-testid="row-edge-start" title="끌어서 시작 시각 조절" onPointerDown={(e) => beginDrag(e, { kind: 'row', row: r, edge: 'start', value: row.range.start }, row.range.start)}
                                        {...dragProps} className="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize hover:bg-accent/40" />
                                    <div data-testid="row-edge-end" title="끌어서 끝 시각 조절" onPointerDown={(e) => beginDrag(e, { kind: 'row', row: r, edge: 'end', value: row.range.end }, row.range.end)}
                                        {...dragProps} className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize hover:bg-accent/40" />
                                </div>
                            );
                        })}
                    </div>

                    <div className="relative shrink-0" style={{ width: gridW, height: bodyH }}>
                        {hours.map((h) => <div key={h} className="absolute inset-x-0 border-t border-line/60" style={{ top: yOf(h * 60) }} />)}
                        {data.rows.map((row, r) => (
                            <div key={row.id} className="absolute inset-x-0 bg-text/[0.025]" style={{ top: yOf(rowStart(r)), height: yOf(rowEnd(r)) - yOf(rowStart(r)) }} />
                        ))}
                        {lefts.map((l, c) => <div key={c} className="absolute inset-y-0 border-r border-line" style={{ left: l, width: widthOf(c) }} />)}
                        {Array.from({ length: nCols }, (_, c) => data.rows.map((row, r) => {
                            if (isCovered(data, c, r)) return null;
                            const cell = getCell(data, c, r);
                            const r1 = Math.min(r + (cell?.rowSpan ?? 1) - 1, nRows - 1), c1 = Math.min(c + (cell?.colSpan ?? 1) - 1, nCols - 1);
                            const top = yOf(rowStart(r)), height = yOf(rowEnd(r1)) - top;
                            const width = lefts[c1] + widthOf(c1) - lefts[c];
                            const merged = r1 > r || c1 > c;
                            return (
                                <div key={`${c}:${row.id}`} data-c={c} data-r={r} className="absolute p-px" style={{ left: lefts[c], width, top, height }}
                                    onMouseDown={(e) => {
                                        if (e.shiftKey && sel) { e.preventDefault(); setSel({ ...sel, col1: c, row1: r }); }
                                        else setSel({ col0: c, row0: r, col1: c, row1: r });
                                    }}>
                                    <CommitField multiline value={cell?.text ?? ''} label={`${colName(data, c) || `열 ${c + 1}`} ${row.name || `행 ${r + 1}`} 칸`}
                                        onCommit={(v) => edit((d) => setCellText(d, c, r, v))}
                                        className={`h-full w-full resize-none rounded-sm px-1.5 py-1 text-small text-text outline-none focus:ring-1 focus:ring-inset focus:ring-accent
                                            ${inSel(c, r, c1, r1) ? 'bg-accent/15' : merged ? 'bg-text/[0.05]' : 'bg-transparent'}`} />
                                </div>
                            );
                        }))}
                    </div>
                </div>

                <div className="sticky left-0 w-max px-1 py-1">
                    <Button variant="plain" size="sm" className="whitespace-nowrap" title="행 넣기" onClick={() => edit((d) => addRow(d))}><Icon name="plus" size={12} /> 행</Button>
                </div>
            </div>
            {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
        </div>
    );
}
