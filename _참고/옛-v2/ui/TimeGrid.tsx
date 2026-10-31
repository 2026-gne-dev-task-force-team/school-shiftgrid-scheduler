/**
 * 시간표 격자 — 엑셀처럼. gne-sheet 의 격자꼴 `Grid` 는 머리 편집·오른쪽 클릭 메뉴를 못 받는다
 * (`dist/grid/types.d.ts` 에 그런 자리가 없다 — 이 PC 엔 소스가 없어 부품 자체를 못 고친다).
 * 그래서 `useSheetCore` 로 선택·키보드·편집·복붙·채우기만 빌리고, 머리·표·메뉴는 이 파일이 그린다
 * (설계 [[시간표 짜기 v2 설계]] 「부품 — gne-sheet 를 쓴다」의 ⚠️ 갈래).
 *
 * 🔴 「교시」 낱말은 여기서도 안 쓴다 — 「줄」·「열」이다.
 * 🔴 쉬는 시간(gapAfter)은 행이 아니라 행 사이의 얇은 틈으로 그린다.
 * 🔴 행 경계를 끌면 그 줄의 분(minutes)이 바뀐다 — 뒤 줄 시각은 파생값이라 저절로 밀린다.
 */
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSheetCore, type SheetCoreAdapter } from 'gne-sheet';
import { useV2 } from '../store';
import { cellTextOf } from '../model';
import { rowDisplayLabel, rowTimes } from '../rows';

const PX_PER_MIN = 1.1;
const MIN_ROW_MINUTES = 5;
const MIN_COL_WIDTH = 76;

type MenuState =
    | { kind: 'row'; rowKey: string; x: number; y: number; form: boolean }
    | { kind: 'col'; colKey: string; x: number; y: number };

type RenameState = { kind: 'row' | 'col'; key: string; draft: string };

