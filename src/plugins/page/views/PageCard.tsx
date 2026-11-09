/** 끼워 넣기 모습(P5) — 페이지 카드: 아이콘 + 이름 + 첫 글 한 줄. 누르면 그 페이지를 연다. */
import { Icon, pressProps } from '../../../pane-ui-system';
import type { EmbedProps } from '../../explorer/contracts/nodes';
import { getNodesApi, pageDataOf } from '../nodes';

export function PageCard({ nodeId }: EmbedProps) {
    const api = getNodesApi();
    const node = api?.get(nodeId);
    if (!node) return null;
    const first = pageDataOf(nodeId).blocks.find((b) => b.text.trim())?.text.trim().slice(0, 80);
    return (
        <div {...pressProps(() => api?.open(nodeId))}
            className="my-1 flex items-start gap-2 w-full text-left px-3 py-2 rounded border border-line hover:bg-text/[0.04]">
            {node.icon ? <span className="text-lead">{node.icon}</span> : <Icon name="fileText" size={14} className="text-muted mt-0.5" />}
            <span className="min-w-0">
                <span className="block text-body text-text truncate">{node.name}</span>
                {first && <span className="block text-small text-muted truncate">{first}</span>}
            </span>
        </div>
    );
}
