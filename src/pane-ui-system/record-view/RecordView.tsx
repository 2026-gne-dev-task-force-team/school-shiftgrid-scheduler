/**
 * 레코드 뷰 — 노션 표 보기를 본뜬, 도메인을 모르는 목록 화면(제어형).
 *   쓰는 쪽은 「칸 정의 + 행 + 콜백」만 넘기고 목록 화면을 공짜로 얻는다(사람 명단·계정·달력…).
 *
 * 🔴 데이터는 바깥 소유(records) · 이 부품은 보기 상태(정렬·필터·검색·숨긴 칸·칸 폭)만 viewKey 로 보관한다.
 * 🔴 색·치수는 토큰 클래스 + 알약만. CSS 호버-숨김 클래스는 Row 조각 전용이라 안 쓴다(구조 검사 ③) — 행 호버는 React 상태로.
 * 🔑 보기 종류(kind)는 지금 'table' 하나지만, state.kind 로 갈라 둬 보드·달력·갤러리를 나중에 꽂을 자리를 열어 뒀다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Icon } from '../primitives/Icon';
import { IconButton } from '../primitives/IconButton';
import { Popover } from './Popover';
import { Cell } from './Cell';
import { Toolbar } from './Toolbar';
import { deriveRows } from './logic';
import { DEFAULT_COL_WIDTH, MIN_COL_WIDTH, loadState, saveState } from './view-state';
import type { FieldType, RecordField, RecordViewProps, RecordViewState, SortRule } from './types';

const SEL_W = 34;   // 선택 체크 칸 폭
const OPEN_W = 40;  // 「열기」 칸 폭

const TYPE_ICON: Record<FieldType, Parameters<typeof Icon>[0]['name']> = {
    text: 'text', number: 'hash', select: 'chevronDown', multi: 'layers', date: 'calendar', check: 'check',
};
const TYPE_LABEL: Record<FieldType, string> = {
    text: '글자', number: '숫자', select: '고르기', multi: '여러 개', date: '날짜', check: '체크',
};

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

export function RecordView<T>({
    fields,
    records,
    getId,
    viewKey,
    onCellChange,
    onAddRecord,
    onDeleteRecords,
    onOpenRecord,
    onFieldsChange,
    className = '',
}: RecordViewProps<T>) {
    const [state, setState] = useState<RecordViewState>(() => loadState(viewKey));
    // viewKey 가 바뀌면 그 키의 보기 상태를 새로 읽는다
    const keyRef = useRef(viewKey);
    useEffect(() => {
        if (keyRef.current !== viewKey) {
            keyRef.current = viewKey;
            setState(loadState(viewKey));
        }
    }, [viewKey]);
    // 상태가 바뀌면 보관
    useEffect(() => { saveState(viewKey, state); }, [viewKey, state]);

    const patch = useCallback((p: Partial<RecordViewState>) => setState((s) => ({ ...s, ...p })), []);

    const coarse = useCoarsePointer();
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [hoverRow, setHoverRow] = useState<string | null>(null);
    const [headMenu, setHeadMenu] = useState<{ key: string; rect: DOMRect } | null>(null);

    const visibleFields = useMemo(() => fields.filter((f) => !state.hidden.includes(f.key)), [fields, state.hidden]);
    const rows = useMemo(() => deriveRows(records, fields, state), [records, fields, state]);

    const widthOf = (f: RecordField) => state.widths[f.key] ?? f.width ?? DEFAULT_COL_WIDTH;
    const canEditCell = (f: RecordField) => !!onCellChange && !f.readOnly;

    // ── 선택 ──────────────────────────────────────────────────────────────────
    const selectable = !!onDeleteRecords;
    const rowIds = useMemo(() => rows.map((r) => getId(r)), [rows, getId]);
    const liveSelected = useMemo(() => rowIds.filter((id) => selected.has(id)), [rowIds, selected]);
    const allChecked = rowIds.length > 0 && liveSelected.length === rowIds.length;
    const toggleOne = (id: string) =>
        setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const toggleAll = () =>
        setSelected(() => (allChecked ? new Set() : new Set(rowIds)));
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
        const w = Math.max(MIN_COL_WIDTH, d.startW + (e.clientX - d.startX));
        setState((s) => ({ ...s, widths: { ...s.widths, [d.key]: w } }));
    };
    const onResizeUp = (e: ReactPointerEvent) => {
        if (drag.current) { try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* 이미 풀림 */ } }
        drag.current = null;
    };

    // ── 칸 구조(이름·타입·추가·삭제) — onFieldsChange 가 있을 때만 ──────────────
    const fieldsEditable = !!onFieldsChange;
    const setSortSingle = (key: string, dir: 'asc' | 'desc') => { patch({ sorts: [{ key, dir }] }); setHeadMenu(null); };
    const renameField = (key: string, label: string) =>
        onFieldsChange?.(fields.map((f) => (f.key === key ? { ...f, label } : f)));
    const retypeField = (key: string, type: FieldType) =>
        onFieldsChange?.(fields.map((f) => (f.key === key ? { ...f, type } : f)));
    const deleteField = (key: string) => {
        onFieldsChange?.(fields.filter((f) => f.key !== key));
        patch({
            hidden: state.hidden.filter((k) => k !== key),
            sorts: state.sorts.filter((s) => s.key !== key),
            filters: state.filters.filter((r) => r.key !== key),
        });
        setHeadMenu(null);
    };
    const addFieldSeq = useRef(0);
    const addField = () => {
        const key = `col_${Date.now()}_${addFieldSeq.current++}`;
        onFieldsChange?.([...fields, { key, label: '새 칸', type: 'text' }]);
    };

    const sortDirOf = (key: string): SortRule['dir'] | null => state.sorts.find((s) => s.key === key)?.dir ?? null;

    const totalWidth = SEL_W * (selectable ? 1 : 0) + visibleFields.reduce((a, f) => a + widthOf(f), 0) + (onOpenRecord ? OPEN_W : 0) + (fieldsEditable ? 40 : 0);

    return (
        <div className={`flex flex-col h-full min-h-0 bg-bg ${className}`} data-rv-root>
            <Toolbar
                fields={fields}
                search={state.search}
                filters={state.filters}
                sorts={state.sorts}
                hidden={state.hidden}
                onSearch={(q) => patch({ search: q })}
                onFilters={(f) => patch({ filters: f })}
                onSorts={(s) => patch({ sorts: s })}
                onHidden={(h) => patch({ hidden: h })}
            />

            {/* 선택 막대 */}
            {selectable && liveSelected.length > 0 && (
                <div className="flex items-center gap-2 px-2 py-1 border-b border-line bg-panel2 shrink-0" data-rv-selbar>
                    <span className="text-[12px] text-text">{liveSelected.length}개 선택</span>
                    <button type="button" data-rv-delete onClick={deleteSelected} className="h-row px-2 rounded text-[12px] text-bad hover:bg-bad/10 inline-flex items-center gap-1">
                        <Icon name="trash" size={13} />삭제
                    </button>
                    <button type="button" onClick={() => setSelected(new Set())} className="h-row px-2 rounded text-[12px] text-muted hover:text-text">해제</button>
                </div>
            )}

            {/* 표 — 가로·세로 스크롤은 이 칸이 쥔다(좁은 화면은 가로 스크롤) */}
            <div className="flex-1 min-h-0 overflow-auto">
                <div style={{ minWidth: totalWidth }} className="text-text">
                    {/* 머리줄 */}
                    <div className="flex sticky top-0 z-10 bg-panel2 border-b border-line select-none h-header">
                        {selectable && (
                            <div className="shrink-0 grid place-items-center" style={{ width: SEL_W }}>
                                <button type="button" role="checkbox" aria-checked={allChecked} data-rv-check-all onClick={toggleAll}
                                    className={`grid place-items-center w-4 h-4 rounded-[3px] border ${allChecked ? 'bg-accent border-accent text-bg' : 'border-line'}`}>
                                    {allChecked && <Icon name="check" size={12} />}
                                </button>
                            </div>
                        )}
                        {visibleFields.map((f) => {
                            const dir = sortDirOf(f.key);
                            return (
                                <div key={f.key} className="relative shrink-0 flex items-center gap-1 px-2 border-r border-line" style={{ width: widthOf(f) }} data-rv-head={f.key}>
                                    <Icon name={TYPE_ICON[f.type]} size={13} className="text-muted shrink-0" />
                                    <span className="flex-1 min-w-0 truncate text-[12px] font-medium">{f.label}</span>
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
                        {onOpenRecord && <div className="shrink-0" style={{ width: OPEN_W }} />}
                        {fieldsEditable && (
                            <button type="button" data-rv-add-field onClick={addField} className="shrink-0 grid place-items-center text-muted hover:text-text hover:bg-text/[0.06]" style={{ width: 40 }} aria-label="칸 추가">
                                <Icon name="plus" size={15} />
                            </button>
                        )}
                    </div>

                    {/* 본문 */}
                    {rows.map((r) => {
                        const id = getId(r);
                        const checked = selected.has(id);
                        const showOpen = onOpenRecord && (coarse || hoverRow === id);
                        return (
                            <div
                                key={id}
                                data-rv-row={id}
                                onMouseEnter={() => setHoverRow(id)}
                                onMouseLeave={() => setHoverRow((h) => (h === id ? null : h))}
                                className={`flex border-b border-line min-h-[32px] ${checked ? 'bg-accent/[0.06]' : 'hover:bg-text/[0.02]'}`}
                            >
                                {selectable && (
                                    <div className="shrink-0 grid place-items-center" style={{ width: SEL_W }}>
                                        <button type="button" role="checkbox" aria-checked={checked} data-rv-check={id} onClick={() => toggleOne(id)}
                                            className={`grid place-items-center w-4 h-4 rounded-[3px] border ${checked ? 'bg-accent border-accent text-bg' : 'border-line'}`}>
                                            {checked && <Icon name="check" size={12} />}
                                        </button>
                                    </div>
                                )}
                                {visibleFields.map((f) => (
                                    <div key={f.key} className="shrink-0 border-r border-line overflow-hidden" style={{ width: widthOf(f) }}>
                                        <Cell
                                            field={f}
                                            rowValue={r}
                                            editable={canEditCell(f)}
                                            onChange={(val) => onCellChange?.(id, f.key, val)}
                                        />
                                    </div>
                                ))}
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
                        <div className="px-3 py-6 text-[13px] text-muted select-none" data-rv-empty>표시할 행이 없습니다.</div>
                    )}

                    {/* + 새로 만들기 */}
                    {onAddRecord && (
                        <button type="button" data-rv-add onClick={onAddRecord}
                            className="flex items-center gap-1.5 w-full h-row px-3 text-[13px] text-muted hover:text-text hover:bg-text/[0.04] select-none sticky left-0">
                            <Icon name="plus" size={14} />새로 만들기
                        </button>
                    )}
                </div>
            </div>

            {/* 머리줄 칸 메뉴 */}
            {headMenu && (() => {
                const f = fields.find((x) => x.key === headMenu.key);
                if (!f) return null;
                return (
                    <Popover anchor={headMenu.rect} width={220} onClose={() => setHeadMenu(null)}>
                        <div className="flex flex-col gap-0.5">
                            {fieldsEditable && (
                                <input
                                    data-rv-rename={f.key}
                                    defaultValue={f.label}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { renameField(f.key, (e.target as HTMLInputElement).value); setHeadMenu(null); } }}
                                    onBlur={(e) => renameField(f.key, e.target.value)}
                                    className="h-row px-2 mb-1 rounded border border-line bg-bg text-[13px] text-text outline-none"
                                />
                            )}
                            <button type="button" data-rv-sort-asc onClick={() => setSortSingle(f.key, 'asc')} className="flex items-center gap-2 h-row px-2 rounded text-[13px] text-text hover:bg-text/[0.06] text-left">
                                <Icon name="sort" size={14} className="rotate-180" />오름차순 정렬
                            </button>
                            <button type="button" data-rv-sort-desc onClick={() => setSortSingle(f.key, 'desc')} className="flex items-center gap-2 h-row px-2 rounded text-[13px] text-text hover:bg-text/[0.06] text-left">
                                <Icon name="sort" size={14} />내림차순 정렬
                            </button>
                            <button type="button" onClick={() => { patch({ hidden: [...state.hidden, f.key] }); setHeadMenu(null); }} className="flex items-center gap-2 h-row px-2 rounded text-[13px] text-text hover:bg-text/[0.06] text-left">
                                <Icon name="eyeOff" size={14} />칸 숨기기
                            </button>
                            {fieldsEditable && (
                                <>
                                    <div className="my-1 h-px bg-line" />
                                    <div className="px-2 py-0.5 text-[11px] text-muted">타입</div>
                                    <div className="flex flex-wrap gap-1 px-1 pb-1">
                                        {(Object.keys(TYPE_LABEL) as FieldType[]).map((t) => (
                                            <button key={t} type="button" data-rv-type={t} onClick={() => { retypeField(f.key, t); }}
                                                className={`inline-flex items-center gap-1 h-row px-1.5 rounded border text-[12px] ${f.type === t ? 'border-accent text-text' : 'border-line text-muted hover:text-text'}`}>
                                                <Icon name={TYPE_ICON[t]} size={12} />{TYPE_LABEL[t]}
                                            </button>
                                        ))}
                                    </div>
                                    <button type="button" data-rv-del-field onClick={() => deleteField(f.key)} className="flex items-center gap-2 h-row px-2 rounded text-[13px] text-bad hover:bg-bad/10 text-left">
                                        <Icon name="trash" size={14} />칸 삭제
                                    </button>
                                </>
                            )}
                        </div>
                    </Popover>
                );
            })()}
        </div>
    );
}
