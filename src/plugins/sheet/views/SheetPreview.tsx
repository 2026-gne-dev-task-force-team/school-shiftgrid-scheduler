/** 끼워 넣기 모습(P5) — 시트 미리보기: 첫 4행 × 첫 5열을 읽기 전용으로. 누르면 그 시트를 연다. */
import { Icon, pressProps } from '../../../pane-ui-system';
import type { EmbedProps } from '../../explorer/contracts/nodes';
import { getNodesApi, docOf } from '../nodes';

const MAX_ROWS = 4;
const MAX_COLS = 5;

export function SheetPreview({ nodeId }: EmbedProps) {
    const api = getNodesApi();
    const node = api?.get(nodeId);
    if (!node) return null;
    const doc = docOf(nodeId);
    const cols = doc.cols.slice(0, MAX_COLS);
    const rows = doc.rows.slice(0, MAX_ROWS);
    return (
        <div {...pressProps(() => api?.open(nodeId))}
            className="my-1 block w-full text-left rounded border border-line hover:bg-text/[0.04] overflow-hidden">
            <span className="flex items-center gap-2 px-3 py-1.5 border-b border-line text-body text-text">
                {node.icon ? <span>{node.icon}</span> : <Icon name="table" size={14} className="text-muted" />}
                <span className="truncate">{node.name}</span>
            </span>
            <table className="w-full text-small text-text">
                <tbody>
                    {rows.map((r) => (
                        <tr key={r.id} className="border-b border-line last:border-0">
                            {cols.map((c) => <td key={c.key} className="px-2 py-0.5 truncate max-w-[12rem]">{r.cells[c.key] ?? ''}</td>)}
                        </tr>
                    ))}
                </tbody>
            </table>
            {(doc.rows.length > MAX_ROWS || doc.cols.length > MAX_COLS) && (
                <span className="block px-3 py-1 text-small text-muted">… 행 {doc.rows.length} · 열 {doc.cols.length}</span>
            )}
        </div>
    );
}
