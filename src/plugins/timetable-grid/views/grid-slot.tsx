/**
 * ───────────────────────────────────────────────────────────────────────────
 * 표 자리(grid slot) — 그리드 화면이 2D 표를 **직접 그리지 않고 이 한 파일을 거쳐서만** 그린다.
 *   🔴 쥔님 2026-11-08: 표 편집(칸 이동·복사 붙여넣기·병합·행 높이 끌기)은 **다른 세션이 공통 플러그인**
 *     (contract-table + table-editor, 브랜치 v2-table)으로 만든다. 1차는 이 파일 안의 **간이 표**다.
 *     나중에 표 편집기 플러그인이 오면 **이 파일 하나만** 바꾼다(그리드 나머지는 무변경).
 *     ⛔ 표 편집기 약속은 이 레인이 만들지 않는다 — v2-table 세션 몫이다.
 *
 * ── 표 편집기 세션에 건넬 「요구서」(시간표 그리드가 표 자리에 바라는 것) ─────────────────────────
 *   아래 GridSlotProps 가 그리드가 표에 건네는 전부다. 표 편집기 플러그인 모듈은 이 꼴을 받으면 된다:
 *     columns       — 열 정의(key·머리 이름). 요일(월~토) 또는 1·2·3일차.
 *     rows          — 행 정의(key·머리 이름·시각 start~end 분). 높이 = 차지하는 시간(구글 캘린더 주간 보기처럼).
 *     cell(col,row) — 그 칸의 { 글자, 세로 병합 rowSpan, 가로 병합 colSpan } · 병합에 덮인 칸이면 null(안 그린다).
 *     onCellChange  — 한 칸 글자를 고쳤다.
 *     onRenameColumn / onRenameRow — 머리 이름을 고쳤다(⛔ 「1교시」를 박지 않는다).
 *     onRowTime     — 🔴 행 시각을 그 행 **전체**에 넣는다(2단계 일괄 — 경계 끌기나 입력이 행 전체에).
 *     selection + onSelect — 칸 사각형 고르기(🔴 셀 병합은 무조건 — 세로 필수·가로 허용).
 *     emptyHint     — 안내 문구(선택).
 *   ⚠️ 표는 값의 속뜻을 모른다(전부 문자열). 칸 글자가 과목인지 사람인지는 나중 플러그인이 알아본다.
 *   🔴 칸·구간 복사 붙여넣기는 표 편집기 몫 · 표 통째 복사는 그리드가 노드 복제로 한다(이 자리 밖).
 * ───────────────────────────────────────────────────────────────────────────
 */
import { useRef } from 'react';
import { Icon } from '../../../pane-ui-system';

export interface GridColumn { key: string; title: string; }
export interface GridRowHead { key: string; title: string; start: number; end: number; }
export interface GridCellView { text: string; rowSpan: number; colSpan: number; merged: boolean; }
export interface GridSelection { col0: number; row0: number; col1: number; row1: number; }

export interface GridSlotProps {
    columns: GridColumn[];
    rows: GridRowHead[];
    /** 그 칸의 보임 꼴 — 병합에 덮인 칸이면 null(안 그린다). */
    cell(col: number, row: number): GridCellView | null;
    onCellChange(col: number, row: number, text: string): void;
    onRenameColumn(col: number, title: string): void;
    onRenameRow(row: number, title: string): void;
    /** 🔴 2단계 — 행 시각을 그 행 전체에(일괄). rowTimeEdit 가 켜져 있을 때만 UI 가 뜬다. */
    onRowTime(row: number, start: number, end: number): void;
    /** 선택(사각형) — 병합/해제 단추는 바깥 툴바가 쥔다. */
    selection: GridSelection | null;
    onSelect(col: number, row: number, extend: boolean): void;
    /** 2단계 켬 — 행 높이 ∝ 시간 + 경계 끌기 + 시각 입력. */
    rowTimeEdit: boolean;
    emptyHint?: string;
}

const PX_PER_MIN = 0.8;      // 50분 ≈ 40px
const MIN_ROW_PX = 30;

function fmt(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function parseMin(s: string): number | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
    if (!m) return null;
    const v = Number(m[1]) * 60 + Number(m[2]);
    return v >= 0 && v < 24 * 60 ? v : null;
}

function inSel(sel: GridSelection | null, col: number, row: number): boolean {
    if (!sel) return false;
    const c0 = Math.min(sel.col0, sel.col1), c1 = Math.max(sel.col0, sel.col1);
    const r0 = Math.min(sel.row0, sel.row1), r1 = Math.max(sel.row0, sel.row1);
    return col >= c0 && col <= c1 && row >= r0 && row <= r1;
}

