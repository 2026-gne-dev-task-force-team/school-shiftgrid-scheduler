/**
 * 주간 캘린더 뷰 — 구글 캘린더식. 열 = 요일 · 행 = 시간 눈금(높이 ∝ 분) · 카드는 분 위치로 절대 배치.
 *
 * 🔴 손맛(전부 pointer 이벤트 — 마우스·펜·손가락 한 코드):
 *   - 카드 끌어 옮기기(열·시각) · 아래 잡아 늘리기 · 5분 스냅
 *   - 손가락은 길게 눌러(350ms) 끈다 — 짧게 누르면 상세(피크)
 *   - 빈 칸 더블클릭(손가락은 길게) → 새 카드(제목 입력)
 *   - 행 경계 끌어 그 줄 분 바꾸기(뒤 줄은 파생이라 저절로 밀린다)
 *   - 열 머리 우클릭 → 열 추가/삭제 · 더블클릭 → 이름
 *   - 겹치면 나란히(폭 1/n)
 *
 * ⛔ 창틀(pane-ui-system) 속을 import 하지 않는다 — 배럴 타입만. 메뉴·카드는 이 플러그인이 직접 그린다.
 */
import { useCallback, useRef, useState } from 'react';
import type { PointerEvent as RPointerEvent } from 'react';
import type { ViewProps } from '../../../pane-ui-system/plugin';
import type { ScheduleStore } from '../store';
import { rowTimes, axisSpanMinutes, columnLayout, rowDisplayLabel, snap, SNAP_MINUTES } from '../model';

const PX_PER_MIN = 1.1;
const GUTTER = 56;            // 시각 눈금 칸 폭
const COL_MIN = 96;          // 넓은 화면 열 최소폭
const COL_NARROW = 108;      // 좁은 화면 고정 열폭
const NARROW_AT = 520;       // 이 아래면 좁은 화면(가로 스크롤)
const LONG_PRESS_MS = 350;
const MOVE_THRESHOLD = 4;

type Preview =
    | { kind: 'move'; id: string; colKey: string; start: number }
    | { kind: 'resize'; id: string; minutes: number }
    | { kind: 'rowresize'; rowKey: string; minutes: number };

interface DragRef {
    kind: 'move' | 'resize' | 'rowresize';
    id: string;           // cardId 또는 rowKey
    pointerId: number;
    startX: number;
    startY: number;
    origStart: number;
    origMinutes: number;
    moved: boolean;
    ready: boolean;       // 손가락 길게누르기 관문
    timer: number | null;
    // 🔴 커밋 값은 여기 담는다(preview 상태가 아니라) — pointermove·up 이 같은 틱에 와도 안전하게 커밋된다
    lastColKey?: string;
    lastStart?: number;
    lastMinutes?: number;
}

type Menu = { x: number; y: number; colKey: string };

export interface WeekViewProps extends ViewProps {
    store: ScheduleStore;
    onCardClick: (cardId: string) => void;
}

