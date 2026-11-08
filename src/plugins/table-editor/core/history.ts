/**
 * 역트랜잭션(M1 에서 넘긴 「행/열 조작 undo」) — 지금 상태에서 tx 를 되돌리는 tx 를 만든다.
 *   🔴 데이터를 「스냅샷」으로 들지 않는다(설계 「history 는 역트랜잭션만」) — 지금 props(rows·columns·merges)에서
 *      반대 tx 를 **그 자리에서** 계산한다. 내장 되돌리기 스택엔 이 반대 tx 만 쌓인다.
 *   짝 규칙: add↔remove 는 **같은 id**로 맞춘다(그래서 편집기가 add 때 id 를 미리 매긴다 — redo/undo 가 어긋나지 않는다).
 */
import type { MergeRegion, TableColumn, TableRow, TableTx } from '../contracts/table';

/** tx 의 반대 tx — rows·cols·axis·merge·cells 전부. 지금 상태(rows·columns·merges)를 읽어 되돌릴 값을 담는다. */
export function inverseTx(
    tx: TableTx,
    rows: TableRow[],
    columns: TableColumn[],
    merges: MergeRegion[] | undefined,
): TableTx {
    const byId = new Map(rows.map((r) => [r.id, r]));
    const colByKey = new Map(columns.map((c, i) => [c.key, { col: c, i }]));

    // cells → 지금 값으로 되돌린다(없는 행이면 '' — 그 행은 아래 rows.remove 로 사라진다).
    const inv: TableTx = {
        cells: tx.cells.map((ch) => ({ rowId: ch.rowId, key: ch.key, value: byId.get(ch.rowId)?.cells[ch.key] ?? '' })),
        source: 'edit',
    };

    if (tx.rows) {
        const r: NonNullable<TableTx['rows']> = {};
        // add → 그 id 들을 지운다.
        if (tx.rows.add) {
            const ids: string[] = [];
            for (const a of tx.rows.add) for (const id of a.ids ?? []) ids.push(id);
            if (ids.length) r.remove = ids;
        }
        // remove → 옛 자리에 옛 값·옛 id 로 되살린다(원래 index 오름차순으로 넣어야 자리가 맞는다).
        if (tx.rows.remove?.length) {
            const back = tx.rows.remove
                .map((id) => ({ id, i: rows.findIndex((x) => x.id === id), row: byId.get(id) }))
                .filter((x) => x.i >= 0 && x.row)
                .sort((a, b) => a.i - b.i)
                .map((x) => ({ at: x.i, count: 1, ids: [x.id], cells: [{ ...x.row!.cells }] }));
            if (back.length) r.add = back;
        }
        // move → 옛 자리로 되돌린다.
        if (tx.rows.move?.length) {
            r.move = tx.rows.move
                .map((m) => ({ id: m.id, to: rows.findIndex((x) => x.id === m.id) }))
                .filter((m) => m.to >= 0);
        }
        inv.rows = r;
    }

    if (tx.cols) {
        const c: NonNullable<TableTx['cols']> = {};
        if (tx.cols.resize) c.resize = tx.cols.resize.map((x) => ({ key: x.key, width: colByKey.get(x.key)?.col.width ?? 0 }));
        if (tx.cols.rename) c.rename = tx.cols.rename.map((x) => ({ key: x.key, title: colByKey.get(x.key)?.col.title ?? x.key }));
        if (tx.cols.add) c.remove = tx.cols.add.map((a) => a.key);
        if (tx.cols.remove) {
            c.add = tx.cols.remove.map((key) => {
                const e = colByKey.get(key);
                return { at: e?.i ?? columns.length, key, title: e?.col.title ?? key };
            });
        }
        inv.cols = c;
    }

    if (tx.axis?.rowWeight) {
        inv.axis = { rowWeight: tx.axis.rowWeight.map((w) => ({ id: w.id, delta: -w.delta })) };
    }

    if (tx.merge) {
        const m: NonNullable<TableTx['merge']> = {};
        if (tx.merge.set?.length) m.clear = tx.merge.set.map((x) => ({ rowId: x.rowId, key: x.key }));
        if (tx.merge.clear?.length) {
            const restored = (merges ?? []).filter((x) => tx.merge!.clear!.some((cl) => cl.rowId === x.rowId && cl.key === x.key));
            if (restored.length) m.set = restored.map((x) => ({ ...x }));
        }
        inv.merge = m;
    }

    return inv;
}

/** 이 tx 가 되돌릴 거리가 있나(빈 tx 는 스택에 안 쌓는다). */
export function txHasEffect(tx: TableTx): boolean {
    return !!(
        tx.cells.length ||
        tx.rows?.add?.length || tx.rows?.remove?.length || tx.rows?.move?.length ||
        tx.cols?.add?.length || tx.cols?.remove?.length || tx.cols?.resize?.length || tx.cols?.rename?.length ||
        tx.axis?.rowWeight?.length ||
        tx.merge?.set?.length || tx.merge?.clear?.length
    );
}