export function SimpleGrid(props: GridSlotProps) {
    const { columns, rows, cell, onCellChange, onRenameColumn, onRenameRow, onRowTime, selection, onSelect, rowTimeEdit } = props;
    const dragRef = useRef<{ row: number; startY: number; startEnd: number } | null>(null);

    function rowHeight(r: GridRowHead): number | undefined {
        if (!rowTimeEdit) return undefined;
        return Math.max(MIN_ROW_PX, Math.round((r.end - r.start) * PX_PER_MIN));
    }

    function onDragMove(e: PointerEvent) {
        const d = dragRef.current;
        if (!d) return;
        const deltaMin = Math.round((e.clientY - d.startY) / PX_PER_MIN / 5) * 5;   // 5분 단위
        const r = rows[d.row];
        const next = Math.max(r.start + 5, d.startEnd + deltaMin);
        onRowTime(d.row, r.start, next);
    }
    function onDragUp() {
        dragRef.current = null;
        window.removeEventListener('pointermove', onDragMove);
        window.removeEventListener('pointerup', onDragUp);
    }
    function startDrag(e: React.PointerEvent, row: number) {
        e.preventDefault();
        dragRef.current = { row, startY: e.clientY, startEnd: rows[row].end };
        window.addEventListener('pointermove', onDragMove);
        window.addEventListener('pointerup', onDragUp);
    }

    return (
        <div className="p-2 select-none overflow-auto">
            <table className="border-collapse text-[13px]">
                <thead>
                    <tr>
                        <th className="sticky left-0 z-10 bg-panel border border-line w-20 min-w-20 p-1 text-[11px] text-muted font-medium">행 \ 열</th>
                        {columns.map((c, ci) => (
                            <th key={c.key} className="border border-line min-w-24 p-0 bg-panel">
                                <input
                                    value={c.title}
                                    onChange={(e) => onRenameColumn(ci, e.target.value)}
                                    placeholder={`열 ${ci + 1}`}
                                    aria-label={`열 ${ci + 1} 이름`}
                                    className="w-full bg-transparent text-center font-medium text-text px-1 py-1 outline-none focus:bg-text/[0.04]"
                                />
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r, ri) => (
                        <tr key={r.key} style={{ height: rowHeight(r) }}>
                            <th className="sticky left-0 z-10 bg-panel border border-line w-20 min-w-20 p-0 align-top">
                                <input
                                    value={r.title}
                                    onChange={(e) => onRenameRow(ri, e.target.value)}
                                    placeholder={`행 ${ri + 1}`}
                                    aria-label={`행 ${ri + 1} 이름`}
                                    className="w-full bg-transparent text-text px-1 py-0.5 text-[12px] outline-none focus:bg-text/[0.04]"
                                />
                                {rowTimeEdit && (
                                    <div className="flex items-center gap-0.5 px-1 pb-0.5 text-[10px] text-muted">
                                        <input
                                            defaultValue={fmt(r.start)}
                                            key={`s${r.start}`}
                                            onBlur={(e) => { const v = parseMin(e.target.value); if (v !== null) onRowTime(ri, v, r.end); else e.target.value = fmt(r.start); }}
                                            aria-label={`행 ${ri + 1} 시작`}
                                            className="w-9 bg-bg border border-line rounded text-center tabular-nums outline-none focus:border-accent"
                                        />
                                        <span>~</span>
                                        <input
                                            defaultValue={fmt(r.end)}
                                            key={`e${r.end}`}
                                            onBlur={(e) => { const v = parseMin(e.target.value); if (v !== null) onRowTime(ri, r.start, v); else e.target.value = fmt(r.end); }}
                                            aria-label={`행 ${ri + 1} 끝`}
                                            className="w-9 bg-bg border border-line rounded text-center tabular-nums outline-none focus:border-accent"
                                        />
                                    </div>
                                )}
                            </th>
                            {columns.map((c, ci) => {
                                const cv = cell(ci, ri);
                                if (!cv) return null;   // 병합에 덮인 칸 — 안 그린다
                                const selected = inSel(selection, ci, ri);
                                return (
                                    <td
                                        key={c.key}
                                        rowSpan={cv.rowSpan > 1 ? cv.rowSpan : undefined}
                                        colSpan={cv.colSpan > 1 ? cv.colSpan : undefined}
                                        onMouseDown={(e) => onSelect(ci, ri, e.shiftKey)}
                                        className={`relative border border-line align-top p-0 ${selected ? 'bg-accent/15 outline outline-1 outline-accent' : ''} ${cv.merged ? 'bg-text/[0.03]' : ''}`}
                                    >
                                        <input
                                            value={cv.text}
                                            onChange={(e) => onCellChange(ci, ri, e.target.value)}
                                            onFocus={() => onSelect(ci, ri, false)}
                                            aria-label={`${c.title || `열 ${ci + 1}`} ${r.title || `행 ${ri + 1}`} 칸`}
                                            className="w-full h-full min-h-6 bg-transparent text-text px-1.5 py-1 outline-none"
                                        />
                                        {rowTimeEdit && cv.rowSpan <= 1 && (
                                            <div
                                                onPointerDown={(e) => startDrag(e, ri)}
                                                title="끌어서 이 행 시각 조절"
                                                className="absolute left-0 right-0 bottom-0 h-1.5 cursor-ns-resize hover:bg-accent/40"
                                            />
                                        )}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                    {(columns.length === 0 || rows.length === 0) && (
                        <tr><td className="p-6 text-center text-muted">{props.emptyHint ?? '빈 표'}</td></tr>
                    )}
                </tbody>
            </table>
            <div className="flex items-center gap-1 mt-2 text-[11px] text-muted">
                <Icon name="info" size={12} />
                칸을 눌러 고르고, Shift+클릭으로 여러 칸을 고른 뒤 위 「병합」을 누른다.
            </div>
        </div>
    );
}