export function WeekView({ width, store, onCardClick }: WeekViewProps) {
    const st = store.use();
    const schedule = st.schedule;
    const bodyRef = useRef<HTMLDivElement>(null);
    const drag = useRef<DragRef | null>(null);
    const [preview, setPreview] = useState<Preview | null>(null);
    const [menu, setMenu] = useState<Menu | null>(null);
    const [renameCol, setRenameCol] = useState<string | null>(null);

    const cols = schedule.cols;
    const rows = schedule.rows;
    const narrow = width > 0 && width < NARROW_AT;
    const colW = narrow ? COL_NARROW : Math.max(COL_MIN, Math.floor((width - GUTTER) / Math.max(1, cols.length)));

    // 행 경계 끌기 미리보기를 반영한 줄 — 축 길이·눈금만 바뀐다(카드는 분 위치라 안 바뀐다)
    const effRows = preview?.kind === 'rowresize'
        ? rows.map((r) => (r.key === preview.rowKey ? { ...r, minutes: preview.minutes } : r))
        : rows;
    const times = rowTimes(schedule.startTime, effRows);
    const span = Math.max(1, axisSpanMinutes(effRows));
    const bodyH = span * PX_PER_MIN;

    // 줄마다 세로 오프셋(분) — 가이드 선·행 머리 자리
    const rowOffsets: number[] = [];
    {
        let pos = 0;
        for (const r of effRows) { rowOffsets.push(pos); pos += Math.max(0, r.minutes) + Math.max(0, r.gapAfter || 0); }
    }

    // ── 카드 자리 계산(미리보기 반영) ──
    const cardView = (id: string) => {
        const c = schedule.cards.find((x) => x.id === id)!;
        let colKey = c.colKey;
        let start = c.start;
        let minutes = c.minutes;
        if (preview?.kind === 'move' && preview.id === id) { colKey = preview.colKey; start = preview.start; }
        if (preview?.kind === 'resize' && preview.id === id) { minutes = preview.minutes; }
        return { ...c, colKey, start, minutes };
    };

    // ── 포인터 → 분·열 ──
    const minutesAtY = (clientY: number): number => {
        const rect = bodyRef.current?.getBoundingClientRect();
        if (!rect) return 0;
        return (clientY - rect.top + (bodyRef.current?.scrollTop ?? 0)) / PX_PER_MIN;
    };
    const colIndexAtX = (clientX: number): number => {
        const rect = bodyRef.current?.getBoundingClientRect();
        if (!rect) return 0;
        const x = clientX - rect.left;
        return Math.max(0, Math.min(cols.length - 1, Math.floor(x / colW)));
    };

    const endDrag = useCallback(() => {
        const d = drag.current;
        if (d?.timer) window.clearTimeout(d.timer);
        drag.current = null;
        setPreview(null);
    }, []);

    // ── 카드 몸통 끌기(이동) ──
    const onCardPointerDown = (e: RPointerEvent, cardId: string) => {
        if (e.button != null && e.button !== 0 && e.pointerType === 'mouse') return;
        e.stopPropagation();
        const c = schedule.cards.find((x) => x.id === cardId);
        if (!c) return;
        try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch { /* 합성 이벤트·비활성 포인터 */ }
        const touch = e.pointerType === 'touch';
        const d: DragRef = {
            kind: 'move', id: cardId, pointerId: e.pointerId,
            startX: e.clientX, startY: e.clientY, origStart: c.start, origMinutes: c.minutes,
            moved: false, ready: !touch, timer: null,
        };
        if (touch) d.timer = window.setTimeout(() => { if (drag.current === d) d.ready = true; }, LONG_PRESS_MS);
        drag.current = d;
    };

    // ── 카드 아래 잡아 늘리기(크기) ──
    const onResizePointerDown = (e: RPointerEvent, cardId: string) => {
        e.stopPropagation();
        const c = schedule.cards.find((x) => x.id === cardId);
        if (!c) return;
        try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch { /* 합성 이벤트·비활성 포인터 */ }
        drag.current = {
            kind: 'resize', id: cardId, pointerId: e.pointerId,
            startX: e.clientX, startY: e.clientY, origStart: c.start, origMinutes: c.minutes,
            moved: false, ready: true, timer: null,
        };
    };

    // ── 행 경계 끌기 ──
    const onRowHandlePointerDown = (e: RPointerEvent, rowKey: string) => {
        e.stopPropagation();
        const r = rows.find((x) => x.key === rowKey);
        if (!r) return;
        try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch { /* 합성 이벤트·비활성 포인터 */ }
        drag.current = {
            kind: 'rowresize', id: rowKey, pointerId: e.pointerId,
            startX: e.clientX, startY: e.clientY, origStart: 0, origMinutes: r.minutes,
            moved: false, ready: true, timer: null,
        };
    };

    const onPointerMove = (e: RPointerEvent) => {
        const d = drag.current;
        if (!d || e.pointerId !== d.pointerId) return;
        if (!d.ready) return;                         // 손가락 길게누르기 관문 통과 전
        const dy = e.clientY - d.startY;
        if (Math.abs(e.clientX - d.startX) > MOVE_THRESHOLD || Math.abs(dy) > MOVE_THRESHOLD) d.moved = true;
        const deltaMin = dy / PX_PER_MIN;
        if (d.kind === 'move') {
            const start = Math.max(0, snap(d.origStart + deltaMin));
            const colKey = cols[colIndexAtX(e.clientX)]?.key ?? cols[0].key;
            d.lastColKey = colKey; d.lastStart = start;
            setPreview({ kind: 'move', id: d.id, colKey, start });
        } else if (d.kind === 'resize') {
            const minutes = Math.max(SNAP_MINUTES, snap(d.origMinutes + deltaMin));
            d.lastMinutes = minutes;
            setPreview({ kind: 'resize', id: d.id, minutes });
        } else {
            const minutes = Math.max(SNAP_MINUTES, snap(d.origMinutes + deltaMin));
            d.lastMinutes = minutes;
            setPreview({ kind: 'rowresize', rowKey: d.id, minutes });
        }
    };

    const onPointerUp = (e: RPointerEvent) => {
        const d = drag.current;
        if (!d || e.pointerId !== d.pointerId) return;
        if (d.timer) window.clearTimeout(d.timer);
        if (d.kind === 'move') {
            if (d.ready && d.moved && d.lastColKey != null && d.lastStart != null) {
                store.move(d.id, { colKey: d.lastColKey, start: d.lastStart });
            } else if (!d.moved) {
                onCardClick(d.id);                     // 짧게 누름 = 상세 열기
            }
        } else if (d.kind === 'resize' && d.lastMinutes != null) {
            store.resize(d.id, d.lastMinutes);
        } else if (d.kind === 'rowresize' && d.lastMinutes != null) {
            store.resizeRow(d.id, d.lastMinutes);
        }
        endDrag();
    };

    // ── 빈 칸에 새 카드 ──
    const createCardAt = (clientX: number, clientY: number) => {
        const colKey = cols[colIndexAtX(clientX)]?.key;
        if (!colKey) return;
        const start = Math.max(0, snap(minutesAtY(clientY)));
        const title = window.prompt('새 카드 제목', '');
        if (title == null) return;
        store.add({ colKey, start, minutes: 40, title: title.trim() });
    };

    // 빈 열 배경: 손가락 길게누르기 → 새 카드(마우스는 더블클릭)
    const bgTimer = useRef<number | null>(null);
    const onColBgPointerDown = (e: RPointerEvent) => {
        if (e.pointerType !== 'touch') return;
        const x = e.clientX; const y = e.clientY;
        bgTimer.current = window.setTimeout(() => { bgTimer.current = null; createCardAt(x, y); }, LONG_PRESS_MS);
    };
    const cancelBg = () => { if (bgTimer.current) { window.clearTimeout(bgTimer.current); bgTimer.current = null; } };

    const total = GUTTER + cols.length * colW;

    return (
        <div className="h-full overflow-auto bg-panel text-text" data-testid="week-view">
            <div style={{ minWidth: total }}>
                {/* 머리줄 — 요일 */}
                <div className="flex sticky top-0 z-20 bg-panel2 border-b border-line">
                    <div style={{ width: GUTTER }} className="shrink-0 border-r border-line" />
                    {cols.map((col) => (
                        <div
                            key={col.key}
                            data-testid="col-head" data-col-key={col.key}
                            style={{ width: colW }}
                            className="shrink-0 border-r border-line px-2 py-1.5 text-[13px] font-semibold text-center cursor-default"
                            onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, colKey: col.key }); }}
                            onDoubleClick={() => setRenameCol(col.key)}
                        >
                            {renameCol === col.key ? (
                                <input
                                    autoFocus defaultValue={col.label}
                                    className="w-full text-center bg-panel border border-accent rounded px-1 outline-none"
                                    onBlur={(ev) => { store.setColLabel(col.key, ev.target.value.trim() || col.label); setRenameCol(null); }}
                                    onKeyDown={(ev) => { if (ev.key === 'Enter') ev.currentTarget.blur(); if (ev.key === 'Escape') setRenameCol(null); }}
                                />
                            ) : col.label}
                        </div>
                    ))}
                </div>

                {/* 본문 — 왼쪽 시각 눈금 + 열들 */}
                <div className="flex" style={{ height: bodyH }}>
                    {/* 시각 눈금(gutter) */}
                    <div style={{ width: GUTTER }} className="shrink-0 relative border-r border-line">
                        {effRows.map((r, ri) => {
                            const top = rowOffsets[ri] * PX_PER_MIN;
                            const h = r.minutes * PX_PER_MIN;
                            const label = rowDisplayLabel(effRows, ri);
                            const t = times[ri];
                            return (
                                <div key={r.key} className="absolute left-0 right-0 border-t border-line/70 px-1 text-right"
                                    style={{ top, height: h }}>
                                    <div className="text-[11px] leading-tight text-text">{label}</div>
                                    {t && <div className="text-[8.5px] leading-tight text-muted tabular-nums">{t.start}</div>}
                                    {/* 행 경계 손잡이 — 그 줄 아래 끝 */}
                                    <div
                                        data-testid="row-resize" data-row-key={r.key}
                                        className="absolute left-0 right-0 bottom-0 h-2 hover:bg-accent/40"
                                        style={{ touchAction: 'none', cursor: 'row-resize' }}
                                        onPointerDown={(e) => onRowHandlePointerDown(e, r.key)}
                                        onPointerMove={onPointerMove}
                                        onPointerUp={onPointerUp}
                                    />
                                </div>
                            );
                        })}
                    </div>

                    {/* 열 묶음 — 카드가 절대 배치되는 자리 */}
                    <div ref={bodyRef} className="relative flex-1" style={{ minWidth: cols.length * colW }}>
                        {/* 가로 가이드 선 */}
                        {effRows.map((r, ri) => (
                            <div key={r.key} className="absolute left-0 right-0 border-t border-line/50"
                                style={{ top: rowOffsets[ri] * PX_PER_MIN }} />
                        ))}
                        {/* 각 열 */}
                        {cols.map((col, ci) => {
                            const colCards = schedule.cards.filter((c) => cardView(c.id).colKey === col.key);
                            const lanes = columnLayout(colCards.map((c) => cardView(c.id)));
                            return (
                                <div key={col.key}
                                    className="absolute top-0 bottom-0 border-r border-line"
                                    style={{ left: ci * colW, width: colW }}
                                    onDoubleClick={(e) => createCardAt(e.clientX, e.clientY)}
                                    onPointerDown={onColBgPointerDown}
                                    onPointerMove={cancelBg}
                                    onPointerUp={cancelBg}
                                >
                                    {colCards.map((raw) => {
                                        const c = cardView(raw.id);
                                        const lane = lanes.get(c.id) ?? { lane: 0, lanes: 1 };
                                        const top = c.start * PX_PER_MIN;
                                        const h = Math.max(SNAP_MINUTES * PX_PER_MIN, c.minutes * PX_PER_MIN);
                                        const w = (colW - 2) / lane.lanes;
                                        return (
                                            <div
                                                key={c.id}
                                                data-testid="card" data-card-id={c.id}
                                                className="absolute rounded border border-accent/60 bg-accent/20 overflow-hidden text-[11px] leading-tight select-none"
                                                style={{ top, height: h, left: 1 + lane.lane * w, width: w - 1, touchAction: 'none' }}
                                                onPointerDown={(e) => onCardPointerDown(e, c.id)}
                                                onPointerMove={onPointerMove}
                                                onPointerUp={onPointerUp}
                                            >
                                                <div className="px-1 pt-0.5 font-medium truncate">
                                                    {c.title || '(제목 없음)'}
                                                    {c.repeat === 'once' && <span className="text-muted"> ·단발</span>}
                                                </div>
                                                {c.people.length > 0 && <div className="px-1 text-muted truncate">{c.people.join(', ')}</div>}
                                                {/* 아래 잡아 늘리기 손잡이 */}
                                                <div
                                                    data-testid="card-resize"
                                                    className="absolute left-0 right-0 bottom-0 h-2 cursor-ns-resize hover:bg-accent/50"
                                                    style={{ touchAction: 'none', cursor: 'ns-resize' }}
                                                    onPointerDown={(e) => onResizePointerDown(e, c.id)}
                                                    onPointerMove={onPointerMove}
                                                    onPointerUp={onPointerUp}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* 열 머리 우클릭 메뉴 — 창틀 ContextMenu 를 못 쓰니(배럴에 없음) 직접 그린다 */}
            {menu && (
                <>
                    <div className="fixed inset-0 z-[90]" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
                    <div className="fixed z-[100] min-w-[150px] py-1 rounded-md border border-line bg-panel shadow-lg text-[13px]"
                        style={{ left: menu.x, top: menu.y }} data-testid="col-menu">
                        <button type="button" className="w-full text-left px-3 py-1.5 hover:bg-text/[0.06]"
                            onClick={() => { store.addCol(); setMenu(null); }}>열 추가</button>
                        <button type="button" className="w-full text-left px-3 py-1.5 text-bad hover:bg-bad/10 disabled:opacity-40"
                            disabled={cols.length <= 1}
                            onClick={() => { store.removeCol(menu.colKey); setMenu(null); }}>이 열 삭제</button>
                    </div>
                </>
            )}
        </div>
    );
}
