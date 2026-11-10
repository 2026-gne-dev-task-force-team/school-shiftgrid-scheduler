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
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { isMod, isAlt, keyLabel, modClickLabel, Button, ContextMenu, EmptyState, Icon, IconButton, IconPicker, InlineRename, MenuItem, MenuList, MenuSeparator, Tooltip, parseClipboard, useContextTrigger, useDragLeaf, useReorder, type IconName, type MenuEntry } from '../../pane-ui-system';
import { Popover, Select } from '../../pane-ui-system';
import { Cell } from './Cell';
import { FieldGlyph } from './FieldGlyph';
import { Toolbar } from './Toolbar';
import { ViewTabs } from './ViewTabs';
import { calcFnsFor, runCalc } from './calc';
import { EMPTY_FILTER, deriveRows, freshIds, rowDropZone, displayText, filterIsEmpty, pruneFilter, rawValue } from './logic';
import { buildTree } from './subitems';
import { planConvert } from './convert';
import { fieldTypes } from './fields/registry';
import { OptionsEditor } from './fields/cells';
import { ReorderOverlay } from './ReorderOverlay';
import { newField } from './schema';
import { filterUniqueChanges, filterUniquePaste, firstDuplicate } from './unique';
import {
    DEFAULT_COL_WIDTH, MIN_COL_WIDTH, defaultView, loadActiveView, loadViews, reconcileColumns, saveActiveView, saveViews, watchViews,
} from './view-state';
import type {
    CellChange, ConvertPlan, FieldOption, RecordCellValue, RecordField, RecordViewProps, SortRule, ViewDef,
} from './contracts/collection';

// 🔴 노드 화면(views/)은 구조 검사 ⑯(소문자 record 비교 0) 때문에 'collection' 가 든 경로를 못 쓴다 —
//    그래서 노드 화면이 쓰는 공개 타입을 대문자 경로(./RecordView)로 다시 내보낸다(바깥 손님은 contracts/collection 로).
export type { CellChange, RecordField, RecordCellValue, ConvertPlan, PasteRequest, ViewDef } from './contracts/collection';

const SEL_W = 34;   // 선택 체크 칸 폭
/** 하위 항목 한 단 들여쓰기 폭 — 칸선 없는 여백(Q8). 설정 「모양 › 들여쓰기 폭」이 `--indent-step` 을 고른다(K11 · 기본 좁게 12px) */
const indentWidth = (depth: number) => `calc(var(--indent-step, 12px) * ${depth})`;

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

/** 행 컴포넌트가 받는 동작 — 바깥에서 한 번만 만든 안정 객체(최신 클로저는 ref 로 위임). 이게 바뀌면 행 메모가 깨진다 */
interface RowAct {
    toggleOne(id: string): void;
    hover(id: string): void;
    leave(id: string): void;
    cellMouseDown(e: React.MouseEvent, ri: number, fi: number): void;
    changeCell(id: string, key: string, value: RecordCellValue): void;
    setOptions(key: string, o: FieldOption[]): void;
    toggleCollapse(id: string): void;
    addChild(id: string): void;
    open(id: string): void;
    openTab(id: string): void;
    tab(id: string, shift: boolean): void;
    moveAlt(id: string, dir: 'up' | 'down'): void;
}
type DragBindLike = ReturnType<typeof useDragLeaf>['bind'];

/** 고정 칸(앞에서 frozen 칸) 달라붙기 — 머리줄·행이 같이 쓴다 */
const frozenStyleOf = (fi: number, frozen: number, lead: number, widths: number[]) =>
    (fi < frozen ? { position: 'sticky' as const, left: lead + widths.slice(0, fi).reduce((a, w) => a + w, 0), zIndex: 5 } : {});

/** 칸 껍데기(여백)를 눌러도 안쪽 글/숫자 칸 편집이 열린다 — 선택·체크·관계 칸(BUTTON)·이미 편집 중인 칸은 건드리지 않는다. */
const openEditFromWrapper = (e: React.MouseEvent<HTMLElement>) => {
    // 껍데기·칸 상자 같은 빈 영역만 — 입력·단추·칸 자체(자기 click 이 연다)는 건드리지 않는다
    if ((e.target as HTMLElement).closest('input,textarea,select,button,[data-rv-cell],[data-rv-open],[data-rv-add-child]')) return;
    const inner = e.currentTarget.querySelector<HTMLElement>('[data-rv-cell]');
    if (inner && inner.tagName !== 'BUTTON' && !inner.hasAttribute('data-rv-editing')) inner.click();
};

/** 시험용 — 행이 실제로 그려진 횟수(메모가 풀리면 행 수에 비례해 폭증한다). 화면 동작엔 안 쓴다 */
export const rowRenderProbe = { n: 0 };

interface RecordRowProps {
    r: unknown; id: string; ri: number; depth: number; hasChildren: boolean;
    fields: RecordField[]; widths: number[]; wraps: boolean[];
    lead: number; frozen: number; titleKey?: string;
    treeOn: boolean; reorderable: boolean; selectable: boolean; fieldsEditable: boolean;
    cellEditable: boolean; hasOpen: boolean; hasOpenTab: boolean; hasAddChild: boolean;
    checked: boolean; hovered: boolean; collapsed: boolean;
    markZone: 'before' | 'into' | 'after' | null; isFresh: boolean;
    rc0: number; rc1: number;
    icon: string | undefined; hasIconOf: boolean; rowIcon: IconName;
    act: RowAct; dragBind: DragBindLike;
}

