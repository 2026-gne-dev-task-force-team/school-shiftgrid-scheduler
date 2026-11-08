/**
 * 「표 자리」 어댑터 — 간이 표(TableSlotProps)를 쓰던 손님이 코드를 거의 안 바꾸고 이 편집기로 갈아 끼우는 다리.
 *   손님(명단 ListTab 등)은 `host.modules` 로 table 모듈이 오면 `<Table {...slotToTableProps(p)} />`, 없으면 간이 표로 떨어진다.
 *
 * 🔴 ⛔ people 플러그인에서 타입을 import 하지 않는다(구조 검사 ⑱ g — 비-contract 형제 import 금지).
 *    그래서 people 의 `TableSlotProps` 와 **같은 꼴을 여기 미러**한다. people 은 안 고친다 — 이 다리만 있으면 된다.
 *
 * ⭐ 지금 people API 로도 되지만, 트랜잭션을 온전히 풀려면 손님이 선택 콜백 둘만 더하면 된다(설계 「여기서 죽는다」):
 *    onAddRowWith(cells) — 붙여넣기 넘침이 「값 있는 새 행」으로 · onMoveRowTo(id,to) — ±1 대신 index 이동.
 *    없으면 onAddRow()/onMoveRow(±1) 로 떨어진다(값·먼 이동이 빠질 수 있다).
 */
import type { TableFeature, TableProps, TableTx } from '../contracts/table';

export interface SlotColumn { key: string; title: string; width?: number }
export interface SlotRow { id: string; cells: Record<string, string> }

export interface TableSlotProps {
    columns: SlotColumn[];
    rows: SlotRow[];
    onCellChange(rowId: string, key: string, value: string): void;
    onAddRow(): void;
    onDeleteRow(rowId: string): void;
    onMoveRow(rowId: string, dir: -1 | 1): void;
    onPaste(text: string): void;
    emptyHint?: string;
    /** 🔴 갈아 끼울 때 더하면 좋은 선택 콜백 둘(위 설명). */
    onAddRowWith?(cells: Record<string, string>): void;
    onMoveRowTo?(rowId: string, to: number): void;
    /** 손님이 끼울 기능 — 비우면 명단에 맞는 기본(행·채우기·붙여넣기 더하기). */
    features?: (string | TableFeature)[];
}

/** TableSlotProps → TableProps. onCommit(tx) 를 손님의 낱개 콜백으로 되푼다. */
export function slotToTableProps(p: TableSlotProps): TableProps {
    return {
        columns: p.columns,
        rows: p.rows,
        features: p.features ?? ['rows', 'fill', 'paste-policy:append'],  // ⛔ history 는 안 끼운다 — 소유자(노드 시스템)가 쥔다
        emptyHint: p.emptyHint,
        onCommit: (tx: TableTx) => {
            for (const c of tx.cells) p.onCellChange(c.rowId, c.key, c.value);
            for (const add of tx.rows?.add ?? []) {
                const list = add.cells ?? Array.from({ length: add.count }, () => ({}));
                for (const cells of list) {
                    if (p.onAddRowWith) p.onAddRowWith(cells);
                    else p.onAddRow();   // 값은 못 싣는다 — onAddRowWith 가 있으면 온전하다
                }
            }
            for (const id of tx.rows?.remove ?? []) p.onDeleteRow(id);
            for (const m of tx.rows?.move ?? []) {
                if (p.onMoveRowTo) { p.onMoveRowTo(m.id, m.to); continue; }
                const i = p.rows.findIndex((r) => r.id === m.id);   // ±1 로 떨어뜨린다(한 칸씩)
                if (i >= 0 && m.to !== i) p.onMoveRow(m.id, m.to < i ? -1 : 1);
            }
        },
    };
}
