/**
 * nodes.Embed — 다른 노드를 한 자리에 끼워 보여 준다(페이지 블록·나중엔 레코드 본문). 뷰는 nodeId 만 준다.
 *   타입이 embed 를 등록했으면 그걸(페이지=카드·시트=미리보기), 없으면 「아이콘+이름」 링크 한 줄(누르면 연다).
 *   지워졌거나 휴지통에 있으면 안내 한 줄 — 끼운 쪽 자료는 건드리지 않는다.
 */
import { useSyncExternalStore } from 'react';
import { Icon, pressProps } from '../../../pane-ui-system';
import type { EmbedProps } from '../contracts/nodes';
import { iconOf, getType } from '../model/types';
import { isDescendant } from '../model/tree';
import { getState, subscribeState, openById, select as selectNode } from '../store';

export function NodeEmbed({ nodeId, view }: EmbedProps) {
    const tree = useSyncExternalStore(subscribeState, () => getState().tree);
    const node = tree.nodes[nodeId];
    if (!node || isDescendant(tree, nodeId, tree.trash)) {
        return <div className="my-1 px-2 py-1.5 rounded border border-dashed border-line text-small text-muted">지워졌거나 휴지통에 있는 항목이에요.</div>;
    }
    const Custom = getType(node.type)?.embed;
    if (Custom) return <Custom nodeId={nodeId} view={view} />;
    return (
        <div
            {...pressProps(() => { selectNode(nodeId); openById(nodeId); })}
            className="my-1 flex items-center gap-2 w-full text-left px-2 py-1.5 rounded border border-line text-body text-text hover:bg-text/[0.04]"
        >
            {node.icon ? <span>{node.icon}</span> : <Icon name={iconOf(node)} size={14} className="text-muted" />}
            <span className="truncate">{node.name}</span>
        </div>
    );
}