/** 🔴 행 하나 — React.memo. 새 행을 더해도 옛 행은 props 가 그대로라 다시 안 그려진다(#50: 1,000행에서 추가마다 전부 리렌더 → 비례 이상 느려짐) */
const RecordRow = memo(function RecordRow({
    r, id, ri, depth, hasChildren, fields, widths, wraps, lead, frozen, titleKey, treeOn, reorderable, selectable, fieldsEditable,
    cellEditable, hasOpen, hasOpenTab, hasAddChild, checked, hovered, collapsed, markZone, isFresh, rc0, rc1, icon, hasIconOf, rowIcon, act, dragBind,
}: RecordRowProps) {
    rowRenderProbe.n++;
    const showOpen = hasOpen && hovered;
    const showTree = treeOn && hovered;
    const isTitle = (key: string) => key === titleKey;
    // 제목 칸 빈 곳(단추 말고)을 ⌘클릭·가운데 클릭 — 탭으로 열기
    const tabClick = (e: React.MouseEvent<HTMLElement>, key: string) => hasOpenTab && isTitle(key)
        && (e.button === 1 || (e.button === 0 && isMod(e)))
        && !(e.target as HTMLElement).closest('button,input,textarea,select');
    const inRange = (fi: number) => rc0 >= 0 && fi >= rc0 && fi <= rc1;
    const frozenStyle = (fi: number) => frozenStyleOf(fi, frozen, lead, widths);
    return (
        <div
            data-rv-row={id}
            tabIndex={treeOn ? 0 : undefined}
            onKeyDown={treeOn ? (e) => {
                // 행 포커스에서 Tab=들여쓰기 · Shift+Tab=내어쓰기. 셀 편집 중(입력칸)엔 안 가로챈다.
                if (e.key !== 'Tab') return;
                const t = e.target as HTMLElement;
                if (t !== e.currentTarget) return;   // 셀 안(셀 이동·편집)이면 표가 받는다
                e.preventDefault();
                act.tab(id, e.shiftKey);
            } : undefined}
            onMouseEnter={() => act.hover(id)}
            onMouseLeave={() => act.leave(id)}
            className={`flex border-b border-line min-h-[32px] ${isFresh ? 'ui-pop-in' : ''} ${checked ? 'bg-accent/[0.06]' : 'hover:bg-text/[0.02]'} ${markZone === 'before' ? 'border-t-2 border-t-accent' : ''} ${markZone === 'after' ? 'border-b-2 border-b-accent' : ''} ${markZone === 'into' ? 'bg-accent/[0.12] ring-1 ring-inset ring-accent' : ''}`}
        >
            {reorderable && (
                <div className="shrink-0 grid place-items-center bg-bg" style={{ width: 16, ...(frozen ? { position: 'sticky', left: 0, zIndex: 5 } : {}) }}
                    data-rv-row-drag={id} data-row-id={id} title={String(rawValue(r, titleKey ?? '') ?? '') || '제목 없음'}
                    tabIndex={0} aria-label="행 순서 바꾸기(Alt+↑↓)" {...dragBind}
                    onKeyDown={(e) => {
                        // 키보드 대안 — 끌기 없이도 순서를 바꾼다(Alt+↑ = 앞 행 앞으로 · Alt+↓ = 다음 행 뒤로)
                        if (!isAlt(e) || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
                        e.preventDefault(); e.stopPropagation();
                        act.moveAlt(id, e.key === 'ArrowUp' ? 'up' : 'down');
                    }}>
                    <Icon name="grip" size={16} className={`text-text/80 hover:text-text cursor-grab ${hovered ? '' : 'opacity-0'}`} />
                </div>
            )}
            {selectable && (
                <div className="shrink-0 grid place-items-center bg-bg" style={{ width: SEL_W, ...(frozen ? { position: 'sticky', left: reorderable ? 16 : 0, zIndex: 5 } : {}) }}>
                    {/* oxlint-disable-next-line react/forbid-elements -- 표 칸 안 조작 — 칸 모양 */}
                    <button type="button" role="checkbox" aria-checked={checked} data-rv-check={id} onClick={() => act.toggleOne(id)}
                        className={`hit-44 relative grid place-items-center w-4 h-4 rounded-[3px] border ${checked ? 'bg-accent border-accent text-bg' : 'border-line'}`}>
                        {checked && <Icon name="check" size={12} />}
                    </button>
                </div>
            )}
            {fields.map((f, fi) => (
                <div key={f.key} data-rv-pos={`${ri}:${fi}`} tabIndex={-1} data-rv-sel={inRange(fi) ? '' : undefined}
                    onMouseDown={(e) => {
                        // 제목 칸 ⌘클릭·가운데 클릭 = 탭으로 열기(브라우저 「새 탭」 손버릇 · W13)
                        if (tabClick(e, f.key)) { e.preventDefault(); act.openTab(id); return; }
                        act.cellMouseDown(e, ri, fi);
                    }}
                    // ⌘클릭이 탭으로 갔으면 칸 편집은 안 연다(안쪽 칸의 click 도 여기서 끊는다)
                    onClickCapture={(e) => { if (tabClick(e, f.key)) { e.preventDefault(); e.stopPropagation(); } }}
                    onMouseUp={(e) => { if (!tabClick(e, f.key)) openEditFromWrapper(e); }}
                    onDoubleClick={openEditFromWrapper}
                    className={`relative shrink-0 border-r border-line overflow-hidden flex outline-none ${wraps[fi] ? 'items-start py-1 [&_.truncate]:whitespace-pre-wrap [&_.truncate]:break-keep [&_.truncate]:[overflow-wrap:anywhere]' : 'items-center'} ${fi < frozen ? 'bg-bg' : ''} ${inRange(fi) ? 'ring-2 ring-inset ring-accent/60' : ''}`}
                    style={{ width: widths[fi], ...frozenStyle(fi) }}>
                    {fi === 0 && treeOn && (
                        <div className="shrink-0 flex items-center self-stretch">
                            {depth > 0 && <span data-rv-pad={depth} className="shrink-0" style={{ width: indentWidth(depth) }} />}
                            {hasChildren ? (
                                // oxlint-disable-next-line react/forbid-elements -- 표 칸 안 조작 — 칸 모양
                                <button type="button" data-rv-fold={id} aria-expanded={!collapsed} aria-label={collapsed ? '펼치기' : '접기'}
                                    onClick={() => act.toggleCollapse(id)}
                                    className="hit-44 relative grid place-items-center w-4 h-4 rounded text-muted hover:text-text hover:bg-text/[0.08]">
                                    <Icon name="chevronDown" size={13} className={collapsed ? '-rotate-90' : ''} />
                                </button>
                            ) : <span className="inline-block w-4" />}
                        </div>
                    )}
                    {isTitle(f.key) && hasIconOf && (
                        <span className="shrink-0 pl-1.5 text-body leading-none select-none" data-rv-icon={id}>
                            {icon ?? <Icon name={rowIcon} size={14} className="text-muted" />}
                        </span>
                    )}
                    <div data-rv-cellbox className="relative flex-1 min-w-0 self-stretch h-full [&:has([data-rv-editing])_[data-rv-untitled]]:hidden">
                        {/* S15: 제목이 비면 흐린 「제목 없음」(편집 중엔 빈 입력 — 위 :has 가 숨긴다) */}
                        {isTitle(f.key) && String(rawValue(r, f.key) ?? '').trim() === '' && (
                            <span data-rv-untitled className="absolute inset-y-0 left-2 flex items-center text-body text-muted/60 pointer-events-none select-none">제목 없음</span>
                        )}
                        <Cell
                            field={f}
                            fields={fields}
                            rowId={id}
                            rowValue={r}
                            editable={cellEditable && !f.readOnly}
                            onChange={(val) => act.changeCell(id, f.key, val)}
                            onOptionsChange={fieldsEditable && !isTitle(f.key) ? (o) => act.setOptions(f.key, o) : undefined}
                        />
                    </div>
                    {/* 머무를 때 단추들 — 칸 위에 겹쳐 띄운다(자리를 차지하면 좁은 칸·줄바꿈 칸에서 제목이 한 글자씩 꺾인다) */}
                    {isTitle(f.key) && ((showTree && hasAddChild) || showOpen) && (
                    <div data-rv-hover-tools className="absolute right-0 top-0 h-8 flex items-center pl-1 bg-bg/90 rounded-l">
                    {showTree && hasAddChild && (
                        <Tooltip text="하위 항목 추가">
                            <IconButton icon="plus" label="하위 항목 추가" title="" size={13} data={{ 'data-rv-add-child': id }}
                                onClick={() => { if (collapsed) act.toggleCollapse(id); act.addChild(id); }} />
                        </Tooltip>
                    )}
                    {showOpen && (
                        <Button size="sm" className="shrink-0 mx-1 !h-6 whitespace-nowrap" data-rv-open={id}
                            onClick={(e) => { if (hasOpenTab && isMod(e)) act.openTab(id); else act.open(id); }}
                            onAuxClick={(e) => { if (hasOpenTab && e.button === 1) { e.preventDefault(); act.openTab(id); } }}>열기</Button>
                    )}
                    {showOpen && hasOpenTab && (
                        <Tooltip text={`탭으로 열기 (${modClickLabel()})`}>
                            <IconButton icon="arrowRight" label="탭으로 열기" title="" size={13} data={{ 'data-rv-open-tab': id }} onClick={() => act.openTab(id)} />
                        </Tooltip>
                    )}
                    </div>
                    )}
                </div>
            ))}
            {fieldsEditable && <div className="shrink-0" style={{ width: 40 }} />}
        </div>
    );
});

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
    emptyHint,
    description,
    onDescriptionChange,
    descriptionLine = true,
    onDeleteRecords,
    onDestructive,
    onOpenRecord,
    onOpenRecordTab,
    iconOf,
    rowIcon = 'fileText',
    onFieldsChange,
    onConvertField,
    onPaste,
    onReorder,
    tree,
    toolbarHost,
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
    // 🔴 R3-X — 다른 탭이 이 보기 정의를 바꾸면 다시 읽는다(설정은 탭 사이에 같게 · 활성 탭은 탭마다)
    useEffect(() => (controlled ? undefined : watchViews(viewKey, () => setLocalViews(loadViews(viewKey)))), [viewKey, controlled]);
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
        const writable = changes.filter((c) => !byKey.get(c.key)?.readOnly);
        // 🔴 「유일」 칸 — 겹치는 값을 쓰는 변경은 뺀다(한 칸 편집·채우기·여러 줄 바꾸기·되돌린 붙여넣기 모두 이 한 곳을 지난다)
        const byId = new Map(records.map((r) => [getId(r), r] as const));   // 🔴 변경마다 records.find 로 훑으면 O(n²) — 한 번만 만든다
        const { kept: live, rejected } = filterUniqueChanges(writable, [...byId.keys()],
            (id, key) => { const r = byId.get(id); return r ? rawValue(r, key) as RecordCellValue | undefined : undefined; },
            new Set(fields.filter((f) => f.unique).map((f) => f.key)));
        if (rejected.length > 0) {
            const f = byKey.get(rejected[0].key);
            setUniqueMsg(rejected.length === 1 && writable.length === 1
                ? `「${f?.label ?? ''}」 칸은 유일해야 합니다 — 「${String(rejected[0].value ?? '')}」 값은 이미 다른 줄에 있습니다.`
                : `「${f?.label ?? ''}」 칸은 유일해야 합니다 — 겹치는 ${rejected.length}칸은 건너뛰었습니다.`);
        } else if (writable.length > 0) setUniqueMsg(null);
        if (live.length === 0) return;
        if (onCellsChange) onCellsChange(live);
        else for (const c of live) onCellChange?.(c.id, c.key, c.value);
    };
    const patchView = useCallback((p: Partial<ViewDef>) => {
        const base = views.length > 0 ? views : [view];
        commitViews(base.map((v) => (v.id === view.id ? { ...reconcileColumns(v, fields), ...p } : v)));
    }, [views, view, fields, commitViews]);

    const [search, setSearch] = useState('');
    // 「유일」 칸에 막힌 편집의 이유 — 표 위 경고 줄(다음 편집이 통하면 지운다)
    const [uniqueMsg, setUniqueMsg] = useState<string | null>(null);
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
    // S15': 새로 추가된 행만 .ui-pop-in(첫 렌더·필터 변경·보기 갈아끼움엔 안 켠다) — 렌더 뒤에 「본 id」를 갱신해 다음 렌더가 차이를 잡는다
    const seenIds = useRef<Set<string> | null>(null);
    const fresh = useMemo(() => freshIds(seenIds.current, records.map((r) => getId(r))), [records, getId]);
    useEffect(() => { seenIds.current = new Set(records.map((r) => getId(r))); }, [records, getId]);

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

    // 열기 — 피크가 닫히면 그 행으로 초점이 돌아오게, 열기 전에 그 행의 첫 칸에 초점을 둔다(피크 층이 그 자리를 기억한다)
    const openRow = (id: string) => {
        [...(gridRef.current?.querySelectorAll<HTMLElement>('[data-rv-row]') ?? [])].find((el) => el.getAttribute('data-rv-row') === id)
            ?.querySelector<HTMLElement>('[data-rv-pos]')?.focus({ preventScroll: true });
        onOpenRecord?.(id);
    };
    // R6 우클릭: 줄·칸 → 줄 메뉴 · 칸 머리 → 칸 메뉴(머리 ⋯ 와 같은 것) · 빈 곳 → 새로 만들기. 입력칸 안은 기본 메뉴
    const [ctx, setCtx] = useState<{ x: number; y: number; items: MenuEntry[] } | null>(null);
    const ctxTrigger = useContextTrigger((x, y, ev) => {
        const t = ev.target as HTMLElement;
        const headKey = t.closest('[data-rv-head]')?.getAttribute('data-rv-head');
        if (headKey) { setHeadMenu({ key: headKey, rect: new DOMRect(x, y, 0, 0) }); return; }
        const rowId = t.closest('[data-rv-row]')?.getAttribute('data-rv-row');
        const items: MenuEntry[] = [];
        if (rowId) {
            if (onOpenRecord) items.push({ label: '열기', icon: 'right', onClick: () => openRow(rowId) });
            if (onOpenRecordTab) items.push({ label: '탭으로 열기', icon: 'arrowRight', onClick: () => onOpenRecordTab(rowId) });
            if (tree?.onAddChild) items.push({ label: '하위 항목 추가', icon: 'plus', onClick: () => tree.onAddChild!(rowId) });
            if (treeOn && tree) items.push({ label: '들여쓰기 (⌘])', onClick: () => tree.onIndent(rowId) }, { label: '내어쓰기 (⌘[)', onClick: () => tree.onOutdent(rowId) });
            if (onDeleteRecords) items.push({ sep: true }, { label: '삭제', icon: 'trash', danger: true, onClick: () => onDeleteRecords([rowId]) });
        }
        if (!rowId && onAddRecord) items.push({ label: '새로 만들기', icon: 'plus', onClick: onAddRecord });
        if (items.length) setCtx({ x, y, items });
    }, (t) => !!t.closest('input, textarea, select'));

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

    // ── 행 끌어 순서 바꾸기·하위로 넣기(수동 순서일 때만) ──
    //   행 위 가장자리 = 그 앞으로 · 아래 가장자리 = 그 뒤로 · 가운데 = 그 행의 하위로(트리일 때만 · 노션 꼴 · Q8)
    const reorderable = !!onReorder && manualOrder;
    type DropMark = { id: string; zone: 'before' | 'into' | 'after' } | '__end__';
    const parentMap = useMemo(() => new Map(records.map((r) => [getId(r), tree?.parentOf(r) ?? null])), [records, getId, tree]);
    /** 끌고 있는 행 자신이거나 그 자손이면 거기엔 못 놓는다(자기 안으로 들어가는 순환) */
    const inOwnSubtree = (dragId: string, targetId: string) => {
        for (let cur: string | null | undefined = targetId, n = 0; cur && n < 10000; cur = parentMap.get(cur), n++) if (cur === dragId) return true;
        return false;
    };
    /** 포인터 y 가 놓일 자리 — 행 사각형을 훑어 번역한다(맨 아래 너머 = 맨 끝). 자기 하위·자기 자신 위는 null */
    const dropTargetAt = (from: string, y: number): DropMark | null => {
        const els = [...(gridRef.current?.querySelectorAll<HTMLElement>('[data-rv-row]') ?? [])];
        if (els.length === 0) return null;
        const canNest = treeOn && !!tree?.onMoveUnder;
        for (let i = 0; i < els.length; i++) {
            const r = els[i].getBoundingClientRect();
            if (y > r.bottom && i < els.length - 1) continue;
            if (y > r.bottom) return '__end__';
            const id = els[i].getAttribute('data-rv-row')!;
            if (inOwnSubtree(from, id)) return null;
            return { id, zone: rowDropZone(y, r.top, r.height, canNest) };
        }
        return null;
    };
    const rowDrag = useDragLeaf({
        enabled: reorderable,
        axis: 'y',
        onContext: () => { /* 행 손잡이엔 메뉴 없음 */ },
        onDrop: (from, _x, y) => {
            const t = dropTargetAt(from, y);
            if (t === '__end__') moveRow(from, null);
            else if (t) moveRow(from, t.id, t.zone);
        },
    });
    const dropMark: DropMark | null = rowDrag.drag ? dropTargetAt(rowDrag.drag.leafId, rowDrag.drag.y) : null;
    const moveRow = (from: string, toId: string | null, zone: 'before' | 'into' | 'after' = 'before') => {
        if (!onReorder || from === toId) return;
        if (toId && inOwnSubtree(from, toId)) return;
        if (toId && zone === 'into' && tree?.onMoveUnder) {
            tree.onMoveUnder(from, toId);
            if (tree.collapsed(toId)) tree.onToggleCollapse(toId);   // 접혀 있으면 넣은 행이 안 보이니 펼친다
            return;
        }
        if (toId && zone === 'after') {
            // 이 행 바로 뒤 = 화면에서 다음 줄 앞(펼친 자식이 있으면 그 첫 자식 앞 = 노션과 같다). 마지막 줄이면 맨 끝
            const at = rowIds.indexOf(toId);
            const next = rowIds[at + 1];
            // shortcut: 맨 끝으로 가면 뿌리 끝이 된다(안쪽 마지막 줄 뒤에 놓아도) — 필요하면 onMoveAfter 를 계약에 더한다
            onReorder(from, next === from ? (rowIds[at + 2] ?? null) : (next ?? null));
            return;
        }
        onReorder(from, toId);
    };

    // ── 칸 순서 끌기(보기마다) ────────────────────────────────────────────────
    // 🔴 순서 바꾸기는 공용 훅 하나(보기 탭·리본과 같은 것 — 터치 길게 누르기·Alt+←/→ 키보드 포함). 숨긴 칸은 제자리에 둔다
    const colReorder = useReorder<HTMLDivElement>({
        ids: visibleFields.map((f) => f.key),
        axis: 'x',
        onReorder: (next) => {
            const byColKey = new Map(view.columns.map((c) => [c.key, c] as const));
            const shown = new Set(next);
            let n = 0;
            patchView({ columns: view.columns.map((c) => (shown.has(c.key) ? byColKey.get(next[n++])! : c)) });
        },
        onContext: (x, y, el) => {
            const key = el.closest('[data-rv-head]')?.getAttribute('data-rv-head');
            if (key) setHeadMenu({ key, rect: new DOMRect(x, y, 0, 0) });
        },
    });

    // ── 칸 구조(이름·타입·추가·삭제·선택지) — onFieldsChange 가 있을 때만 ──────────
    const fieldsEditable = !!onFieldsChange;
    const setSortSingle = (key: string, dir: 'asc' | 'desc') => { patchView({ sorts: [{ key, dir }] }); setHeadMenu(null); };
    const renameField = (key: string, label: string) => {
        const cur = byKey.get(key);
        if (!cur || cur.label === label) return;
        onFieldsChange?.(fields.map((f) => (f.key === key ? { ...f, label } : f)));
    };
    const setFieldIcon = (key: string, icon: string | undefined) =>
        onFieldsChange?.(fields.map((f) => (f.key === key ? { ...f, icon } : f)));
    const setOptions = (key: string, options: FieldOption[]) => {
        const apply = () => onFieldsChange?.(fields.map((f) => (f.key === key ? { ...f, options } : f)));
        const old = byKey.get(key)?.options ?? [];
        if (onDestructive && options.length < old.length) onDestructive(`선택지 ${old.length - options.length}개를 삭제했습니다`, apply);
        else apply();
    };
    const deleteField = (key: string) => {
        const label = byKey.get(key)?.label ?? key;
        const apply = () => {
            onFieldsChange?.(fields.filter((f) => f.key !== key));
            patchView({
                sorts: view.sorts.filter((s) => s.key !== key),
                filter: pruneFilter(view.filter, key),
                columns: view.columns.filter((c) => c.key !== key),
            });
        };
        if (onDestructive) onDestructive(`속성 「${label}」을 삭제했습니다`, apply); else apply();
        setHeadMenu(null);
    };
    /** 「유일」 켜기/끄기 — 이미 겹친 값이 있으면 켜지 않고 이유를 보인다. */
    const toggleUnique = (key: string) => {
        const f = byKey.get(key);
        if (!f) return;
        setHeadMenu(null);
        if (!f.unique) {
            const dup = firstDuplicate(records.map((r) => rawValue(r, key) as RecordCellValue | undefined));
            if (dup !== null) { setUniqueMsg(`「${f.label}」 칸에 같은 값(「${dup}」)이 이미 여러 줄에 있어 유일을 켤 수 없습니다 — 먼저 겹친 값을 고치세요.`); return; }
        }
        setUniqueMsg(null);
        onFieldsChange?.(fields.map((x) => (x.key === key ? (x.unique ? (({ unique: _u, ...rest }) => { void _u; return rest; })(x) : { ...x, unique: true }) : x)));
    };
    const addField = (type: string) => {
        const def = fieldTypes.get(type);
        if (!def) return;
        // 기본 이름이 겹치면 「새 칸 2」처럼 번호
        const taken = new Set(fields.map((x) => x.label));
        let label = '새 칸';
        for (let n = 2; taken.has(label); n++) label = `새 칸 ${n}`;
        const f = newField(type, label);
        if (def.defaultConfig !== undefined) f.config = def.defaultConfig;
        if (def.defaultOptions) f.options = def.defaultOptions.map((o) => ({ ...o }));
        else if (def.hasOptions) f.options = [];
        if (def.readOnly) f.readOnly = true;
        onFieldsChange?.([...fields, f]);
        // 새 칸 이름 편집으로 초점(칸 메뉴의 이름 입력이 뜨며 전체 선택한다)
        if (addMenu) setHeadMenu({ key: f.key, rect: addMenu });
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
        if (!f || f.locked || f.type === type) return;
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
        const matrix = parseClipboard(text);
        if (matrix.every((r) => r.length === 0)) return;
        e.preventDefault();
        const width = Math.max(...matrix.map((r) => r.length));
        const keys: (string | null)[] = Array.from({ length: width }, (_, i) => visibleFields[i]?.key ?? null);
        // 🔴 「유일」 칸 — 기존 값·앞서 붙인 줄과 겹치는 칸은 비우고(그 칸만 건너뜀) 몇 칸 건너뛰었는지 알린다
        const uniq = filterUniquePaste(keys, matrix, (k) => records.map((r) => rawValue(r, k) as RecordCellValue | undefined),
            new Set(fields.filter((f) => f.unique).map((f) => f.key)));
        setUniqueMsg(uniq.skipped > 0 ? `유일 칸에서 이미 있는 값과 겹친 ${uniq.skipped}칸은 비워 두고 붙여넣었습니다.` : null);
        onPaste({ keys, rows: uniq.rows });
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
    // ── 칸 편집 중 키 — 입력칸이 먼저 확정/취소하고(버블로 여기 도착), 여기서 다음 칸 편집·초점 복귀를 맡는다 ──
    const [pendingGo, setPendingGo] = useState<{ r: number; c: number; edit: boolean; minLen: number } | null>(null);
    useEffect(() => {
        if (!pendingGo || rows.length < pendingGo.minLen) return;
        const g = pendingGo;
        setPendingGo(null);
        setCur({ r: g.r, c: g.c }); setAnchor(null);
        const pos = cellEl(g.r, g.c);
        if (!pos) return;
        pos.focus({ preventScroll: true });
        const inner = pos.querySelector<HTMLElement>('[data-rv-cell]');
        if (g.edit && inner && inner.tagName !== 'BUTTON') inner.click();   // 편집 열기 = 클릭과 같은 길(체크 단추는 건드리지 않는다)
    }, [pendingGo, rows.length]);   // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { if (!pendingGo) return; const h = setTimeout(() => setPendingGo(null), 1500); return () => clearTimeout(h); }, [pendingGo]);
    const onEditKey = (e: React.KeyboardEvent): boolean => {
        const t = e.target as HTMLElement;
        if (!t.matches('[data-rv-editing]') || e.nativeEvent.isComposing || e.keyCode === 229) return false;
        const m = /^(\d+):(\d+)$/.exec(t.closest<HTMLElement>('[data-rv-pos]')?.dataset.rvPos ?? '');
        if (!m) return false;
        const r = +m[1], c = +m[2];
        if (e.key === 'Escape') { setPendingGo({ r, c, edit: false, minLen: 0 }); return true; }
        if (e.key === 'Enter') {
            if (e.shiftKey && t.tagName === 'TEXTAREA') return true;   // 글 칸 줄바꿈 — 입력칸이 받는다
            if (r + 1 < rows.length) setPendingGo({ r: r + 1, c, edit: true, minLen: 0 });
            else if (onAddRecord) { onAddRecord(); setPendingGo({ r: r + 1, c, edit: true, minLen: rows.length + 1 }); }
            return true;
        }
        if (e.key === 'Tab') {
            const last = visibleFields.length - 1;
            let nr = r, nc = c + (e.shiftKey ? -1 : 1);
            if (nc > last) { nc = 0; nr = r + 1; } else if (nc < 0) { nc = last; nr = r - 1; }
            if (nr < 0 || nr >= rows.length) { setPendingGo({ r, c, edit: false, minLen: 0 }); return true; }
            setPendingGo({ r: nr, c: nc, edit: canEditCell(visibleFields[nc]), minLen: 0 });
            return true;
        }
        return false;
    };
    // ⌘] 들여쓰기 · ⌘[ 내어쓰기(옵시디언·VS Code 와 같은 키) — Tab 은 칸 이동이라 못 쓴다. 고른 칸의 행이 대상이고, 커서는 그 행을 따라간다.
    const followRow = useRef<{ id: string; c: number } | null>(null);
    useEffect(() => {
        const f = followRow.current;
        if (!f) return;
        followRow.current = null;
        const r = rowIds.indexOf(f.id);
        if (r >= 0) { setAnchor(null); setCur({ r, c: f.c }); }
    }, [rowIds]);
    const onIndentKey = (e: React.KeyboardEvent): boolean => {
        if (!treeOn || !cur || !isMod(e) || e.shiftKey || e.altKey || e.nativeEvent.isComposing) return false;
        const out = e.code === 'BracketLeft' || e.key === '[';
        if (!out && e.code !== 'BracketRight' && e.key !== ']') return false;
        const id = rowIds[cur.r];
        if (!id) return false;
        e.preventDefault(); e.stopPropagation();
        followRow.current = { id, c: cur.c };
        if (out) tree?.onOutdent(id); else tree?.onIndent(id);
        return true;
    };
    const onGridKeyDown = (e: React.KeyboardEvent) => {
        if (onIndentKey(e)) return;
        if (onEditKey(e)) return;
        const t = e.target as HTMLElement;
        if (!cur || e.nativeEvent.isComposing || t.closest('input,textarea,select,[contenteditable="true"],[data-rv-editing]')) return;
        const mod = isMod(e);
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
    const frozenStyle = (fi: number) => frozenStyleOf(fi, frozen, lead, widths);
    const wrapOf = (key: string) => view.columns.find((c) => c.key === key)?.wrap === true;

    const sortDirOf = (key: string): SortRule['dir'] | null => view.sorts.find((s) => s.key === key)?.dir ?? null;
    const isTitle = (key: string) => key === titleKey;

    // ── 행 메모용 — 폭·줄바꿈 배열과 안정 동작 객체(최신 클로저는 ref 로 위임). 행 props 가 안 바뀌면 행이 안 그려진다 ──
    const widths = useMemo(() => visibleFields.map((f) => (liveW?.key === f.key ? liveW.w : view.columns.find((c) => c.key === f.key)?.width ?? f.width ?? DEFAULT_COL_WIDTH)), [visibleFields, view.columns, liveW]);
    const wraps = useMemo(() => visibleFields.map((f) => wrapOf(f.key)), [visibleFields, view.columns]);   // eslint-disable-line react-hooks/exhaustive-deps
    const latest = useRef<RowAct>(null as unknown as RowAct);
    latest.current = {
        toggleOne,
        hover: (id) => setHoverRow(id),
        leave: (id) => setHoverRow((h) => (h === id ? null : h)),
        cellMouseDown: (e, ri, fi) => {
            if ((e.target as HTMLElement).closest('input,textarea,select')) return;
            if (e.shiftKey && cur) { if (!anchor) setAnchor(cur); setCur({ r: ri, c: fi }); e.preventDefault(); return; }
            setAnchor(null); setCur({ r: ri, c: fi });
        },
        changeCell: (id, key, value) => changeCells([{ id, key, value }]),
        setOptions,
        toggleCollapse: (id) => tree?.onToggleCollapse(id),
        addChild: (id) => tree?.onAddChild?.(id),
        open: (id) => openRow(id),
        openTab: (id) => onOpenRecordTab?.(id),
        tab: (id, shift) => { if (shift) tree?.onOutdent(id); else tree?.onIndent(id); },
        moveAlt: (id, dir) => {
            const at = rowIds.indexOf(id);
            if (dir === 'up' && at > 0) moveRow(id, rowIds[at - 1], 'before');
            else if (dir === 'down' && at < rowIds.length - 1) moveRow(id, rowIds[at + 1], 'after');
        },
    };
    const act = useMemo<RowAct>(() => ({
        toggleOne: (id) => latest.current.toggleOne(id),
        hover: (id) => latest.current.hover(id),
        leave: (id) => latest.current.leave(id),
        cellMouseDown: (e, ri, fi) => latest.current.cellMouseDown(e, ri, fi),
        changeCell: (id, key, v) => latest.current.changeCell(id, key, v),
        setOptions: (key, o) => latest.current.setOptions(key, o),
        toggleCollapse: (id) => latest.current.toggleCollapse(id),
        addChild: (id) => latest.current.addChild(id),
        open: (id) => latest.current.open(id),
        openTab: (id) => latest.current.openTab(id),
        tab: (id, s) => latest.current.tab(id, s),
        moveAlt: (id, d) => latest.current.moveAlt(id, d),
    }), []);
    const dragLatest = useRef(rowDrag.bind);
    dragLatest.current = rowDrag.bind;
    const dragBindStable = useMemo<DragBindLike>(() => {
        const o: Record<string, unknown> = {};
        for (const k of Object.keys(dragLatest.current) as (keyof DragBindLike)[]) o[k] = (...a: unknown[]) => (dragLatest.current[k] as (...x: unknown[]) => unknown)(...a);
        return o as DragBindLike;
    }, []);

    const totalWidth = (reorderable ? 16 : 0) + SEL_W * (selectable ? 1 : 0) + visibleFields.reduce((a, f) => a + widthOf(f), 0) + (fieldsEditable ? 40 : 0);

    return (
        <div className={`relative flex flex-col h-full min-h-0 bg-bg ${className}`} data-rv-root>
            {descriptionLine && <DescriptionLine text={description} onChange={onDescriptionChange} />}
            <ViewTabs
                views={views.length > 0 ? views : [view]}
                activeId={view.id}
                fields={fields}
                onSelect={(id) => { selectView(id); setCur(null); setAnchor(null); }}
                onChange={(next, select) => {
                    const apply = () => { commitViews(next); if (select) selectView(select); };
                    if (onDestructive && next.length < views.length) onDestructive('보기 1개를 삭제했습니다', apply); else apply();
                }}
            />
            <Toolbar
                host={toolbarHost}
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
                    <span className="text-small text-text">{liveSelected.length}개 선택</span>
                    {visibleFields.some((f) => canEditCell(f)) && (
                        <Button size="sm" variant="ghost" icon="edit" data-rv-bulk onClick={(e) => setBulk({ rect: e.currentTarget.getBoundingClientRect(), key: visibleFields.find((f) => canEditCell(f))!.key })}>속성 바꾸기</Button>
                    )}
                    <Button size="sm" variant="ghost" tone="danger" icon="trash" data-rv-delete onClick={deleteSelected}>삭제</Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>해제</Button>
                </div>
            )}

            {uniqueMsg && (
                <div role="alert" data-rv-unique-msg className="flex items-center gap-2 px-2 py-1 border-b border-line bg-warn/10 text-small text-text shrink-0">
                    <Icon name="warn" size={13} className="text-warn shrink-0" />
                    <span className="flex-1 min-w-0">{uniqueMsg}</span>
                    <IconButton icon="x" label="닫기" size={12} onClick={() => setUniqueMsg(null)} />
                </div>
            )}

            {/* 표 — 가로·세로 스크롤은 이 칸이 쥔다(좁은 화면은 가로 스크롤) */}
            <div ref={gridRef} tabIndex={-1} data-rv-grid {...ctxTrigger} onPaste={onGridPaste} onCopy={onGridCopy} onKeyDown={onGridKeyDown} onMouseDown={focusGrid} className="flex-1 min-h-0 overflow-auto outline-none">
                <div style={{ minWidth: totalWidth }} className="text-text">
                    {/* 머리줄 */}
                    <div ref={colReorder.containerRef} {...colReorder.bind} onKeyDown={colReorder.onKeyDown}
                        onPointerDown={(e) => { e.stopPropagation(); colReorder.bind.onPointerDown(e); }}   // 길게 누르기 메뉴는 끌기 훅 한 곳이 쥔다(표의 것과 안 겹치게)
                        className="flex sticky top-0 z-10 bg-panel2 border-b border-line select-none h-header">
                        {reorderable && <div className="shrink-0 bg-panel2" style={{ width: 16, ...(frozen ? { position: 'sticky', left: 0, zIndex: 5 } : {}) }} />}
                        {selectable && (
                            <div className="shrink-0 grid place-items-center bg-panel2" style={{ width: SEL_W, ...(frozen ? { position: 'sticky', left: reorderable ? 16 : 0, zIndex: 5 } : {}) }}>
                                {/* oxlint-disable-next-line react/forbid-elements -- 표 칸 안 조작 — 칸 모양 */}
                                <button type="button" role="checkbox" aria-label={allChecked ? '모두 선택 해제' : '모두 선택'} aria-checked={allChecked} data-rv-check-all onClick={toggleAll}
                                    className={`hit-44 relative grid place-items-center w-4 h-4 rounded-[3px] border ${allChecked ? 'bg-accent border-accent text-bg' : 'border-line'}`}>
                                    {allChecked && <Icon name="check" size={12} />}
                                </button>
                            </div>
                        )}
                        {visibleFields.map((f, fi) => {
                            const dir = sortDirOf(f.key);
                            return (
                                <div key={f.key} className={`relative shrink-0 flex items-center gap-1 px-2 border-r border-line ${fi < frozen ? 'bg-panel2' : ''}`} style={{ width: widthOf(f), ...frozenStyle(fi) }} data-rv-head={f.key}>
                                    {/* 끌어서 칸 순서 — 이름 부분이 손잡이(폭 손잡이·메뉴 단추와 안 겹치게) */}
                                    <div data-rv-drag={f.key} data-row-id={f.key} title={f.label} tabIndex={0}
                                        className="flex-1 min-w-0 flex items-center gap-1 cursor-grab outline-none">
                                        <Tooltip text={f.description} className="flex flex-1 min-w-0 items-center gap-1">
                                            <FieldGlyph field={f} />
                                            <span className="flex-1 min-w-0 truncate text-small font-medium">{f.label}</span>
                                        </Tooltip>
                                    </div>
                                    {dir && <Icon name="sort" size={12} className={`text-accent shrink-0 ${dir === 'asc' ? 'rotate-180' : ''}`} />}
                                    {/* oxlint-disable-next-line react/forbid-elements -- 표 칸 안 조작 — 칸 모양 */}
                                    <button type="button" data-rv-head-menu={f.key} aria-label="칸 메뉴"
                                        onClick={(e) => setHeadMenu({ key: f.key, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() })}
                                        className="hit-44 relative shrink-0 grid place-items-center w-5 h-5 rounded text-text/70 hover:text-text hover:bg-text/[0.08]">
                                        <Icon name="dots" size={16} />
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
                        {fieldsEditable && (
                            // oxlint-disable-next-line react/forbid-elements -- 표 칸 안 조작 — 칸 모양
                            <button type="button" data-rv-add-field onClick={(e) => setAddMenu((e.currentTarget as HTMLElement).getBoundingClientRect())} className="shrink-0 grid place-items-center text-muted hover:text-text hover:bg-text/[0.06]" style={{ width: 40 }} aria-label="칸 추가">
                                <Icon name="plus" size={15} />
                            </button>
                        )}
                    </div>

                    {/* 본문 */}
                    {displayRows.map(({ row: r, depth, hasChildren }, ri) => {
                        const id = getId(r);
                        const hovered = coarse || hoverRow === id;
                        const mark = dropMark && dropMark !== '__end__' && dropMark.id === id ? dropMark : null;
                        const inRow = !!range && ri >= range.r0 && ri <= range.r1;
                        return (
                            <RecordRow
                                key={id}
                                r={r} id={id} ri={ri} depth={depth} hasChildren={hasChildren}
                                fields={visibleFields} widths={widths} wraps={wraps}
                                lead={lead} frozen={frozen} titleKey={titleKey}
                                treeOn={treeOn} reorderable={reorderable} selectable={selectable} fieldsEditable={fieldsEditable}
                                cellEditable={!!onCellChange} hasOpen={!!onOpenRecord} hasOpenTab={!!onOpenRecordTab} hasAddChild={!!tree?.onAddChild}
                                checked={selected.has(id)} hovered={hovered}
                                collapsed={treeOn && tree ? tree.collapsed(id) : false}
                                markZone={mark?.zone ?? null} isFresh={fresh.has(id)}
                                rc0={inRow ? range!.c0 : -1} rc1={inRow ? range!.c1 : -1}
                                icon={iconOf ? iconOf(id) : undefined} hasIconOf={!!iconOf} rowIcon={rowIcon}
                                act={act} dragBind={dragBindStable}
                            />
                        );
                    })}

                    {rows.length === 0 && (records.length > 0 && !manualOrder ? (
                        // 걸린 조건 때문에 0개 — 데이터가 없는 게 아니다. 조건을 지우는 길을 바로 준다
                        <div data-rv-empty="filtered">
                            <EmptyState compact icon="filter" title="조건에 맞는 항목 없음"
                                action={{ label: '필터 삭제', onClick: () => { setSearch(''); patchView({ filter: EMPTY_FILTER }); } }} />
                        </div>
                    ) : (
                        <div data-rv-empty>
                            <EmptyState compact icon="table" title="표시할 행이 없습니다"
                                description={<>
                                    {description?.trim() && <span data-rv-empty-desc className="block text-text/80 mb-1">{description}</span>}
                                    {emptyHint ?? (onAddRecord ? (onPaste ? '아래 「새로 만들기」를 누르거나 엑셀 표를 복사해 붙여넣으면 만들 수 있습니다.' : '아래 「새로 만들기」를 누르면 첫 항목을 만듭니다.') : onPaste ? '엑셀 표를 복사해 여기에 붙여넣으면 한꺼번에 만들 수 있습니다.' : null)}
                                </>} />
                        </div>
                    ))}

                    {/* + 새로 만들기 */}
                    {onAddRecord && (
                        // oxlint-disable-next-line react/forbid-elements -- 표 칸 안 조작 — 칸 모양
                        <button type="button" data-rv-add
                            onClick={() => { onAddRecord(); setPendingGo({ r: rows.length, c: Math.max(0, visibleFields.findIndex((f) => isTitle(f.key))), edit: true, minLen: rows.length + 1 }); }}
                            className={`flex items-center gap-1.5 w-full h-row px-3 text-body text-muted hover:text-text hover:bg-text/[0.04] select-none sticky left-0 ${dropMark === '__end__' ? 'border-t-2 border-t-accent' : ''}`}>
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
                                // oxlint-disable-next-line react/forbid-elements -- 표 칸 안 조작 — 칸 모양
                                <button key={f.key} type="button" data-rv-calc={f.key}
                                    onClick={(e) => setCalcMenu({ key: f.key, rect: e.currentTarget.getBoundingClientRect() })}
                                    className={`shrink-0 flex items-center justify-end gap-1 px-2 text-small hover:bg-text/[0.04] ${label ? 'text-text' : 'text-transparent hover:text-muted'}`}
                                    style={{ width: widthOf(f) }}>
                                    {label ? <><span className="text-muted">{label}</span><span className="tabular-nums" data-rv-calc-val>{val}</span></> : '계산'}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <ReorderOverlay drag={colReorder.drag} indicator={colReorder.indicator} axis="x" />
            <ReorderOverlay drag={rowDrag.drag} indicator={null} axis="y" />

            {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={() => setCtx(null)} />}

            {/* 칸 추가 — 타입 고르기 */}
            {addMenu && (
                <Popover anchor={addMenu} width={200} align="right" onClose={() => setAddMenu(null)}>
                    <div data-rv-add-menu>
                        <div className="px-2 py-0.5 text-note text-muted">어떤 칸을 만들까요?</div>
                        <MenuList autoFocus label="칸 종류">
                            {fieldTypes.list().map((d) => <MenuItem key={d.type} label={d.label} icon={d.icon} onSelect={() => addField(d.type)} />)}
                        </MenuList>
                    </div>
                </Popover>
            )}

            {/* 머리줄 칸 메뉴 */}
            {headMenu && (() => {
                const f = byKey.get(headMenu.key);
                if (!f) return null;
                const title = isTitle(f.key);
                const locked = title || f.locked === true;   // 기본 칸 — 지우기·타입 바꾸기 금지(이름표만 바꾼다)
                return (
                    <Popover anchor={headMenu.rect} width={220} onClose={() => setHeadMenu(null)}>
                        <MenuList autoFocus={false} label="칸 메뉴">
                            {fieldsEditable && (
                                <div data-rv-rename={f.key} className="mb-1">
                                    {/* 🔴 한글 조합 중 Enter 는 InlineRename 이 거른다 · 이름이 바뀌면 key 로 새로 세워 다시 고칠 수 있게 */}
                                    <InlineRename key={f.label} value={f.label} ariaLabel="칸 이름" onCancel={() => { /* 그대로 둔다 */ }}
                                        onCommit={(label) => { renameField(f.key, label); }}
                                        className="w-full h-row px-2 rounded border border-line bg-bg text-body text-text outline-none" />
                                </div>
                            )}
                            {fieldsEditable && (
                                <div className="flex items-center gap-2 h-row px-2 text-body text-text" data-rv-field-icon>
                                    <IconPicker icon={f.icon} onSetIcon={(ic) => setFieldIcon(f.key, ic)} sizeClass="text-body"
                                        fallback={<Icon name={fieldTypes.get(f.type)?.icon ?? 'help'} size={14} className="text-muted" />} />
                                    칸 아이콘
                                </div>
                            )}
                            <MenuItem label="오름차순 정렬" icon="sort" onSelect={() => setSortSingle(f.key, 'asc')} />
                            <MenuItem label="내림차순 정렬" icon="sort" onSelect={() => setSortSingle(f.key, 'desc')} />
                            {!title && <MenuItem label="칸 숨기기" icon="eyeOff" onSelect={() => { setColumn(f.key, { hidden: true }); setHeadMenu(null); }} />}
                            {(() => {
                                const idx = visibleFields.findIndex((x) => x.key === f.key);
                                const on = idx >= 0 && frozen === idx + 1;
                                return idx >= 0 && <MenuItem label={on ? '고정 풀기' : '여기까지 칸 고정'} icon="pin" onSelect={() => { patchView({ frozen: on ? 0 : idx + 1 }); setHeadMenu(null); }} />;
                            })()}
                            <MenuItem label={wrapOf(f.key) ? '줄바꿈 끄기' : '줄바꿈'} icon="text" onSelect={() => { setColumn(f.key, { wrap: !wrapOf(f.key) }); setHeadMenu(null); }} />
                            {fieldsEditable && !title && fieldTypes.get(f.type)?.hasOptions && (
                                <div data-rv-head-options={f.key}>
                                    <MenuSeparator />
                                    <div className="px-2 py-0.5 text-note text-muted">선택지</div>
                                    <OptionsEditor field={f} onOptionsChange={(o) => setOptions(f.key, o)} />
                                </div>
                            )}
                            {fieldsEditable && (
                                <>
                                    <MenuSeparator />
                                    <div className="px-2 py-0.5 text-note text-muted">타입{locked ? ` (${title ? '제목' : '기본'} 칸은 바꿀 수 없습니다)` : ''}</div>
                                    <div className="flex flex-wrap gap-1 px-1 pb-1">
                                        {fieldTypes.list().map((d) => (
                                            <Button key={d.type} size="sm" variant={f.type === d.type ? 'soft' : 'outline'} tone={f.type === d.type ? 'accent' : 'neutral'}
                                                icon={d.icon} data-rv-type={d.type} disabled={locked} onClick={() => requestRetype(f.key, d.type)}>{d.label}</Button>
                                        ))}
                                    </div>
                                    {(() => {
                                        const C = fieldTypes.get(f.type)?.Config;
                                        return C && <C field={f} fields={fields} onChange={(nf) => onFieldsChange?.(fields.map((x) => (x.key === nf.key ? nf : x)))} />;
                                    })()}
                                    {!f.locked && <MenuItem label={f.unique ? '유일 끄기' : '유일(같은 값 막기)'} icon={f.unique ? 'check' : 'key'} onSelect={() => toggleUnique(f.key)} />}
                                    {!locked && <MenuItem label="속성 삭제" icon="trash" danger onSelect={() => deleteField(f.key)} />}
                                </>
                            )}
                        </MenuList>
                    </Popover>
                );
            })()}

            {/* 계산 함수 고르기 */}
            {calcMenu && (() => {
                const f = byKey.get(calcMenu.key);
                if (!f) return null;
                return (
                    <Popover anchor={calcMenu.rect} width={180} onClose={() => setCalcMenu(null)}>
                        <MenuList autoFocus label="계산 함수" className="max-h-[320px] overflow-auto">
                            <MenuItem label="계산 안 함" onSelect={() => setCalc(f.key, null)} />
                            {calcFnsFor(f).map((c) => (
                                <MenuItem key={c.id} label={c.label} onSelect={() => setCalc(f.key, c.id)}>
                                    {view.calc?.[f.key] === c.id && <Icon name="check" size={13} className="text-accent shrink-0" />}
                                </MenuItem>
                            ))}
                        </MenuList>
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
                            <Select size="sm" data-rv-bulk-field value={bulk.key} onChange={(e) => setBulk({ ...bulk, key: e.target.value })}
                                options={visibleFields.filter((x) => canEditCell(x)).map((x) => ({ value: x.key, label: x.label }))} />
                            <div className="h-[32px] rounded border border-line" data-rv-bulk-cell>
                                <Cell key={f.key} field={f} rowValue={{}} editable
                                    onChange={(val) => { changeCells(liveSelected.map((id) => ({ id, key: f.key, value: val }))); setBulk(null); }} />
                            </div>
                            <div className="text-note text-muted">고른 {liveSelected.length}행에 같은 값이 들어갑니다.</div>
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
                            <div className="text-body text-text">
                                「{label}」 칸을 「{to}」로 바꾸면 <b>{pending.lost}행의 값이 {emptied === pending.lost ? '비워집니다' : '바뀌며 일부 내용이 사라집니다'}</b>.
                            </div>
                            <div className="text-small text-muted">되돌리기({keyLabel('Mod+Z')})로 되살릴 수 있습니다.</div>
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" data-rv-confirm-cancel onClick={() => setPending(null)}>취소</Button>
                                <Button variant="solid" tone="accent" data-rv-confirm-ok onClick={() => { const p = pending; setPending(null); applyConvert(p); }}>바꾸기</Button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}

/** 목록 설명 한 줄(검수 K1 · 노션 데이터베이스 설명) — 고칠 수 있으면 눌러서 고치고, 비었으면 머물 때만 「설명 추가」가 보인다.
 *   틀(Frame) 제목 밑에 두려면 화면이 이걸 subheader 로 넘기고 RecordView 엔 descriptionLine={false}. */
export function DescriptionLine({ text, onChange }: { text?: string; onChange?: (s: string) => void }) {
    const [editing, setEditing] = useState(false);
    const has = !!text?.trim();
    if (!has && !onChange) return null;
    if (editing && onChange) {
        return (
            <div className="pt-1 shrink-0" data-rv-desc-edit>
                <InlineRename value={text ?? ''} ariaLabel="목록 설명" placeholder="이 목록이 무엇을 담는지 한 줄"
                    onCommit={(v) => { setEditing(false); if (v.trim() !== (text ?? '').trim()) onChange(v); }}
                    onCancel={() => setEditing(false)} />
            </div>
        );
    }
    if (!onChange) return <p data-rv-desc className="text-small text-muted whitespace-pre-wrap shrink-0">{text}</p>;
    return (
        // oxlint-disable-next-line react/forbid-elements -- 글자 자체가 누름 자리(노션 설명 줄)
        <button type="button" data-rv-desc onClick={() => setEditing(true)}
            className={`-mx-1 px-1 rounded text-left text-small whitespace-pre-wrap shrink-0 hover:bg-text/[0.04] ${has ? 'text-muted' : 'text-muted/60 opacity-0 hover:opacity-100 focus-visible:opacity-100'}`}>
            {has ? text : '설명 추가'}
        </button>
    );
}
