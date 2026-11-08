/**
 * 시간표 그리드 화면 — 시간표 한 장(또는 특별 시간표)을 그리고 손으로 고친다(명세 1·2·3단계).
 *   🔴 데이터는 노드 다리(nodes.ts)에서만 — 시간표도 특별도 노드고 저장·휴지통은 노드 시스템이 쥔다.
 *   표는 직접 안 그린다 — 「표 자리」(grid-slot)를 거친다. 나중에 표 편집기 플러그인이 오면 그 파일만 바뀐다.
 *   손 편집은 전부 model.ts 순수 함수로 돌린 뒤 저장(applyEdit) · 특별 적용·일정은 schedule.ts.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Icon } from '../../../pane-ui-system';
import { useActiveSheet, setActiveSheet } from '../store';
import {
    subscribeNodes, getSheetNodes, getSpecialNodes, dataOf, typeOf, applyEdit, applySpecialMeta,
    createSpecial, duplicateSheet, specialsOf, parentSheetOf, getNodesApi,
} from '../nodes';
import {
    columnCount, rowCount, colName, getCell, isCovered, canMerge, mergeCells, unmergeCells,
    addRow, removeRow, addColumn, removeColumn, renameRow, renameColumn, setRowTime, setCellText,
    toggleColumnKind, toggleRangeKind, setRangeSpec,
} from '../model';
import { SimpleGrid, type GridColumn, type GridRowHead, type GridCellView, type GridSelection } from './grid-slot';

export function GridTab() {
    const activeId = useActiveSheet();
    // 노드가 바뀔 때만 다시 그린다(둘 다 같은 recompute 로 갱신 — 편집도 여기로 전파된다).
    const sheetNodes = useSyncExternalStore(subscribeNodes, getSheetNodes, getSheetNodes);
    const specialNodes = useSyncExternalStore(subscribeNodes, getSpecialNodes, getSpecialNodes);

    const [sel, setSel] = useState<GridSelection | null>(null);
    const [rowTimeEdit, setRowTimeEdit] = useState(true);   // 🔴 2단계: 행 시각 일괄 편집이 기본 켬(명세)
    useEffect(() => { setSel(null); }, [activeId]);

    const kind = activeId ? typeOf(activeId) : null;
    const data = useMemo(
        () => (activeId && kind ? dataOf(activeId) : null),
        // dataOf 는 api 스냅샷을 읽는다 — sheetNodes·specialNodes 가 바뀌면 다시 읽는다.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [activeId, kind, sheetNodes, specialNodes],
    );

    if (!activeId || !kind || !data) {
        return (
            <div className="h-full flex items-center justify-center p-6 text-center text-muted select-none">
                왼쪽 탐색기에서 시간표를 열면 여기에 표가 뜬다. (새로 만들면 월~금 × 6행 빈 표)
            </div>
        );
    }

    const nCols = columnCount(data.columns);
    const nRows = rowCount(data);
    const node = getNodesApi()?.get(activeId);

    const columns: GridColumn[] = Array.from({ length: nCols }, (_, c) => ({ key: `c${c}`, title: colName(data, c) }));
    const rows: GridRowHead[] = data.rows.map((r) => ({ key: r.id, title: r.name, start: r.range.start, end: r.range.end }));

    function cellView(col: number, row: number): GridCellView | null {
        if (!data) return null;
        if (isCovered(data, col, row)) return null;
        const c = getCell(data, col, row);
        const rowSpan = c?.rowSpan ?? 1;
        const colSpan = c?.colSpan ?? 1;
        return { text: c?.text ?? '', rowSpan, colSpan, merged: rowSpan > 1 || colSpan > 1 };
    }

    const edit = (fn: Parameters<typeof applyEdit>[1]) => applyEdit(activeId, fn);

    // ── 병합/해제 가능 여부 ──
    const mergeOk = !!sel && canMerge(data, sel).ok;
    const anchorAt = sel && sel.col0 === sel.col1 && sel.row0 === sel.row1 ? getCell(data, sel.col0, sel.row0) : undefined;
    const unmergeOk = !!anchorAt && ((anchorAt.rowSpan ?? 1) > 1 || (anchorAt.colSpan ?? 1) > 1);

    // 선택된 행/열(없으면 끝) — 삭제 대상.
    const selRow = sel ? Math.min(sel.row0, sel.row1) : nRows - 1;
    const selCol = sel ? Math.min(sel.col0, sel.col1) : nCols - 1;

    const btn = 'flex items-center gap-1 h-btn px-2 rounded border border-line text-[12px] text-muted hover:text-text hover:bg-text/[0.04] disabled:opacity-40 disabled:hover:bg-transparent';

    return (
        <div className="h-full flex flex-col overflow-hidden select-none">
            {/* 머리줄 — 이름 + 종류 */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-line shrink-0">
                <Icon name={kind === 'special' ? 'sparkles' : 'table'} size={15} className="text-muted" />
                <span className="font-medium text-text truncate">{node?.name ?? '시간표'}</span>
                {kind === 'special' && <span className="text-[11px] text-accent">특별 시간표</span>}
                {kind === 'special' && (
                    <button type="button" className={btn} onClick={() => { const p = parentSheetOf(activeId); if (p) getNodesApi()?.open(p); }}>
                        <Icon name="left" size={12} /> 기본 시간표로
                    </button>
                )}
            </div>

            {/* 툴바 — 손 편집(1단계) + 행 시각(2단계) */}
            <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-line shrink-0">
                <button type="button" className={btn} onClick={() => { edit((d) => addRow(d)); }}><Icon name="plus" size={12} /> 행</button>
                <button type="button" className={btn} disabled={nRows <= 1} onClick={() => { edit((d) => removeRow(d, selRow)); setSel(null); }}><Icon name="trash" size={12} /> 행</button>
                <button type="button" className={btn} onClick={() => { edit((d) => addColumn(d)); }}><Icon name="plus" size={12} /> 열</button>
                <button type="button" className={btn} disabled={nCols <= 1} onClick={() => { edit((d) => removeColumn(d, selCol)); setSel(null); }}><Icon name="trash" size={12} /> 열</button>
                <span className="w-px h-4 bg-line mx-1" />
                <button type="button" className={btn} disabled={!mergeOk} onClick={() => { if (sel) { edit((d) => mergeCells(d, sel)); } }}><Icon name="layers" size={12} /> 병합</button>
                <button type="button" className={btn} disabled={!unmergeOk} onClick={() => { if (sel) { edit((d) => unmergeCells(d, sel.col0, sel.row0)); } }}><Icon name="x" size={12} /> 병합 해제</button>
                <span className="w-px h-4 bg-line mx-1" />
                <button type="button" className={btn} onClick={() => { edit((d) => toggleColumnKind(d)); setSel(null); }}>
                    열 꼴: {data.columns.kind === 'weekday' ? '요일' : '일차'}
                </button>
                <button type="button" className={`${btn} ${rowTimeEdit ? 'text-accent' : ''}`} onClick={() => setRowTimeEdit((v) => !v)}>
                    <Icon name="layers" size={12} /> 행 시각 {rowTimeEdit ? '켬' : '끔'}
                </button>
                {kind === 'sheet' && (
                    <button type="button" className={btn} onClick={() => { duplicateSheet(activeId); }}><Icon name="copy" size={12} /> 표 복사</button>
                )}
            </div>

            {/* 범위 설정 줄 */}
            <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 border-b border-line shrink-0 text-[12px] text-muted">
                <span>범위</span>
                <button type="button" className={btn} onClick={() => { edit((d) => toggleRangeKind(d)); }}>
                    {data.range.kind === 'period' ? '기간' : 'N회'}
                </button>
                {data.range.kind === 'period' ? (
                    <>
                        <input type="date" value={data.range.start}
                            onChange={(e) => { const end = data.range.kind === 'period' ? data.range.end : ''; edit((d) => setRangeSpec(d, { kind: 'period', start: e.target.value, end })); }}
                            className="bg-bg border border-line rounded px-1 py-0.5 text-text outline-none focus:border-accent" />
                        <span>~</span>
                        <input type="date" value={data.range.end}
                            onChange={(e) => { const start = data.range.kind === 'period' ? data.range.start : ''; edit((d) => setRangeSpec(d, { kind: 'period', start, end: e.target.value })); }}
                            className="bg-bg border border-line rounded px-1 py-0.5 text-text outline-none focus:border-accent" />
                    </>
                ) : (
                    <input type="number" min={1} value={data.range.count}
                        onChange={(e) => { const n = Math.max(1, Number(e.target.value) || 1); edit((d) => setRangeSpec(d, { kind: 'repeat', count: n })); }}
                        className="w-16 bg-bg border border-line rounded px-1 py-0.5 text-text outline-none focus:border-accent" />
                )}
            </div>

            {/* 표 자리 */}
            <div className="flex-1 overflow-auto">
                <SimpleGrid
                    columns={columns}
                    rows={rows}
                    cell={cellView}
                    onCellChange={(c, r, text) => edit((d) => setCellText(d, c, r, text))}
                    onRenameColumn={(c, title) => edit((d) => renameColumn(d, c, title))}
                    onRenameRow={(r, title) => edit((d) => renameRow(d, r, title))}
                    onRowTime={(r, start, end) => edit((d) => setRowTime(d, r, start, end))}
                    selection={sel}
                    onSelect={(c, r, extend) => setSel((prev) => (extend && prev ? { ...prev, col1: c, row1: r } : { col0: c, row0: r, col1: c, row1: r }))}
                    rowTimeEdit={rowTimeEdit}
                    emptyHint="빈 표 — 행·열을 더해 쓴다"
                />
            </div>

            {/* 특별 시간표 패널(시간표일 때만) */}
            {kind === 'sheet' && <SpecialPanel sheetId={activeId} />}
        </div>
    );
}

