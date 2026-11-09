/**
 * ───────────────────────────────────────────────────────────────────────────
 * 표 자리(table slot) — 방 목록 화면이 표를 **직접 그리지 않고 이 한 파일을 거쳐서만** 그린다.
 *   🔴 쥔님 2026-11-08: *"표 편집 공통 컴포넌트는 다른 세션에서 만든다. 갈아 낄 수 있게 해놔. 아마 플러그인으로 제공할 듯"*
 *   → 1차는 이 파일 안의 **간이 표**다(people 과 같은 방식 — people 도 제 간이 표로 「표 자리」를 채운다).
 *     나중에 표 편집기 플러그인(약속 table)이 오면 **이 파일 하나만** 바꾼다(방 목록 쪽 나머지는 무변경).
 *
 * ── 표 편집기 세션에 건넬 「요구서」(이만큼이면 된다) ─────────────────────────────
 *   아래 TableSlotProps 가 방 목록 화면이 표에 건네는 전부다(people 요구서와 같은 꼴 + 방 안에 방 자리 둘):
 *     columns      — 열 정의(key·제목·선택 폭). rooms 는 이름·메모 둘뿐.
 *     rows         — 행들. 각 행은 id 하나 + { 열 key → 문자열 값 } + 선택 indent(중첩 깊이).
 *     onCellChange — 한 칸을 고쳤다(행 id·열 key·새 값).
 *     onAddRow     — 빈 줄 하나 더하기(끝에).
 *     onDeleteRow  — 그 행 지우기(제공자가 휴지통으로 보낸다 — 표는 「지운다」만 안다).
 *     onMoveRow    — 그 행을 위(-1)·아래(+1)로 한 칸(순서 바꾸기).
 *     onPaste      — 엑셀·한글 표에서 복사한 탭·줄바꿈 텍스트 한 덩어리(파싱·생성은 제공자가 한다).
 *     onIndentRow·onOutdentRow — (선택) 중첩 조작. 주면 →·← 단추가 뜬다(방 안에 방). 안 주면 평평한 표.
 *     emptyHint    — 행이 0일 때 보일 안내 문구(선택).
 *   ⚠️ 표는 값의 속뜻을 모른다(전부 문자열) — 「이름이 필수」·indent 가 무엇인지는 방 목록 화면이 쥔다.
 * ───────────────────────────────────────────────────────────────────────────
 */
import { Icon } from '../../../pane-ui-system';
import { useState } from 'react';
// 🔴 import type 만 — 레코드 뷰 약속 타입은 레코드 뷰 꾸러미 contracts 에서(값은 host.modules.use).
import type { RecordViewApi, RecordField, RecordTree, PasteRequest } from '../../record-view/contracts/record-view';

export interface TableColumn {
    key: string;
    title: string;
    /** 선택 — 간이 표는 안 쓴다(표 편집기가 쓸 수 있게 자리만). */
    width?: number;
    /** (선택) 사용자 열의 레코드 뷰 칸 정의 그대로(타입·고르기 값) — 없으면 글 칸. */
    field?: RecordField;
}

export interface TableRow {
    id: string;
    /** 열 key → 문자열 값. 표는 전부 문자열로 다룬다. */
    cells: Record<string, string>;
    /** (선택) 사용자 열 값 — 레코드 뷰 값 그대로(간이 표는 안 그린다). */
    values?: Record<string, unknown>;
    /** 선택 — 첫 칸을 이만큼 들여쓴다(0 = 안 들여씀). 표는 이게 무슨 뜻인지 모른다. */
    indent?: number;
}

export interface TableSlotProps {
    columns: TableColumn[];
    rows: TableRow[];
    /** 고정 열은 글자, 사용자 열은 레코드 뷰 값 그대로(숫자·날짜·고르기…)가 온다. */
    onCellChange(rowId: string, key: string, value: unknown): void;
    /** (선택) 열 정의가 바뀌었다(레코드 뷰의 열 추가·이름 바꾸기·지우기) — 주면 레코드 뷰에서 열을 고칠 수 있다. */
    onFieldsChange?(fields: RecordField[]): void;
    onAddRow(): void;
    onDeleteRow(rowId: string): void;
    onMoveRow(rowId: string, dir: -1 | 1): void;
    /** 탭·줄바꿈 텍스트 한 덩어리 — 파싱·생성은 받는 쪽이 한다. */
    onPaste(text: string): void;
    /** (선택) 중첩 한 칸 깊게 — 주면 → 단추가 뜬다. */
    onIndentRow?(rowId: string): void;
    /** (선택) 중첩 한 칸 얕게 — 주면 ← 단추가 뜬다. */
    onOutdentRow?(rowId: string): void;
    /** (선택) 그 행의 부모 행 id(뿌리면 null) — 주면 레코드 뷰가 트리(방 안에 방)로 그린다. */
    parentOf?(rowId: string): string | null;
    emptyHint?: string;
}

/** 첫 칸 들여쓰기 폭(px) — 깊이 한 단 = 16px. */
const INDENT_PX = 16;

