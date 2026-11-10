/**
 * 시간표 화면(리치 셀 2단계) — 🔴 시트 `Table` 을 확장해서 그린다(쥔님 11-10 14:22). 옛 따로 짠 격자(TimeGrid)를 대신한다.
 *   시트가 쥐는 것: 칸 선택·편집(타자·F2·Enter·Tab·Esc·⌥Enter)·범위·복사/붙이기(TSV)·지우기·병합·열 폭·행/열 넣고 빼기·`@` 노드 고르기.
 *   시간표가 덧붙이는 것(sheetView.ts): 행 = 시각 띠(높이 ∝ 길이 · 머리에 이름+시각) · 행 사이 쉬는 시간 틈 · 확정 → model.ts.
 *   칸 글자는 리치 셀(page 의 rich-cell)이 그린다 — 굵게·색·노드 칩. 저장은 글자 그대로.
 *   🔴 되돌리기는 시간표가 쥔다(GridTab → nodes.ts 더미) — 시트 내장 history 는 안 끼운다.
 */
import { useEffect, useMemo, useRef, useState, type ComponentType, type ForwardRefExoticComponent, type RefAttributes } from 'react';
import { FrameToolbarPortal } from '../../../pane-ui-system';
import type { TableProps, TableTx } from '../../sheet/contracts/table';
import type { RichCellApi } from '../../page/contracts/rich-cell';
import { GridToolbar } from './GridToolbar';
import { applyTableTx, fitColWidth, gapOf, toTable, TIMETABLE_FEATURES } from '../sheetView';
import { columnCount, type TimetableData } from '../model';

/** 열 폭 말고 가로를 먹는 것 — 번호 자리 28 · 행 머리 88 · 안쪽 여백/가장자리 ≈ 44 */
const SIDE_RESERVE = 28 + 88 + 44;
const DEFAULT_PPM = 0.8;  // 1분 = 0.8px → 50분 ≈ 40px (툴바 확대/축소로 바뀐다)

/** 시트 Table 의 명령형 손잡이 중 시간표가 쓰는 것만 */
interface TableHandle { focus(): void; click(r: number, c: number): void; clear(): void }

export interface TimeSheetProps {
    data: TimetableData;
    edit: (fn: (d: TimetableData) => TimetableData) => void;
    /** 시트 표 편집기(table 약속의 Table) */
    Table: ComponentType<TableProps>;
    rich?: RichCellApi | null;
    onRemoved?: (title: string) => void;
    /** 새로 만든 직후 — 첫 칸을 고르고 초점을 준다 */
    focusFirst?: boolean; onFocusedFirst?: () => void;
    toolbarHost?: HTMLElement | null;
    onNotice?: (msg: string) => void;
    undo?: () => void; redo?: () => void; canUndo?: boolean; canRedo?: boolean;
}

/** 지우는 확정이면 알림 한 줄(되돌리기는 알림이 단다) — 옛 격자와 같은 문구 */
function removedTitle(tx: TableTx): string | null {
    const nr = tx.rows?.remove?.length ?? 0, nc = tx.cols?.remove?.length ?? 0;
    if (nr) return `교시 ${nr}개를 삭제했습니다`;
    if (nc) return `열 ${nc}개를 삭제했습니다`;
    if (tx.merge?.clear?.length && !tx.merge.set?.length) return '병합을 풀었습니다';
    if (tx.source === 'clear' && tx.cells.length) return '칸 글자를 지웠습니다';
    return null;
}

export function TimeSheet({ data, edit, Table, rich, onRemoved, focusFirst, onFocusedFirst, toolbarHost, onNotice, undo, redo, canUndo, canRedo }: TimeSheetProps) {
    const [ppm, setPpm] = useState(DEFAULT_PPM);
    const [row, setRow] = useState<number | null>(null);
    const ref = useRef<TableHandle | null>(null);
    const T = Table as unknown as ForwardRefExoticComponent<TableProps & RefAttributes<TableHandle>>;
    const boxRef = useRef<HTMLDivElement | null>(null);
    const [boxW, setBoxW] = useState(0);   // 0 = 못 쟀다(기본 폭 그대로)
    useEffect(() => {
        const el = boxRef.current;
        if (!el) return;
        const read = () => setBoxW(el.clientWidth);
        read();
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(read);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    const nCols = columnCount(data.columns);
    const defW = boxW > 0 ? fitColWidth(boxW - SIDE_RESERVE, nCols) : undefined;
    const shape = useMemo(() => toTable(data, ppm, defW), [data, ppm, defW]);
    const dataRef = useRef(data); dataRef.current = data;

    useEffect(() => {
        if (!focusFirst) return;
        ref.current?.click(0, 0); ref.current?.focus(); onFocusedFirst?.();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const RichText = rich?.RichText;
    return (<>
        <FrameToolbarPortal host={toolbarHost} fallback="none">
            <GridToolbar data={data} row={row} edit={edit} onNotice={onNotice} onRemoved={onRemoved}
                onRowRemoved={() => setRow(null)} onClear={() => ref.current?.clear()} canClear={row !== null}
                undo={undo} redo={redo} canUndo={canUndo} canRedo={canRedo} zoom={ppm} setZoom={setPpm} />
        </FrameToolbarPortal>
        <div ref={boxRef} className="h-full overflow-auto p-1" data-timesheet>
            <T ref={ref}
                columns={shape.columns} rows={shape.rows} merges={shape.merges}
                features={TIMETABLE_FEATURES} hideHandles
                rowGap={(id) => gapOf(dataRef.current, ppm, id)}
                rowHeadWidth={88}
                onSelectionChange={(s) => setRow(s.r1 < data.rows.length ? s.r1 : null)}
                onUndo={undo} onRedo={redo}
                renderText={RichText ? (v) => <RichText text={v} /> : undefined}
                mention={rich ? { Picker: rich.NodePicker, token: rich.token } : undefined}
                labels={{
                    addRow: '교시 넣기', addCol: '열 넣기', insertAbove: '위에 교시 넣기', insertBelow: '아래에 교시 넣기',
                    deleteRow: '이 교시 삭제', mergeCells: '칸 병합', unmergeCells: '병합 해제',
                }}
                onCommit={(tx) => {
                    edit((d) => applyTableTx(d, tx, ppm));
                    const t = removedTitle(tx);
                    if (t) onRemoved?.(t);
                }} />
        </div>
    </>);
}