export function TimeGrid({ sheetId, narrow = false }: { sheetId: string; narrow?: boolean }) {
    const st = useV2();
    const sheet = st.getSheet(sheetId);
    const [menu, setMenu] = useState<MenuState | null>(null);
    const [renaming, setRenaming] = useState<RenameState | null>(null);
    const [resize, setResize] = useState<{ rowKey: string; delta: number } | null>(null);

    const rows = sheet?.rows ?? [];
    const cols = sheet?.cols ?? [];
    // 🔴 메모 안 한다 — rows 는 sheet 가 없을 때 매 렌더 새 빈 배열이라 의존성 경고가 난다.
    //    줄이 몇십 개뿐이라 매 렌더 다시 구해도 비용이 없다(괜히 useRef 로 숨기지 않는다).
    const times = rowTimes(sheet?.startTime ?? '09:00', rows);

    const getText = useCallback(
        (colKey: string, rowKey: string) => cellTextOf(sheet?.cells[`${colKey}:${rowKey}`]),
        [sheet],
    );

    const adapter: SheetCoreAdapter = {
        rowCount: rows.length,
        dataRowCount: rows.length,
        colCount: cols.length,
        getText: (r, c) => (cols[c] && rows[r] ? getText(cols[c].key, rows[r].key) : ''),
        editable: (r, c) => !!rows[r]?.assignable && !!cols[c],
        cellKind: (r) => (rows[r]?.assignable ? 'edit' : 'readonly'),
        editInitial: (r, c, typed) => (typed != null ? typed : (cols[c] && rows[r] ? getText(cols[c].key, rows[r].key) : '')),
        commit: (changes) => {
            if (!sheet) return;
            const out = changes
                .filter((ch) => rows[ch.r]?.assignable && cols[ch.c])
                .map((ch) => ({ colKey: cols[ch.c].key, rowKey: rows[ch.r].key, text: ch.text }));
            if (out.length) st.setCells(sheetId, out);
        },
        onUndo: st.undo,
        onRedo: st.redo,
    };
    const core = useSheetCore(adapter);
    const closeMenu = useCallback(() => setMenu(null), []);

    if (!sheet) return null;

    const heightOfRow = (i: number) => {
        const r = rows[i];
        const extra = resize && resize.rowKey === r.key ? resize.delta : 0;
        return Math.max(MIN_ROW_MINUTES, r.minutes + extra) * PX_PER_MIN;
    };

    const beginRenameRow = (rowKey: string, current: string) => setRenaming({ kind: 'row', key: rowKey, draft: current });
    const beginRenameCol = (colKey: string, current: string) => setRenaming({ kind: 'col', key: colKey, draft: current });
    const commitRename = () => {
        if (!renaming) return;
        if (renaming.kind === 'row') st.setRowLabel(sheetId, renaming.key, renaming.draft);
        else st.setColLabel(sheetId, renaming.key, renaming.draft);
        setRenaming(null);
    };

    return (
        <div
            ref={core.containerRef}
            tabIndex={0}
            onFocus={core.onFocus}
            onBlur={core.onBlur}
            className="inline-block focus:outline-none select-none"
        >
            <table className="border-collapse text-[12px]">
                <thead>
                    <tr>
                        <th className="sticky left-0 z-10 bg-panel2 border border-line px-2 py-1 min-w-[56px]" />
                        {cols.map((col) => (
                            <th key={col.key}
                                data-testid="col-head" data-col-key={col.key}
                                className="relative bg-panel2 border border-line px-3 py-1 text-text font-semibold text-left"
                                style={{ minWidth: MIN_COL_WIDTH }}
                                onContextMenu={(e) => { e.preventDefault(); setMenu({ kind: 'col', colKey: col.key, x: e.clientX, y: e.clientY }); }}
                                onDoubleClick={() => beginRenameCol(col.key, col.label)}
                            >
                                {renaming?.kind === 'col' && renaming.key === col.key ? (
                                    <RenameInput value={renaming.draft} onChange={(v) => setRenaming({ ...renaming, draft: v })}
                                        onCommit={commitRename} onCancel={() => setRenaming(null)} />
                                ) : col.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, ri) => {
                        const label = rowDisplayLabel(rows, ri);
                        const t = times[ri];
                        const h = heightOfRow(ri);
                        const cellH = { height: `${h}px` };
                        return (
                            <Fragment key={row.key}>
                                <tr>
                                    <th
                                        data-testid="row-head" data-row-key={row.key}
                                        className={`sticky left-0 z-10 relative border border-line px-2 py-1 text-right align-top
                                            ${row.assignable ? 'bg-panel2 text-text' : 'bg-panel2/60 text-muted'}`}
                                        style={cellH}
                                        onContextMenu={(e) => { e.preventDefault(); setMenu({ kind: 'row', rowKey: row.key, x: e.clientX, y: e.clientY, form: false }); }}
                                        onDoubleClick={() => beginRenameRow(row.key, label)}
                                    >
                                        {renaming?.kind === 'row' && renaming.key === row.key ? (
                                            <RenameInput value={renaming.draft} onChange={(v) => setRenaming({ ...renaming, draft: v })}
                                                onCommit={commitRename} onCancel={() => setRenaming(null)} />
                                        ) : (
                                            <>
                                                <div className="leading-tight">{label}</div>
                                                {t && <div className="text-[9.5px] text-muted font-normal tabular-nums leading-tight">{t.start}~{t.end}</div>}
                                            </>
                                        )}
                                        <RowResizeHandle
                                            sheetId={sheetId} rowKey={row.key} minutes={row.minutes}
                                            onPreview={(delta) => setResize({ rowKey: row.key, delta })}
                                            onEnd={() => setResize(null)}
                                        />
                                    </th>
                                    {cols.map((col, ci) => {
                                        if (!row.assignable) {
                                            return (
                                                <td key={col.key} className="border border-line bg-panel2/40 text-muted/60 text-center px-2 py-1" style={cellH}>·</td>
                                            );
                                        }
                                        const isEditing = core.edit?.r === ri && core.edit?.c === ci;
                                        const isSel = core.inSel(ri, ci);
                                        const isActive = core.active.r === ri && core.active.c === ci;
                                        const text = getText(col.key, row.key);
                                        return (
                                            <td key={col.key} className="border border-line p-0 align-top">
                                                {isEditing ? (
                                                    <CellEditor
                                                        text={core.edit?.text ?? ''}
                                                        touch={narrow}
                                                        height={h}
                                                        onChange={core.setEditText}
                                                        onCommit={core.commitEdit}
                                                        onCancel={core.cancelEdit}
                                                    />
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onMouseDown={(e) => core.beginDrag(ri, ci, { button: e.button, shiftKey: e.shiftKey })}
                                                        onMouseEnter={() => core.onCellEnter(ri, ci)}
                                                        onDoubleClick={() => core.beginEdit(ri, ci)}
                                                        onPointerUp={(e) => { if (e.pointerType !== 'mouse') core.handle.beginEditAt(ri, ci); }}
                                                        style={cellH}
                                                        className={`w-full min-w-[76px] px-2 text-left align-top whitespace-pre-wrap break-words leading-tight overflow-hidden
                                                            ${isActive ? 'outline outline-2 -outline-offset-2 outline-accent bg-accent/5' : isSel ? 'bg-accent/10' : 'hover:bg-panel2/50'}`}
                                                    >
                                                        {text}
                                                    </button>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                                {row.gapAfter > 0 && (
                                    <tr aria-hidden="true" data-testid="gap-row">
                                        <td colSpan={cols.length + 1} className="bg-bg border-x border-line p-0"
                                            style={{ height: `${row.gapAfter * PX_PER_MIN}px` }} />
                                    </tr>
                                )}
                            </Fragment>
                        );
                    })}
                </tbody>
            </table>

            {menu?.kind === 'row' && (
                <RowMenu sheetId={sheetId} menu={menu} rows={rows} onClose={closeMenu} onForm={(form) => setMenu({ ...menu, form })} />
            )}
            {menu?.kind === 'col' && <ColMenu sheetId={sheetId} menu={menu} onClose={closeMenu} />}
        </div>
    );
}

/** 글자 편집 입력칸 — 🔴 useLayoutEffect 로 포커스를 flushSync 안에서 동기로 건다
 *  (useEffect 를 쓰면 전역 keydown 캡처 뒤 포커스 이동이 한 틱 늦어 첫 글자가 비는 경우가 있다). */
function CellEditor({
    text, touch, height, onChange, onCommit, onCancel,
}: { text: string; touch: boolean; height: number; onChange: (v: string) => void; onCommit: (dr: number, dc: number) => void; onCancel: () => void }) {
    const ref = useRef<HTMLInputElement | null>(null);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
        if (touch) el.scrollIntoView({ block: 'center', inline: 'center' });
    }, [touch]);
    return (
        <input
            ref={ref}
            value={text}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === 'Enter') { e.preventDefault(); onCommit(1, 0); }
                else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
                else if (e.key === 'Tab') { e.preventDefault(); onCommit(0, e.shiftKey ? -1 : 1); }
            }}
            onBlur={() => onCommit(0, 0)}
            style={{ height: `${height}px` }}
            className={`w-full min-w-[76px] px-2 bg-panel text-text outline outline-2 outline-accent ${touch ? 'text-[16px]' : 'text-[12px]'}`}
        />
    );
}

/** 라벨(이름) 고치기 — 행/열 머리 더블클릭으로 연다 */
function RenameInput({ value, onChange, onCommit, onCancel }: { value: string; onChange: (v: string) => void; onCommit: () => void; onCancel: () => void }) {
    const ref = useRef<HTMLInputElement | null>(null);
    useLayoutEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
    return (
        <input
            ref={ref}
            value={value}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); onCommit(); }
                else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
            }}
            onBlur={onCommit}
            className="w-full px-1 py-0.5 bg-panel text-text border border-accent rounded text-[12px]"
        />
    );
}