/** 특별 시간표 패널 — 이 시간표 밑 특별들을 보여 주고, 모드·우선순위를 매기고, 새로 만든다. */
function SpecialPanel({ sheetId }: { sheetId: string }) {
    useSyncExternalStore(subscribeNodes, getSpecialNodes, getSpecialNodes);   // 특별 변경 때 다시 그림
    const specials = specialsOf(sheetId);
    const btn = 'flex items-center gap-1 h-btn px-2 rounded border border-line text-[12px] text-muted hover:text-text hover:bg-text/[0.04]';

    return (
        <div className="border-t border-line px-3 py-2 shrink-0 max-h-48 overflow-auto">
            <div className="flex items-center gap-2 mb-1.5">
                <Icon name="sparkles" size={13} className="text-muted" />
                <span className="text-[12px] font-medium text-text">특별 시간표</span>
                <span className="text-[11px] text-muted">· {specials.length}</span>
                <button type="button" className={`${btn} ml-auto`} onClick={() => createSpecial(sheetId)}><Icon name="plus" size={12} /> 추가</button>
            </div>
            {specials.length === 0 && <div className="text-[11px] text-muted py-1">없음 — 「추가」로 특별 시간표를 넣으면 그 범위 동안 기본 위에 얹힌다(우선 적용/덮어쓰기).</div>}
            <div className="flex flex-col gap-1">
                {specials.map((s) => {
                    const node = getNodesApi()?.get(s.id);
                    return (
                        <div key={s.id} className="flex items-center gap-1.5 text-[12px]">
                            <button type="button" className="text-text hover:text-accent truncate max-w-40 text-left" onClick={() => { setActiveSheet(s.id); getNodesApi()?.open(s.id); }}>
                                {node?.name ?? '특별 시간표'}
                            </button>
                            <select
                                value={s.data.mode}
                                onChange={(e) => applySpecialMeta(s.id, { mode: e.target.value as 'overlay' | 'replace' })}
                                aria-label="적용 방식"
                                className="bg-bg border border-line rounded px-1 py-0.5 text-text outline-none focus:border-accent"
                            >
                                <option value="overlay">우선 적용</option>
                                <option value="replace">덮어쓰기</option>
                            </select>
                            <label className="text-muted flex items-center gap-1">
                                순위
                                <input
                                    type="number"
                                    value={s.data.priority ?? ''}
                                    placeholder="위치"
                                    onChange={(e) => applySpecialMeta(s.id, { priority: e.target.value === '' ? null : Number(e.target.value) })}
                                    aria-label="우선순위(비우면 노드 위치)"
                                    className="w-14 bg-bg border border-line rounded px-1 py-0.5 text-text outline-none focus:border-accent"
                                />
                            </label>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
