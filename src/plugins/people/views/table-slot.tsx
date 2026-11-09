/**
 * ───────────────────────────────────────────────────────────────────────────
 * 표 자리(table slot) — 명단 화면이 표를 **직접 그리지 않고 이 한 파일을 거쳐서만** 그린다.
 *   🔴 쥔님 2026-11-08: *"표 편집 공통 컴포넌트는 다른 세션에서 만든다. 갈아 낄 수 있게 해놔. 아마 플러그인으로 제공할 듯"*
 *   → 1차는 이 파일 안의 **간이 표**다. 나중에 표 편집기 플러그인이 오면 **이 파일 하나만** 바꾼다
 *     (명단 쪽 나머지는 무변경). ⛔ 표 편집기 약속(table 등)은 이 레인이 만들지 않는다 — 그 세션 몫이다.
 *
 * ── 표 편집기 세션에 건넬 「요구서」(이만큼이면 된다) ─────────────────────────────
 *   아래 TableSlotProps 가 명단 화면이 표에 건네는 전부다. 표 편집기 플러그인 모듈은 이 꼴을 받으면 된다:
 *     columns      — 열 정의(key·제목·선택 폭). people 은 이름·메모 둘뿐.
 *     rows         — 행들. 각 행은 id 하나 + { 열 key → 문자열 값 }.
 *     onCellChange — 한 칸을 고쳤다(행 id·열 key·새 값).
 *     onAddRow     — 빈 줄 하나 더하기(끝에).
 *     onDeleteRow  — 그 행 지우기(제공자가 휴지통으로 보낸다 — 표는 「지운다」만 안다).
 *     onMoveRow    — 그 행을 위(-1)·아래(+1)로 한 칸(순서 바꾸기).
 *     onPaste      — 엑셀·한글 표에서 복사한 탭·줄바꿈 텍스트 한 덩어리(파싱·생성은 제공자가 한다).
 *     emptyHint    — 행이 0일 때 보일 안내 문구(선택).
 *   ⚠️ 표는 값의 속뜻을 모른다(전부 문자열) — 「이름이 필수」·「메모는 선택」 같은 규칙은 명단 화면이 쥔다.
 *
 * 🔴 자리만 남긴 갈아끼우기(지금 구현 ⛔ — 아직 약속이 없다):
 *    나중에 host.modules 에 표 편집기 모듈이 있으면 그걸 쓰고, 없으면 이 간이 표로 떨어진다.
 *    그 분기는 ListTab 이 쥔다(이 파일은 간이 표 한 벌만 낸다) — 지금은 자리만 적어 둔다.
 * ───────────────────────────────────────────────────────────────────────────
 */
import { Icon } from '../../../pane-ui-system';
// 🔴 import type 만 — 표 약속 타입은 표 편집기 꾸러미 contracts 에서(값은 host.modules.use).
import type { TableApi, TableTx, HeaderMenuEntry } from '../../table-editor/contracts/table';

export interface TableColumn {
    key: string;
    title: string;
    /** 선택 — 간이 표는 안 쓴다(표 편집기가 쓸 수 있게 자리만). */
    width?: number;
}

export interface TableRow {
    id: string;
    /** 열 key → 문자열 값. 표는 전부 문자열로 다룬다. */
    cells: Record<string, string>;
}

export interface TableSlotProps {
    columns: TableColumn[];
    rows: TableRow[];
    onCellChange(rowId: string, key: string, value: string): void;
    onAddRow(): void;
    onDeleteRow(rowId: string): void;
    onMoveRow(rowId: string, dir: -1 | 1): void;
    /** 탭·줄바꿈 텍스트 한 덩어리 — 파싱·생성은 받는 쪽이 한다. */
    /** (선택) 중첩 — 방 목록만 쓴다. */
    onIndentRow?(rowId: string): void;
    onOutdentRow?(rowId: string): void;
    onPaste(text: string): void;
    emptyHint?: string;
}