/** 행 경계 끌기 — pointer 이벤트라 마우스·손가락·펜이 같은 코드로 돈다(모듈 1.2 와 같은 결).
 *  끄는 동안은 미리보기만(로컬 상태) · 떼면 그때 한 번만 store 에 커밋(undo 한 단위를 안 어지럽힌다). */
function RowResizeHandle({
    sheetId, rowKey, minutes, onPreview, onEnd,
}: { sheetId: string; rowKey: string; minutes: number; onPreview: (delta: number) => void; onEnd: () => void }) {
    const st = useV2();
    const start = useRef<number | null>(null);
    const lastDelta = useRef(0);

    const onDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault(); e.stopPropagation();
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* 무시 */ }
        start.current = e.clientY;
        lastDelta.current = 0;
    }, []);
    const onMove = useCallback((e: React.PointerEvent) => {
        if (start.current == null) return;
        const dyPx = e.clientY - start.current;
        const dyMin = dyPx / PX_PER_MIN;
        const snapped = Math.round(dyMin / 5) * 5;
        if (snapped !== lastDelta.current && minutes + snapped >= MIN_ROW_MINUTES) {
            lastDelta.current = snapped;
            onPreview(snapped);
        }
    }, [minutes, onPreview]);
    const onUp = useCallback((e: React.PointerEvent) => {
        e.stopPropagation();
        if (start.current != null && lastDelta.current !== 0) st.resizeRow(sheetId, rowKey, lastDelta.current);
        start.current = null;
        onEnd();
    }, [sheetId, rowKey, st, onEnd]);

    return (
        <span
            data-testid="row-resize" data-row-key={rowKey}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            title="끌어서 시간 조절"
            className="absolute left-0 right-0 bottom-0 h-2 cursor-row-resize touch-none z-10 hover:bg-accent/40"
        />
    );
}

