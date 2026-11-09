/**
 * 레코드 뷰 — 노션 데이터베이스(표 보기)를 본뜬, 도메인을 모르는 목록 화면(제어형).
 *   쓰는 쪽은 「칸 정의 + 행 + 콜백」만 넘기고 목록 화면을 공짜로 얻는다.
 *
 * 🔴 데이터는 바깥 소유(records). 보기 정의(필터·정렬·칸 순서·폭·숨김)는 바깥이 저장하거나(views/onViewsChange)
 *    안 주면 viewKey 로 localStorage. 검색어는 잠시 상태 — 저장 안 한다.
 * 🔴 색·치수는 토큰 클래스 + 알약만. CSS 호버-숨김 클래스는 Row 조각 전용이라 안 쓴다(구조 검사 ③) — 행 호버는 React 상태로.
 * 🔴 칸 종류를 모른다 — 셀·연산자·변환이 전부 칸 타입 레지스트리(fields/)에서 온다. 화면에 switch(type) 이 없다.
 * 🔑 보기 종류(kind)는 지금 'table' 하나지만 ViewDef.kind 로 갈라 둬 보드·목록·갤러리를 꽂을 자리를 열어 뒀다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from 'react';
import { Icon, IconButton } from '../../pane-ui-system';
import { Popover } from '../../pane-ui-system';
import { Cell } from './Cell';
import { Toolbar } from './Toolbar';
import { ViewTabs } from './ViewTabs';
import { calcFnsFor, runCalc } from './calc';
import { deriveRows, displayText, filterIsEmpty, pruneFilter, rawValue } from './logic';
import { buildTree } from './subitems';
import { planConvert } from './convert';
import { parseTsv } from './paste';
import { fieldTypes } from './fields/registry';
import { isImeEnter } from './fields/ime';
import { newField } from './schema';
import {
    DEFAULT_COL_WIDTH, MIN_COL_WIDTH, defaultView, loadActiveView, loadViews, reconcileColumns, saveActiveView, saveViews,
} from './view-state';
import type {
    CellChange, ConvertPlan, FieldOption, RecordCellValue, RecordField, RecordViewProps, SortRule, ViewDef,
} from './contracts/record-view';

// 🔴 노드 화면(views/)은 구조 검사 ⑯(소문자 record 비교 0) 때문에 'record-view' 가 든 경로를 못 쓴다 —
//    그래서 노드 화면이 쓰는 공개 타입을 대문자 경로(./RecordView)로 다시 내보낸다(바깥 손님은 contracts/record-view 로).
export type { CellChange, RecordField, RecordCellValue, ConvertPlan, PasteRequest, ViewDef } from './contracts/record-view';

const SEL_W = 34;   // 선택 체크 칸 폭
const OPEN_W = 40;  // 「열기」 칸 폭
const INDENT_PX = 18;   // 하위 항목 한 단 들여쓰기 폭

/** 손가락 기기(hover 없음) 판정 — 행 「열기」 단추를 늘 보이게 한다 */
function useCoarsePointer(): boolean {
    const [coarse, setCoarse] = useState(() =>
        typeof window !== 'undefined' && typeof window.matchMedia === 'function'
            ? window.matchMedia('(hover: none)').matches : false,
    );
    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
        const mq = window.matchMedia('(hover: none)');
        const on = () => setCoarse(mq.matches);
        mq.addEventListener?.('change', on);
        return () => mq.removeEventListener?.('change', on);
    }, []);
    return coarse;
}

const isEmptyVal = (v: RecordCellValue): boolean => v === null || v === '' || (Array.isArray(v) && v.length === 0);

/** 칸 이름 입력 — 🔴 IME 조합 중 Enter 는 확정이 아니다 */
function RenameInput({ field, onCommit }: { field: RecordField; onCommit: (label: string) => void }) {
    return (
        <input
            data-rv-rename={field.key}
            defaultValue={field.label}
            onKeyDown={(e) => { if (isImeEnter(e)) return; if (e.key === 'Enter') onCommit((e.target as HTMLInputElement).value); }}
            onBlur={(e) => onCommit(e.target.value)}
            className="h-row px-2 mb-1 rounded border border-line bg-bg text-[13px] text-text outline-none"
        />
    );
}