/** 1차 간이 표 — 한 줄 = 한 방, 칸은 열 정의만큼. 나중에 표 편집기 플러그인으로 통째 교체된다. */
export function SimpleTable({ columns, rows, onCellChange, onAddRow, onDeleteRow, onMoveRow, onPaste, onIndentRow, onOutdentRow, emptyHint }: TableSlotProps) {
    const nesting = !!(onIndentRow || onOutdentRow);
    return (
        <div className="flex flex-col gap-2 p-2 select-none">
            <table className="w-full border-collapse text-[13px]">
                <thead>
                    <tr className="border-b border-line text-left text-muted">
                        {columns.map((c) => (
                            <th key={c.key} className="py-1 px-2 font-medium">{c.title}</th>
                        ))}
                        <th className="py-1 px-2 w-32 text-right font-medium">줄</th>
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
                                        style={ci === 0 && r.indent ? { marginLeft: r.indent * INDENT_PX } : undefined}
                                        className="w-full bg-bg border border-line rounded px-1.5 py-0.5 text-text outline-none focus:border-accent"
                                    />
                                </td>
                            ))}
                            <td className="py-0.5 px-2 text-right whitespace-nowrap">
                                {nesting && (
                                    <>
                                        <button type="button" onClick={() => onOutdentRow?.(r.id)} title="내어쓰기" aria-label="내어쓰기" className="px-1 text-muted hover:text-text">
                                            <Icon name="left" size={13} />
                                        </button>
                                        <button type="button" onClick={() => onIndentRow?.(r.id)} title="들여쓰기(방 안에 방)" aria-label="들여쓰기" className="px-1 text-muted hover:text-text">
                                            <Icon name="right" size={13} />
                                        </button>
                                    </>
                                )}
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
                                {emptyHint ?? '아직 아무 방도 없다. 아래 「줄 추가」로 더하거나 엑셀·한글 표를 붙여 넣는다.'}
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
// 🔴 레코드 뷰로 갈아 끼우기(쥔님 2026-11-09 「명단은 레코드 뷰야」) — host.modules.use('record-view') 이 있으면 그 목록 화면을,
//    없으면 위 간이 표를 그린다. 레코드 뷰의 콜백을 이 자리의 콜백으로 푼다 — 저장·휴지통은 여전히 다리(nodes.ts)가 쥔다.
// ───────────────────────────────────────────────────────────────────────────

/** 레코드 뷰 붙여넣기(보이는 칸 key 순서 + 글자) → 이 자리 열 순서의 TSV 한 덩어리. 순수 함수. */
export function pasteToTsv(req: PasteRequest, columns: TableColumn[]): string {
    return req.rows.map((r) => columns.map((col) => { const i = req.keys.indexOf(col.key); return i < 0 ? '' : (r[i] ?? ''); }).join('\t')).join('\n');
}

/** 「beforeId 앞으로」(null 이면 끝) → 한 칸씩 옮기기 몇 번. 순수 함수. */
export function reorderSteps(ids: string[], id: string, beforeId: string | null): { dir: -1 | 1; n: number } | null {
    const from = ids.indexOf(id);
    if (from < 0) return null;
    const target = beforeId ? ids.indexOf(beforeId) : ids.length;
    if (target < 0) return null;
    const to = target > from ? target - 1 : target;
    return to === from ? null : { dir: to < from ? -1 : 1, n: Math.abs(to - from) };
}

type Rec = { id: string } & Record<string, string>;

/** 표 자리 — 레코드 뷰가 있으면 그걸로, 없으면 간이 표로. */
export function TableSlot({ rv, viewKey, ...props }: TableSlotProps & { rv: RecordViewApi | null; viewKey: string }) {
    const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
    if (!rv) return <SimpleTable {...props} />;
    const { RecordView } = rv;
    const fields: RecordField[] = props.columns.map((c) => c.field ?? { key: c.key, label: c.title, type: 'text', width: c.width });
    const records: Rec[] = props.rows.map((r) => ({ ...r.cells, ...(r.values ?? {}), id: r.id }) as Rec);
    const parentOf = props.parentOf;
    const tree: RecordTree<Rec> | undefined = parentOf && props.onIndentRow && props.onOutdentRow ? {
        parentOf: (r) => parentOf(r.id),
        collapsed: (id) => collapsed.has(id),
        onToggleCollapse: (id) => setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }),
        onIndent: props.onIndentRow,
        onOutdent: props.onOutdentRow,
    } : undefined;
    return (
        <div className="flex-1 min-h-0 flex flex-col">
            <RecordView<Rec>
                fields={fields}
                records={records}
                getId={(r) => r.id}
                viewKey={viewKey}
                titleKey={props.columns[0]?.key}
                onCellChange={(id, key, value) => props.onCellChange(id, key, value)}
                onFieldsChange={props.onFieldsChange}
                onAddRecord={props.onAddRow}
                onDeleteRecords={(ids) => ids.forEach(props.onDeleteRow)}
                onPaste={(req) => props.onPaste(pasteToTsv(req, props.columns))}
                onReorder={(id, beforeId) => {
                    const s = reorderSteps(props.rows.map((r) => r.id), id, beforeId);
                    if (s) for (let i = 0; i < s.n; i++) props.onMoveRow(id, s.dir);
                }}
                tree={tree}
                className="flex-1 min-h-0"
            />
        </div>
    );
}