/** 바깥 눌림에 닫히는 작은 메뉴 — Workbench 의 OverflowMenu 와 같은 결(다음 틱부터 듣는다) */
function useOutsideClose(onClose: () => void) {
    const ref = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        const h = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
        const t = setTimeout(() => document.addEventListener('pointerdown', h), 0);
        return () => { clearTimeout(t); document.removeEventListener('pointerdown', h); };
    }, [onClose]);
    return ref;
}

const menuItemCls = 'w-full text-left px-3 py-2 text-[12.5px] text-text hover:bg-panel2 whitespace-nowrap';

function RowMenu({
    sheetId, menu, rows, onClose, onForm,
}: { sheetId: string; menu: Extract<MenuState, { kind: 'row' }>; rows: { key: string; assignable: boolean; minutes: number; gapAfter: number }[]; onClose: () => void; onForm: (form: boolean) => void }) {
    const st = useV2();
    const ref = useOutsideClose(onClose);
    const row = rows.find((r) => r.key === menu.rowKey);
    const [minutes, setMinutes] = useState(row?.minutes ?? 40);
    const [gapAfter, setGapAfter] = useState(row?.gapAfter ?? 0);

    return (
        <div ref={ref} data-testid="row-menu" className="fixed z-[170] w-48 rounded-md border border-line bg-panel shadow-xl py-1"
            style={{ left: menu.x, top: menu.y }}>
            {!menu.form ? (
                <>
                    <button className={menuItemCls} onClick={() => { st.insertRowAbove(sheetId, menu.rowKey); onClose(); }}>위에 줄 넣기</button>
                    <button className={menuItemCls} onClick={() => { st.insertRowBelow(sheetId, menu.rowKey); onClose(); }}>아래 줄 넣기</button>
                    <button className={menuItemCls} onClick={() => { st.removeRow(sheetId, menu.rowKey); onClose(); }}>줄 빼기</button>
                    <div className="h-px bg-line my-1" />
                    <button className={menuItemCls} onClick={() => { st.toggleRowAssignable(sheetId, menu.rowKey); onClose(); }}>
                        {row?.assignable ? '수업 없는 줄로' : '수업 넣는 줄로'}
                    </button>
                    <button className={menuItemCls} onClick={() => onForm(true)}>시간 고치기…</button>
                </>
            ) : (
                <div className="px-3 py-2 space-y-2">
                    <label className="block text-[11.5px] text-muted">
                        분
                        <input type="number" min={5} max={480} value={minutes}
                            onChange={(e) => setMinutes(Number(e.target.value) || 5)}
                            className="mt-0.5 w-full px-1.5 py-1 bg-panel text-text border border-line rounded text-[12.5px]" />
                    </label>
                    <label className="block text-[11.5px] text-muted">
                        뒤 쉬는 시간(분)
                        <input type="number" min={0} max={240} value={gapAfter}
                            onChange={(e) => setGapAfter(Number(e.target.value) || 0)}
                            className="mt-0.5 w-full px-1.5 py-1 bg-panel text-text border border-line rounded text-[12.5px]" />
                    </label>
                    <button
                        className="w-full px-2 py-1.5 rounded bg-accent hover:bg-accenth text-white text-[12.5px] font-medium"
                        onClick={() => { st.setRowTime(sheetId, menu.rowKey, { minutes, gapAfter }); onClose(); }}
                    >
                        적용
                    </button>
                </div>
            )}
        </div>
    );
}

function ColMenu({ sheetId, menu, onClose }: { sheetId: string; menu: Extract<MenuState, { kind: 'col' }>; onClose: () => void }) {
    const st = useV2();
    const ref = useOutsideClose(onClose);
    return (
        <div ref={ref} data-testid="col-menu" className="fixed z-[170] w-44 rounded-md border border-line bg-panel shadow-xl py-1"
            style={{ left: menu.x, top: menu.y }}>
            <button className={menuItemCls} onClick={() => { st.insertColLeft(sheetId, menu.colKey); onClose(); }}>왼쪽에 열 넣기</button>
            <button className={menuItemCls} onClick={() => { st.insertColRight(sheetId, menu.colKey); onClose(); }}>오른쪽에 열 넣기</button>
            <button className={menuItemCls} onClick={() => { st.removeCol(sheetId, menu.colKey); onClose(); }}>열 빼기</button>
        </div>
    );
}

