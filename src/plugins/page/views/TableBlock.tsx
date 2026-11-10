/**
 * 표 블록(명세 요구 7) — table 약속(sheet)이 내는 Table 을 블록 안에 그린다.
 *   🔴 ⛔ sheet 폴더는 안 고친다 — 약속(host.modules.use('table'))으로만 받는다.
 *   약속이 없으면(표 편집기 꺼짐) 읽기 전용 표로 버틴다(최소 대체).
 */
import type { PluginHost } from '../../../pane-ui-system/plugin';
// 🔴 import type 만 — table 약속 타입은 표 편집기 꾸러미 contracts 에서(값은 host.modules.use).
import type { TableApi, TableColumn, TableTx } from '../../sheet/contracts/table';
import type { TableBlockData } from '../core/types';
import { applyTableTx } from '../core/blocks';

export function TableBlock({ host, table, onChange }: {
    host: PluginHost;
    table: TableBlockData;
    onChange: (next: TableBlockData) => void;
}) {
    const api = host.modules.use<TableApi>('table');

    if (!api) {
        // 최소 대체 — 읽기 전용 GFM 표(🙋 표 편집기가 꺼져 있을 때만 보인다).
        return (
            <div className="my-1 overflow-auto rounded border border-line">
                <table className="w-full text-body text-text">
                    <thead>
                        <tr className="border-b border-line bg-text/[0.03]">
                            {table.columns.map((c) => <th key={c.key} className="px-2 py-1 text-left font-medium">{c.title}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {table.rows.map((r) => (
                            <tr key={r.id} className="border-b border-line last:border-0">
                                {table.columns.map((c) => <td key={c.key} className="px-2 py-1">{r.cells[c.key] ?? ''}</td>)}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }

    const Table = api.Table;
    const columns: TableColumn[] = table.columns.map((c) => ({ key: c.key, title: c.title, width: c.width }));

    return (
        <div className="my-1">
            <Table
                columns={columns}
                rows={table.rows}
                onCommit={(tx: TableTx) => onChange(applyTableTx(table, tx))}
                emptyHint="빈 표 — 「줄 추가」를 누르거나 표를 붙여 넣어 보세요."
            />
        </div>
    );
}