export function RecordView<T>({
    fields,
    records,
    getId,
    viewKey,
    titleKey,
    views: viewsProp,
    activeView,
    onViewsChange,
    onCellChange,
    onCellsChange,
    onAddRecord,
    onDeleteRecords,
    onOpenRecord,
    onFieldsChange,
    onConvertField,
    onPaste,
    onReorder,
    tree,
    className = '',
}: RecordViewProps<T>) {
    // ── 보기 정의 — 제어형(views)이면 바깥이 저장 · 아니면 localStorage ────────────────
    const controlled = viewsProp !== undefined;
    const [localViews, setLocalViews] = useState<ViewDef[]>(() => (controlled ? [] : loadViews(viewKey)));
    const keyRef = useRef(viewKey);
    useEffect(() => {
        if (keyRef.current !== viewKey) {
            keyRef.current = viewKey;
            if (!controlled) setLocalViews(loadViews(viewKey));
            setActiveLocal(loadActiveView(viewKey));
        }
    }, [viewKey, controlled]);
    const views = controlled ? viewsProp : localViews;
    // 🔴 활성 탭은 기기별(localStorage) — 보기 목록이 노드에 있어도 「지금 어느 탭」은 여기 둔다
    const [activeLocal, setActiveLocal] = useState<string | null>(() => loadActiveView(viewKey));
    const activeId = activeView ?? activeLocal ?? undefined;
    const view0 = views.find((v) => v.id === activeId) ?? views[0] ?? defaultView();
    const view = useMemo(() => reconcileColumns(view0, fields), [view0, fields]);
    const selectView = (id: string) => { setActiveLocal(id); saveActiveView(viewKey, id); };

    const commitViews = useCallback((next: ViewDef[]) => {
        if (controlled) { onViewsChange?.(next); return; }
        setLocalViews(next);
        saveViews(viewKey, next);
    }, [controlled, onViewsChange, viewKey]);
    /** 여러 셀을 한 묶음으로(되돌리기 한 칸) — onCellsChange 가 없으면 한 칸씩 흉내 */
    const changeCells = (changes: CellChange[]) => {
        const live = changes.filter((c) => !byKey.get(c.key)?.readOnly);
        if (live.length === 0) return;
        if (onCellsChange) onCellsChange(live);
        else for (const c of live) onCellChange?.(c.id, c.key, c.value);
    };
    const patchView = useCallback((p: Partial<ViewDef>) => {
        const base = views.length > 0 ? views : [view];
        commitViews(base.map((v) => (v.id === view.id ? { ...reconcileColumns(v, fields), ...p } : v)));
    }, [views, view, fields, commitViews]);

    const [search, setSearch] = useState('');
    const coarse = useCoarsePointer();
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [hoverRow, setHoverRow] = useState<string | null>(null);
    const [headMenu, setHeadMenu] = useState<{ key: string; rect: DOMRect } | null>(null);
    const [addMenu, setAddMenu] = useState<DOMRect | null>(null);
    const [pending, setPending] = useState<ConvertPlan | null>(null);
    const gridRef = useRef<HTMLDivElement>(null);

    const byKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);
    const visibleFields = useMemo(
        () => view.columns.filter((c) => !c.hidden).map((c) => byKey.get(c.key)).filter((f): f is RecordField => !!f),
        [view.columns, byKey],
    );
    const hiddenKeys = useMemo(() => view.columns.filter((c) => c.hidden).map((c) => c.key), [view.columns]);
    // 🔴 「수동 순서」(정렬·필터·검색 0)일 때만 트리로 그린다 — 그 밖엔 평평(노션과 같다).
    const manualOrder = view.sorts.length === 0 && filterIsEmpty(view.filter) && search.trim() === '';
    const treeOn = !!tree && manualOrder;
    const flat = useMemo(
        () => deriveRows(records, fields, { search, filter: view.filter, sorts: view.sorts }),
        [records, fields, search, view.filter, view.sorts],
    );
    const displayRows = useMemo(
        () => (treeOn && tree
            ? buildTree(records, getId, tree.parentOf, tree.collapsed)
            : flat.map((row) => ({ row, depth: 0, hasChildren: false }))),
        [treeOn, tree, records, getId, flat],
    );
    const rows = useMemo(() => displayRows.map((d) => d.row), [displayRows]);

    // 🔴 폭 끌기 중에는 임시 폭만 그린다 — 손을 뗄 때 한 번만 보기 정의에 쓴다(안 그러면 포인터 한 칸마다 되돌리기 한 단계가 쌓인다)
    const [liveW, setLiveW] = useState<{ key: string; w: number } | null>(null);
    const widthOf = (f: RecordField) => (liveW?.key === f.key ? liveW.w : view.columns.find((c) => c.key === f.key)?.width ?? f.width ?? DEFAULT_COL_WIDTH);
    const canEditCell = (f: RecordField) => !!onCellChange && !f.readOnly;

    const setColumn = (key: string, p: { width?: number; hidden?: boolean; wrap?: boolean }) =>
        patchView({ columns: view.columns.map((c) => (c.key === key ? { ...c, ...p } : c)) });

    // ── 선택 ──────────────────────────────────────────────────────────────────
    const selectable = !!onDeleteRecords;
    const rowIds = useMemo(() => rows.map((r) => getId(r)), [rows, getId]);
    const liveSelected = useMemo(() => rowIds.filter((id) => selected.has(id)), [rowIds, selected]);
    const allChecked = rowIds.length > 0 && liveSelected.length === rowIds.length;
    const toggleOne = (id: string) =>
        setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const toggleAll = () => setSelected(() => (allChecked ? new Set() : new Set(rowIds)));
    const deleteSelected = () => {
        if (!onDeleteRecords || liveSelected.length === 0) return;
        onDeleteRecords(liveSelected);
        setSelected(new Set());
    };

    // ── 칸 폭 끌기 ───────────────────────────────────────────────────────────
    const drag = useRef<{ key: string; startX: number; startW: number } | null>(null);
    const onResizeDown = (f: RecordField) => (e: ReactPointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        drag.current = { key: f.key, startX: e.clientX, startW: widthOf(f) };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };
    const onResizeMove = (e: ReactPointerEvent) => {
        const d = drag.current;
        if (!d) return;
        setLiveW({ key: d.key, w: Math.max(MIN_COL_WIDTH, d.startW + (e.clientX - d.startX)) });
    };
    const onResizeUp = (e: ReactPointerEvent) => {
        if (drag.current) { try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* 이미 풀림 */ } }
        const d = drag.current;
        drag.current = null;
        if (d && liveW && liveW.key === d.key) setColumn(d.key, { width: liveW.w });
        setLiveW(null);
    };

    // ── 행 끌어 순서 바꾸기(수동 순서일 때만) — from 을 toId 바로 앞으로(toId=null 이면 맨 끝) ──
    const reorderable = !!onReorder && manualOrder;
    const dragRow = useRef<string | null>(null);
    const [dropId, setDropId] = useState<string | null>(null);
    const onRowDrop = (toId: string | null) => {
        const from = dragRow.current;
        dragRow.current = null;
        setDropId(null);
        if (!from || !onReorder || from === toId) return;
        onReorder(from, toId);
    };

    // ── 칸 순서 끌기(보기마다) ────────────────────────────────────────────────
    const dragCol = useRef<string | null>(null);
    const onColDrop = (e: ReactDragEvent, to: string) => {
        e.preventDefault();
        const from = dragCol.current;
        dragCol.current = null;
        if (!from || from === to) return;
        const cols = view.columns.filter((c) => c.key !== from);
        const item = view.columns.find((c) => c.key === from);
        const at = cols.findIndex((c) => c.key === to);
        if (!item || at < 0) return;
        cols.splice(at, 0, item);
        patchView({ columns: cols });
    };

    // ── 칸 구조(이름·타입·추가·삭제·선택지) — onFieldsChange 가 있을 때만 ──────────
    const fieldsEditable = !!onFieldsChange;
    const setSortSingle = (key: string, dir: 'asc' | 'desc') => { patchView({ sorts: [{ key, dir }] }); setHeadMenu(null); };
    const renameField = (key: string, label: string) => {
        const cur = byKey.get(key);
        if (!cur || cur.label === label) return;
        onFieldsChange?.(fields.map((f) => (f.key === key ? { ...f, label } : f)));
    };
    const setOptions = (key: string, options: FieldOption[]) =>
        onFieldsChange?.(fields.map((f) => (f.key === key ? { ...f, options } : f)));
    const deleteField = (key: string) => {
        onFieldsChange?.(fields.filter((f) => f.key !== key));
        patchView({
            sorts: view.sorts.filter((s) => s.key !== key),
            filter: pruneFilter(view.filter, key),
            columns: view.columns.filter((c) => c.key !== key),
        });
        setHeadMenu(null);
    };
    const addField = (type: string) => {
        const def = fieldTypes.get(type);
        if (!def) return;
        const f = newField(type);
        if (def.defaultConfig !== undefined) f.config = def.defaultConfig;
        if (def.defaultOptions) f.options = def.defaultOptions.map((o) => ({ ...o }));
        else if (def.hasOptions) f.options = [];
        if (def.readOnly) f.readOnly = true;
        onFieldsChange?.([...fields, f]);
        setAddMenu(null);
    };

    /** 타입 변환 — 계산 → 깎이는 행이 있으면 확인창 → 적용(되돌리기 한 칸) */
    const applyConvert = (plan: ConvertPlan) => {
        if (onConvertField) { onConvertField(plan); return; }
        onFieldsChange?.(fields.map((f) => (f.key === plan.key ? plan.field : f)));
        for (const c of plan.changes) onCellChange?.(c.id, plan.key, c.value);
    };
    const requestRetype = (key: string, type: string) => {
        const f = byKey.get(key);
        if (!f || f.type === type) return;
        const plan = planConvert(records.map((r) => ({ id: getId(r), value: rawValue(r, key) as RecordCellValue | undefined })), f, type);
        setHeadMenu(null);
        if (plan.lost > 0) setPending(plan); else applyConvert(plan);
    };

    // ── 붙여넣기(엑셀 TSV) — 입력칸 안에서는 브라우저에 양보한다 ───────────────────
    const onGridPaste = (e: React.ClipboardEvent) => {
        if (!onPaste) return;
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        const text = e.clipboardData.getData('text/plain');
        if (!text) return;
        const matrix = parseTsv(text);
        if (matrix.length === 0) return;
        e.preventDefault();
        const width = Math.max(...matrix.map((r) => r.length));
        const keys: (string | null)[] = Array.from({ length: width }, (_, i) => visibleFields[i]?.key ?? null);
        onPaste({ keys, rows: matrix });
    };
    const focusGrid = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('input,textarea,select,button,[data-rv-cell]')) return;
        gridRef.current?.focus({ preventScroll: true });
    };

    // ── 셀 이동·범위·복사·채우기 — cur 는 지금 셀, anchor 는 Shift 로 넓힌 범위의 다른 끝(행·칸은 보이는 순서 번호) ──
    const [cur, setCur] = useState<{ r: number; c: number } | null>(null);
    const [anchor, setAnchor] = useState<{ r: number; c: number } | null>(null);
    const range = cur ? {
        r0: Math.min(cur.r, (anchor ?? cur).r), r1: Math.max(cur.r, (anchor ?? cur).r),
        c0: Math.min(cur.c, (anchor ?? cur).c), c1: Math.max(cur.c, (anchor ?? cur).c),
    } : null;
    const inRange = (r: number, c: number) => !!range && r >= range.r0 && r <= range.r1 && c >= range.c0 && c <= range.c1;
    const cellEl = (r: number, c: number) => gridRef.current?.querySelector<HTMLElement>(`[data-rv-pos="${r}:${c}"]`) ?? null;
    const moveTo = (r: number, c: number, extend: boolean) => {
        const nr = Math.max(0, Math.min(rows.length - 1, r));
        const nc = Math.max(0, Math.min(visibleFields.length - 1, c));
        if (!extend) setAnchor(null); else if (!anchor) setAnchor(cur);
        setCur({ r: nr, c: nc });
        cellEl(nr, nc)?.focus();
    };
    const fillDown = () => {
        if (!range) return;
        // 한 줄만 골랐으면 바로 위 행 값을, 여러 줄이면 맨 윗줄 값을 아래로(엑셀·노션 ⌘D)
        const src = range.r0 === range.r1 ? range.r0 - 1 : range.r0;
        if (src < 0) return;
        const changes: CellChange[] = [];
        for (let r = src + 1; r <= range.r1; r++) {
            for (let c = range.c0; c <= range.c1; c++) {
                const f = visibleFields[c];
                if (!f || !canEditCell(f)) continue;
                changes.push({ id: getId(rows[r]), key: f.key, value: (rawValue(rows[src], f.key) ?? null) as RecordCellValue });
            }
        }
        changeCells(changes);
    };
    const onGridKeyDown = (e: React.KeyboardEvent) => {
        const t = e.target as HTMLElement;
        if (!cur || e.nativeEvent.isComposing || t.closest('input,textarea,select,[contenteditable="true"],[data-rv-editing]')) return;
        const mod = e.metaKey || e.ctrlKey;
        const step: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
        if (step[e.key]) { e.preventDefault(); moveTo(cur.r + step[e.key][0], cur.c + step[e.key][1], e.shiftKey); return; }
        if (e.key === 'Tab') { e.preventDefault(); moveTo(cur.r, cur.c + (e.shiftKey ? -1 : 1), false); return; }
        if (e.key === 'Enter') {
            e.preventDefault();
            cellEl(cur.r, cur.c)?.querySelector<HTMLElement>('[data-rv-cell]')?.click();   // 셀의 편집 열기 = 클릭과 같은 길
            return;
        }
        if (e.key === 'Escape') { setCur(null); setAnchor(null); return; }
        if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); fillDown(); }
    };
    const onGridCopy = (e: React.ClipboardEvent) => {
        if (!range || (e.target as HTMLElement).closest('input,textarea,select')) return;
        const lines: string[] = [];
        for (let r = range.r0; r <= range.r1; r++) {
            const cols: string[] = [];
            for (let c = range.c0; c <= range.c1; c++) {
                const f = visibleFields[c];
                // TSV 칸 안의 탭·줄바꿈은 공백으로(붙여넣기 쪽 parseTsv 가 칸을 잘못 자르지 않게)
                cols.push(f && rows[r] ? displayText(rows[r], f).replace(/[\t\r\n]+/g, ' ') : '');
            }
            lines.push(cols.join('\t'));
        }
        e.preventDefault();
        e.clipboardData.setData('text/plain', lines.join('\n'));
    };

    // ── 일괄 편집(선택 막대 「칸 바꾸기」) · 계산 행 메뉴 ──
    const [bulk, setBulk] = useState<{ rect: DOMRect; key: string } | null>(null);
    const [calcMenu, setCalcMenu] = useState<{ key: string; rect: DOMRect } | null>(null);
    const setCalc = (key: string, id: string | null) => {
        const next = { ...(view.calc ?? {}) };
        if (id) next[key] = id; else delete next[key];
        patchView({ calc: next });
        setCalcMenu(null);
    };

    // ── 칸 고정(frozen = 앞에서 몇 칸) · 줄바꿈 ──
    const frozen = Math.min(view.frozen ?? 0, visibleFields.length);
    const lead = (reorderable ? 16 : 0) + (selectable ? SEL_W : 0);   // 고정 칸 앞의 손잡이·선택 칸 폭
    const stickyLeft = (fi: number) => lead + visibleFields.slice(0, fi).reduce((a, f) => a + widthOf(f), 0);
    const frozenStyle = (fi: number) => (fi < frozen ? { position: 'sticky' as const, left: stickyLeft(fi), zIndex: 5 } : {});
    const wrapOf = (key: string) => view.columns.find((c) => c.key === key)?.wrap === true;

    const sortDirOf = (key: string): SortRule['dir'] | null => view.sorts.find((s) => s.key === key)?.dir ?? null;
    const isTitle = (key: string) => key === titleKey;

    const totalWidth = (reorderable ? 16 : 0) + SEL_W * (selectable ? 1 : 0) + visibleFields.reduce((a, f) => a + widthOf(f), 0) + (treeOn ? 44 : 0) + (onOpenRecord ? OPEN_W : 0) + (fieldsEditable ? 40 : 0);

    return (
        <div className={`relative flex flex-col h-full min-h-0 bg-bg ${className}`} data-rv-root>
            <ViewTabs
                views={views.length > 0 ? views : [view]}
                activeId={view.id}
                fields={fields}
                onSelect={(id) => { selectView(id); setCur(null); setAnchor(null); }}
                onChange={(next, select) => { commitViews(next); if (select) selectView(select); }}
            />
            <Toolbar
                fields={fields}
                search={search}
                filter={view.filter}
                sorts={view.sorts}
                hidden={hiddenKeys}
                onSearch={setSearch}
                onFilter={(filter) => patchView({ filter })}
                onSorts={(s) => patchView({ sorts: s })}
                onHidden={(h) => patchView({ columns: view.columns.map((c) => { const { hidden: _drop, ...rest } = c; void _drop; return h.includes(c.key) ? { ...rest, hidden: true } : rest; }) })}
            />

            {/* 선택 막대 */}
            {selectable && liveSelected.length > 0 && (
                <div className="flex items-center gap-2 px-2 py-1 border-b border-line bg-panel2 shrink-0" data-rv-selbar>
                    <span className="text-[12px] text-text">{liveSelected.length}개 선택</span>
                    {visibleFields.some((f) => canEditCell(f)) && (
                        <button type="button" data-rv-bulk onClick={(e) => setBulk({ rect: e.currentTarget.getBoundingClientRect(), key: visibleFields.find((f) => canEditCell(f))!.key })}
                            className="h-row px-2 rounded text-[12px] text-text hover:bg-text/[0.06] inline-flex items-center gap-1">
                            <Icon name="edit" size={13} />칸 바꾸기
                        </button>
                    )}
                    <button type="button" data-rv-delete onClick={deleteSelected} className="h-row px-2 rounded text-[12px] text-bad hover:bg-bad/10 inline-flex items-center gap-1">
                        <Icon name="trash" size={13} />삭제
                    </button>
                    <button type="button" onClick={() => setSelected(new Set())} className="h-row px-2 rounded text-[12px] text-muted hover:text-text">해제</button>
                </div>
            )}

            {/* 표 — 가로·세로 스크롤은 이 칸이 쥔다(좁은 화면은 가로 스크롤) */}
            <div ref={gridRef} tabIndex={-1} data-rv-grid onPaste={onGridPaste} onCopy={onGridCopy} onKeyDown={onGridKeyDown} onMouseDown={focusGrid} className="flex-1 min-h-0 overflow-auto outline-none">
                <div style={{ minWidth: totalWidth }} className="text-text">
                    {/* 머리줄 */}
                    <div className="flex sticky top-0 z-10 bg-panel2 border-b border-line select-none h-header">
                        {reorderable && <div className="shrink-0 bg-panel2" style={{ width: 16, ...(frozen ? { position: 'sticky', left: 0, zIndex: 5 } : {}) }} />}
                        {selectable && (
                            <div className="shrink-0 grid place-items-center bg-panel2" style={{ width: SEL_W, ...(frozen ? { position: 'sticky', left: reorderable ? 16 : 0, zIndex: 5 } : {}) }}>
                                <button type="button" role="checkbox" aria-checked={allChecked} data-rv-check-all onClick={toggleAll}
                                    className={`grid place-items-center w-4 h-4 rounded-[3px] border ${allChecked ? 'bg-accent border-accent text-bg' : 'border-line'}`}>
                                    {allChecked && <Icon name="check" size={12} />}
                                </button>
                            </div>
                        )}
                        {visibleFields.map((f, fi) => {
                            const dir = sortDirOf(f.key);
                            const def = fieldTypes.get(f.type);
                            return (
                                <div key={f.key} className={`relative shrink-0 flex items-center gap-1 px-2 border-r border-line ${fi < frozen ? 'bg-panel2' : ''}`} style={{ width: widthOf(f), ...frozenStyle(fi) }} data-rv-head={f.key}
                                    onDragOver={(e) => { if (dragCol.current) e.preventDefault(); }}
                                    onDrop={(e) => onColDrop(e, f.key)}>
                                    {/* 끌어서 칸 순서 — 이름 부분이 손잡이(폭 손잡이·메뉴 단추와 안 겹치게) */}
                                    <div draggable data-rv-drag={f.key}
                                        onDragStart={(e) => { dragCol.current = f.key; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', f.key); } catch { /* 사파리 */ } }}
                                        onDragEnd={() => { dragCol.current = null; }}
                                        className="flex-1 min-w-0 flex items-center gap-1 cursor-grab">
                                        <Icon name={def?.icon ?? 'help'} size={13} className="text-muted shrink-0" />
                                        <span className="flex-1 min-w-0 truncate text-[12px] font-medium">{f.label}</span>
                                    </div>
                                    {dir && <Icon name="sort" size={12} className={`text-accent shrink-0 ${dir === 'asc' ? 'rotate-180' : ''}`} />}
                                    <button type="button" data-rv-head-menu={f.key} aria-label="칸 메뉴"
                                        onClick={(e) => setHeadMenu({ key: f.key, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() })}
                                        className="shrink-0 grid place-items-center w-5 h-5 rounded text-muted hover:text-text hover:bg-text/[0.08]">
                                        <Icon name="dots" size={14} />
                                    </button>
                                    {/* 폭 끌기 손잡이 */}
                                    <div
                                        onPointerDown={onResizeDown(f)}
                                        onPointerMove={onResizeMove}
                                        onPointerUp={onResizeUp}
                                        className="absolute top-0 right-[-3px] h-full w-[6px] cursor-col-resize z-20"
                                        data-rv-resize={f.key}
                                    />
                                </div>
                            );
                        })}
                        {treeOn && <div className="shrink-0" style={{ width: 44 }} />}
                        {onOpenRecord && <div className="shrink-0" style={{ width: OPEN_W }} />}
                        {fieldsEditable && (
                            <button type="button" data-rv-add-field onClick={(e) => setAddMenu((e.currentTarget as HTMLElement).getBoundingClientRect())} className="shrink-0 grid place-items-center text-muted hover:text-text hover:bg-text/[0.06]" style={{ width: 40 }} aria-label="칸 추가">
                                <Icon name="plus" size={15} />
                            </button>
                        )}
                    </div>

                    {/* 본문 */}
                    {displayRows.map(({ row: r, depth, hasChildren }, ri) => {
                        const id = getId(r);
                        const checked = selected.has(id);
                        const hovered = coarse || hoverRow === id;
                        const showOpen = onOpenRecord && hovered;
                        const showTree = treeOn && tree && hovered;
                        const collapsed = treeOn && tree ? tree.collapsed(id) : false;
                        return (
                            <div
                                key={id}
                                data-rv-row={id}
                                tabIndex={treeOn ? 0 : undefined}
                                onKeyDown={treeOn && tree ? (e) => {
                                    // 행 포커스에서 Tab=들여쓰기 · Shift+Tab=내어쓰기. 셀 편집 중(입력칸)엔 안 가로챈다.
                                    if (e.key !== 'Tab') return;
                                    const t = e.target as HTMLElement;
                                    if (t !== e.currentTarget) return;   // 셀 안(셀 이동·편집)이면 표가 받는다
                                    e.preventDefault();
                                    if (e.shiftKey) tree.onOutdent(id); else tree.onIndent(id);
                                } : undefined}
                                onMouseEnter={() => setHoverRow(id)}
                                onMouseLeave={() => setHoverRow((h) => (h === id ? null : h))}
                                onDragOver={reorderable ? (e) => { if (dragRow.current) { e.preventDefault(); setDropId(id); } } : undefined}
                                onDrop={reorderable ? (e) => { e.preventDefault(); onRowDrop(id); } : undefined}
                                className={`flex border-b border-line min-h-[32px] ${checked ? 'bg-accent/[0.06]' : 'hover:bg-text/[0.02]'} ${dropId === id ? 'border-t-2 border-t-accent' : ''}`}
                            >
                                {reorderable && (
                                    <div className="shrink-0 grid place-items-center bg-bg" style={{ width: 16, ...(frozen ? { position: 'sticky', left: 0, zIndex: 5 } : {}) }}
                                        draggable data-rv-row-drag={id}
                                        onDragStart={(e) => { dragRow.current = id; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', id); } catch { /* 사파리 */ } }}
                                        onDragEnd={() => { dragRow.current = null; setDropId(null); }}>
                                        <Icon name="grip" size={12} className={`text-muted cursor-grab ${hovered ? '' : 'opacity-0'}`} />
                                    </div>
                                )}
                                {selectable && (
                                    <div className="shrink-0 grid place-items-center bg-bg" style={{ width: SEL_W, ...(frozen ? { position: 'sticky', left: reorderable ? 16 : 0, zIndex: 5 } : {}) }}>
                                        <button type="button" role="checkbox" aria-checked={checked} data-rv-check={id} onClick={() => toggleOne(id)}
                                            className={`grid place-items-center w-4 h-4 rounded-[3px] border ${checked ? 'bg-accent border-accent text-bg' : 'border-line'}`}>
                                            {checked && <Icon name="check" size={12} />}
                                        </button>
                                    </div>
                                )}
                                {visibleFields.map((f, fi) => (
                                    <div key={f.key} data-rv-pos={`${ri}:${fi}`} tabIndex={-1} data-rv-sel={inRange(ri, fi) ? '' : undefined}
                                        onMouseDown={(e) => {
                                            if ((e.target as HTMLElement).closest('input,textarea,select')) return;
                                            if (e.shiftKey && cur) { if (!anchor) setAnchor(cur); setCur({ r: ri, c: fi }); e.preventDefault(); return; }
                                            setAnchor(null); setCur({ r: ri, c: fi });
                                        }}
                                        className={`shrink-0 border-r border-line overflow-hidden flex outline-none ${wrapOf(f.key) ? 'items-start py-1 [&_.truncate]:whitespace-normal [&_.truncate]:break-words' : 'items-center'} ${fi < frozen ? 'bg-bg' : ''} ${inRange(ri, fi) ? 'ring-2 ring-inset ring-accent/60' : ''}`}
                                        style={{ width: widthOf(f), ...frozenStyle(fi) }}>
                                        {fi === 0 && treeOn && (
                                            <div className="shrink-0 flex items-center" style={{ paddingLeft: depth * INDENT_PX }}>
                                                {hasChildren ? (
                                                    <button type="button" data-rv-fold={id} aria-expanded={!collapsed} aria-label={collapsed ? '펼치기' : '접기'}
                                                        onClick={() => tree?.onToggleCollapse(id)}
                                                        className="grid place-items-center w-4 h-4 rounded text-muted hover:text-text hover:bg-text/[0.08]">
                                                        <Icon name="chevronDown" size={13} className={collapsed ? '-rotate-90' : ''} />
                                                    </button>
                                                ) : <span className="inline-block w-4" />}
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0 h-full">
                                            <Cell
                                                field={f}
                                                rowValue={r}
                                                editable={canEditCell(f)}
                                                onChange={(val) => onCellChange?.(id, f.key, val)}
                                                onOptionsChange={fieldsEditable && !isTitle(f.key) ? (o) => setOptions(f.key, o) : undefined}
                                            />
                                        </div>
                                    </div>
                                ))}
                                {treeOn && (
                                    <div className="shrink-0 flex items-center justify-center gap-0.5" style={{ width: 44 }}>
                                        {showTree && (
                                            <>
                                                <button type="button" data-rv-outdent={id} aria-label="내어쓰기" onClick={() => tree?.onOutdent(id)}
                                                    className="grid place-items-center w-5 h-5 rounded text-muted hover:text-text hover:bg-text/[0.08]"><Icon name="left" size={13} /></button>
                                                <button type="button" data-rv-indent={id} aria-label="들여쓰기" onClick={() => tree?.onIndent(id)}
                                                    className="grid place-items-center w-5 h-5 rounded text-muted hover:text-text hover:bg-text/[0.08]"><Icon name="right" size={13} /></button>
                                            </>
                                        )}
                                    </div>
                                )}
                                {onOpenRecord && (
                                    <div className="shrink-0 grid place-items-center" style={{ width: OPEN_W }}>
                                        {showOpen && (
                                            <IconButton icon="arrowRight" label="열기" size={15} onClick={() => onOpenRecord(id)} data={{ 'data-rv-open': id }} />
                                        )}
                                    </div>
                                )}
                                {fieldsEditable && <div className="shrink-0" style={{ width: 40 }} />}
                            </div>
                        );
                    })}

                    {rows.length === 0 && (
                        <div className="px-3 py-6 text-[13px] text-muted select-none" data-rv-empty>
                            표시할 행이 없습니다.{onPaste ? ' 엑셀 표를 복사해 여기에 붙여넣으면 한꺼번에 만들 수 있습니다.' : ''}
                        </div>
                    )}

                    {/* + 새로 만들기 */}
                    {onAddRecord && (
                        <button type="button" data-rv-add onClick={onAddRecord}
                            onDragOver={reorderable ? (e) => { if (dragRow.current) { e.preventDefault(); setDropId('__end__'); } } : undefined}
                            onDrop={reorderable ? (e) => { e.preventDefault(); onRowDrop(null); } : undefined}
                            className={`flex items-center gap-1.5 w-full h-row px-3 text-[13px] text-muted hover:text-text hover:bg-text/[0.04] select-none sticky left-0 ${dropId === '__end__' ? 'border-t-2 border-t-accent' : ''}`}>
                            <Icon name="plus" size={14} />새로 만들기
                        </button>
                    )}

                    {/* 계산 행 — 칸마다 함수 하나(보기에 저장) · 필터 뒤 보이는 행으로 잰다 */}
                    <div className="flex border-t border-line h-row select-none" data-rv-calc-row>
                        <div className="shrink-0" style={{ width: lead }} />
                        {visibleFields.map((f) => {
                            const fnId = view.calc?.[f.key];
                            const label = fnId ? calcFnsFor(f).find((c) => c.id === fnId)?.label : undefined;
                            const val = label ? runCalc(fnId, rows.map((r) => rawValue(r, f.key) as RecordCellValue | undefined), f) : '';
                            return (
                                <button key={f.key} type="button" data-rv-calc={f.key}
                                    onClick={(e) => setCalcMenu({ key: f.key, rect: e.currentTarget.getBoundingClientRect() })}
                                    className={`shrink-0 flex items-center justify-end gap-1 px-2 text-[12px] hover:bg-text/[0.04] ${label ? 'text-text' : 'text-transparent hover:text-muted'}`}
                                    style={{ width: widthOf(f) }}>
                                    {label ? <><span className="text-muted">{label}</span><span className="tabular-nums" data-rv-calc-val>{val}</span></> : '계산'}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* 칸 추가 — 타입 고르기 */}
            {addMenu && (
                <Popover anchor={addMenu} width={200} align="right" onClose={() => setAddMenu(null)}>
                    <div className="flex flex-col gap-0.5" data-rv-add-menu>
                        <div className="px-2 py-0.5 text-[11px] text-muted">어떤 칸을 만들까요?</div>
                        {fieldTypes.list().map((d) => (
                            <button key={d.type} type="button" data-rv-add-type={d.type} onClick={() => addField(d.type)}
                                className="flex items-center gap-2 h-row px-2 rounded text-[13px] text-text hover:bg-text/[0.06] text-left">
                                <Icon name={d.icon} size={14} className="text-muted" />{d.label}
                            </button>
                        ))}
                    </div>
                </Popover>
            )}

            {/* 머리줄 칸 메뉴 */}
            {headMenu && (() => {
                const f = byKey.get(headMenu.key);
                if (!f) return null;
                const title = isTitle(f.key);
                return (
                    <Popover anchor={headMenu.rect} width={220} onClose={() => setHeadMenu(null)}>
                        <div className="flex flex-col gap-0.5">
                            {fieldsEditable && <RenameInput field={f} onCommit={(label) => { renameField(f.key, label); }} />}
                            <button type="button" data-rv-sort-asc onClick={() => setSortSingle(f.key, 'asc')} className="flex items-center gap-2 h-row px-2 rounded text-[13px] text-text hover:bg-text/[0.06] text-left">
                                <Icon name="sort" size={14} className="rotate-180" />오름차순 정렬
                            </button>
                            <button type="button" data-rv-sort-desc onClick={() => setSortSingle(f.key, 'desc')} className="flex items-center gap-2 h-row px-2 rounded text-[13px] text-text hover:bg-text/[0.06] text-left">
                                <Icon name="sort" size={14} />내림차순 정렬
                            </button>
                            {!title && (
                                <button type="button" data-rv-hide-col onClick={() => { setColumn(f.key, { hidden: true }); setHeadMenu(null); }} className="flex items-center gap-2 h-row px-2 rounded text-[13px] text-text hover:bg-text/[0.06] text-left">
                                    <Icon name="eyeOff" size={14} />칸 숨기기
                                </button>
                            )}
                            {(() => {
                                const idx = visibleFields.findIndex((x) => x.key === f.key);
                                const on = idx >= 0 && frozen === idx + 1;
                                return idx >= 0 && (
                                    <button type="button" data-rv-freeze onClick={() => { patchView({ frozen: on ? 0 : idx + 1 }); setHeadMenu(null); }} className="flex items-center gap-2 h-row px-2 rounded text-[13px] text-text hover:bg-text/[0.06] text-left">
                                        <Icon name="pin" size={14} />{on ? '고정 풀기' : '여기까지 칸 고정'}
                                    </button>
                                );
                            })()}
                            <button type="button" data-rv-wrap onClick={() => { setColumn(f.key, { wrap: !wrapOf(f.key) }); setHeadMenu(null); }} className="flex items-center gap-2 h-row px-2 rounded text-[13px] text-text hover:bg-text/[0.06] text-left">
                                <Icon name="text" size={14} />{wrapOf(f.key) ? '줄바꿈 끄기' : '줄바꿈'}
                            </button>
                            {fieldsEditable && (
                                <>
                                    <div className="my-1 h-px bg-line" />
                                    <div className="px-2 py-0.5 text-[11px] text-muted">타입{title ? ' (제목 칸은 바꿀 수 없습니다)' : ''}</div>
                                    <div className="flex flex-wrap gap-1 px-1 pb-1">
                                        {fieldTypes.list().map((d) => (
                                            <button key={d.type} type="button" data-rv-type={d.type} disabled={title} onClick={() => requestRetype(f.key, d.type)}
                                                className={`inline-flex items-center gap-1 h-row px-1.5 rounded border text-[12px] disabled:opacity-50 disabled:cursor-not-allowed ${f.type === d.type ? 'border-accent text-text' : 'border-line text-muted hover:text-text'}`}>
                                                <Icon name={d.icon} size={12} />{d.label}
                                            </button>
                                        ))}
                                    </div>
                                    {!title && (
                                        <button type="button" data-rv-del-field onClick={() => deleteField(f.key)} className="flex items-center gap-2 h-row px-2 rounded text-[13px] text-bad hover:bg-bad/10 text-left">
                                            <Icon name="trash" size={14} />칸 삭제
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </Popover>
                );
            })()}

            {/* 계산 함수 고르기 */}
            {calcMenu && (() => {
                const f = byKey.get(calcMenu.key);
                if (!f) return null;
                return (
                    <Popover anchor={calcMenu.rect} width={180} onClose={() => setCalcMenu(null)}>
                        <div className="flex flex-col gap-0.5 max-h-[320px] overflow-auto" data-rv-calc-menu>
                            <button type="button" data-rv-calc-fn="" onClick={() => setCalc(f.key, null)} className="h-row px-2 rounded text-[13px] text-muted hover:bg-text/[0.06] text-left">계산 안 함</button>
                            {calcFnsFor(f).map((c) => (
                                <button key={c.id} type="button" data-rv-calc-fn={c.id} onClick={() => setCalc(f.key, c.id)}
                                    className={`h-row px-2 rounded text-[13px] hover:bg-text/[0.06] text-left ${view.calc?.[f.key] === c.id ? 'text-accent' : 'text-text'}`}>{c.label}</button>
                            ))}
                        </div>
                    </Popover>
                );
            })()}

            {/* 일괄 편집 — 칸 하나 고르고 값을 넣으면 고른 행 전부에 한 묶음으로 */}
            {bulk && (() => {
                const f = byKey.get(bulk.key);
                if (!f) return null;
                return (
                    <Popover anchor={bulk.rect} width={260} onClose={() => setBulk(null)}>
                        <div className="flex flex-col gap-1.5" data-rv-bulk-panel>
                            <select data-rv-bulk-field value={bulk.key} onChange={(e) => setBulk({ ...bulk, key: e.target.value })}
                                className="h-row rounded border border-line bg-bg text-text text-[12px] px-1">
                                {visibleFields.filter((x) => canEditCell(x)).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                            </select>
                            <div className="h-[32px] rounded border border-line" data-rv-bulk-cell>
                                <Cell key={f.key} field={f} rowValue={{}} editable
                                    onChange={(val) => { changeCells(liveSelected.map((id) => ({ id, key: f.key, value: val }))); setBulk(null); }} />
                            </div>
                            <div className="text-[11px] text-muted">고른 {liveSelected.length}행에 같은 값이 들어갑니다.</div>
                        </div>
                    </Popover>
                );
            })()}

            {/* 🔴 값이 깎이는 타입 변환 — 유일한 비가역이라 확인을 받는다(되돌리기로는 살아난다) */}
            {pending && (() => {
                const emptied = pending.changes.filter((c) => isEmptyVal(c.value)).length;
                const label = byKey.get(pending.key)?.label ?? '';
                const to = fieldTypes.get(pending.field.type)?.label ?? pending.field.type;
                return (
                    <div className="absolute inset-0 z-[150] grid place-items-center bg-bg/60" data-rv-confirm role="alertdialog" aria-modal="true">
                        <div className="w-[320px] max-w-[90%] rounded-md border border-line bg-panel shadow-lg p-4 flex flex-col gap-3">
                            <div className="text-[13px] text-text">
                                「{label}」 칸을 「{to}」로 바꾸면 <b>{pending.lost}행의 값이 {emptied === pending.lost ? '비워집니다' : '바뀌며 일부 내용이 사라집니다'}</b>.
                            </div>
                            <div className="text-[12px] text-muted">되돌리기(⌘Z)로 되살릴 수 있습니다.</div>
                            <div className="flex justify-end gap-2">
                                <button type="button" data-rv-confirm-cancel onClick={() => setPending(null)} className="h-row px-3 rounded border border-line text-[13px] text-text hover:bg-text/[0.06]">취소</button>
                                <button type="button" data-rv-confirm-ok onClick={() => { const p = pending; setPending(null); applyConvert(p); }} className="h-row px-3 rounded bg-accent text-bg text-[13px]">바꾸기</button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