/** 1차 간이 표 — 한 줄 = 한 사람, 칸은 열 정의만큼. 나중에 표 편집기 플러그인으로 통째 교체된다. */
export function SimpleTable({ columns, rows, onCellChange, onAddRow, onDeleteRow, onMoveRow, onPaste, emptyHint }: TableSlotProps) {
    return (
        <div className="flex flex-col gap-2 p-2 select-none">
            <table className="w-full border-collapse text-[13px]">
                <thead>
                    <tr className="border-b border-line text-left text-muted">
                        {columns.map((c) => (
                            <th key={c.key} className="py-1 px-2 font-medium">{c.title}</th>
                        ))}
                        <th className="py-1 px-2 w-24 text-right font-medium">줄</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r) => (
                        <tr key={r.id} className="border-b border-line/60 hover:bg-text/[0.03]">
                            {columns.map((c, ci) => (
                                <td key={c.key} className="py-0.5 px-2 align-top">
                                    <input
                                        value={r.cells[c.key] ?? ''}
                                        onChange={(e) => onCellChange(r.id, c.key, e.target.value)}
                                        onPaste={(e) => {
                                            // 첫 칸에 탭·줄바꿈이 든 걸 붙이면 여러 줄 붙여 넣기로 돌린다.
                                            const text = e.clipboardData.getData('text/plain');
                                            if (ci === 0 && (text.includes('\t') || text.includes('\n'))) {
                                                e.preventDefault();
                                                onPaste(text);
                                            }
                                        }}
                                        placeholder={c.title}
                                        className="w-full bg-bg border border-line rounded px-1.5 py-0.5 text-text outline-none focus:border-accent"
                                    />
                                </td>
                            ))}
                            <td className="py-0.5 px-2 text-right whitespace-nowrap">
                                <button type="button" onClick={() => onMoveRow(r.id, -1)} title="위로" aria-label="위로" className="px-1 text-muted hover:text-text">
                                    <Icon name="left" size={13} className="rotate-90" />
                                </button>
                                <button type="button" onClick={() => onMoveRow(r.id, 1)} title="아래로" aria-label="아래로" className="px-1 text-muted hover:text-text">
                                    <Icon name="left" size={13} className="-rotate-90" />
                                </button>
                                <button type="button" onClick={() => onDeleteRow(r.id)} title="지우기(휴지통)" aria-label="지우기" className="px-1 text-muted hover:text-text">
                                    <Icon name="trash" size={13} />
                                </button>
                            </td>
                        </tr>
                    ))}
                    {rows.length === 0 && (
                        <tr>
                            <td colSpan={columns.length + 1} className="py-6 px-2 text-center text-muted">
                                {emptyHint ?? '아직 아무도 없다. 아래 「줄 추가」로 더하거나 엑셀·한글 표를 붙여 넣는다.'}
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
            <div>
                <button
                    type="button"
                    onClick={onAddRow}
                    className="flex items-center gap-1 h-btn px-2 rounded border border-line text-[12px] text-muted hover:text-text hover:bg-text/[0.04]"
                >
                    <Icon name="plus" size={13} /> 줄 추가
                </button>
            </div>
        </div>
    );
}

// ───────────────────────────────────────────────────────────────────────────
// 🔴 표 편집기로 갈아 끼우기(2026-11-09) — host.modules.use('table') 이 있으면 그 표를, 없으면 위 간이 표를 그린다.
//    표 편집기의 열·행 모양이 이 파일의 TableColumn·TableRow 와 같다(이 「요구서」대로 만들어졌다).
//    표가 내는 묶음 변경(TableTx)을 이 자리의 콜백으로 푼다 — 저장·휴지통은 여전히 다리(nodes.ts)가 쥔다.
// ───────────────────────────────────────────────────────────────────────────

// 열 두 개(고정)라 열 고치기·병합은 안 켠다. 되돌리기는 간이 표와 같이 없다 — 노드 저장과 엇갈리지 않게.
const FEATURES = ['rows', 'col-resize', 'sticky-headers', 'paste-policy:append'];

/** 표 편집기의 묶음 변경 → 표 자리 콜백. 순수 함수(시험이 바로 부른다). */
export function applyTableTx(tx: TableTx, props: TableSlotProps, toTsv: (cells: string[][]) => string): void {
    for (const c of tx.cells) props.onCellChange(c.rowId, c.key, c.value);
    for (const add of tx.rows?.add ?? []) {
        const cells = add.cells ?? [];
        const filled = cells.filter((r) => Object.values(r).some((v) => v !== ''));
        // shortcut: 「위·아래에 줄 넣기」도 끝에 붙는다(다리에 자리 지정 추가가 없다) — 자리 넣기가 필요해지면 onInsertRow 를 늘린다.
        if (filled.length > 0) props.onPaste(toTsv(filled.map((r) => props.columns.map((col) => r[col.key] ?? ''))));
        else for (let i = 0; i < Math.max(1, add.count); i++) props.onAddRow();
    }
    for (const id of tx.rows?.remove ?? []) props.onDeleteRow(id);
    for (const mv of tx.rows?.move ?? []) {
        const from = props.rows.findIndex((r) => r.id === mv.id);
        if (from < 0) continue;
        const dir: -1 | 1 = mv.to < from ? -1 : 1;
        for (let i = 0; i < Math.abs(mv.to - from); i++) props.onMoveRow(mv.id, dir);
    }
}

/** 표 자리 — 표 편집기가 있으면 그걸로, 없으면 간이 표로. */
export function TableSlot({ table, ...props }: TableSlotProps & { table: TableApi | null }) {
    if (!table) return <SimpleTable {...props} />;
    const { Table } = table;
    const headerMenu = (kind: 'row' | 'col', id: string): HeaderMenuEntry[] => {
        if (kind !== 'row') return [];
        const out: HeaderMenuEntry[] = [];
        if (props.onIndentRow) out.push({ label: '한 칸 안으로', onSelect: () => props.onIndentRow?.(id) });
        if (props.onOutdentRow) out.push({ label: '한 칸 밖으로', onSelect: () => props.onOutdentRow?.(id) });
        return out;
    };
    return (
        <div className="flex-1 min-h-0 p-2">
            <Table
                columns={props.columns}
                rows={props.rows}
                features={FEATURES}
                onCommit={(tx) => applyTableTx(tx, props, table.toTsv)}
                headerMenu={headerMenu}
                emptyHint={props.emptyHint}
            />
        </div>
    );
}
