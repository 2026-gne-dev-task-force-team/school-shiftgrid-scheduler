/**
 * nodes.Chip — 글 줄 안에 끼는 노드 칩(시트 칸·리치 글자의 ⟦node:id⟧). 뷰는 nodeId 만 준다.
 *   타입이 chip 을 등록했으면 그걸, 없으면 「아이콘+이름」 기본 칩(누르면 연다). id 로 가리키니 이름이 바뀌어도 따라간다.
 *   지워졌거나 휴지통에 있으면 흐린 「없는 항목」 — 끼운 쪽 글자는 건드리지 않는다.
 *   🔴 한 줄 높이를 넘기지 않는다(inline-flex · 글자 크기 상속) — 칸·문단 줄 높이를 흔들지 말 것.
 */
import { useSyncExternalStore } from 'react';
import { Icon, pressProps } from '../../..';
import type { ChipProps } from '../../nodes/contracts/nodes';
import { iconOf, getType } from '../../nodes/model/types';
import { isTrashed } from '../api';
import { getState, subscribeState, openById, select as selectNode } from '../../node-store/store';

const BASE = 'inline-flex items-center gap-1 max-w-full align-baseline px-1 rounded bg-text/[0.06] leading-[inherit]';

export function NodeChip({ nodeId, readOnly }: ChipProps) {
    const tree = useSyncExternalStore(subscribeState, () => getState().tree);
    const node = tree.nodes[nodeId];
    if (!node || isTrashed(nodeId)) {
        return <span data-node-chip={nodeId} data-missing className={`${BASE} text-muted line-through`}>없는 항목</span>;
    }
    const Custom = getType(node.type)?.chip;
    if (Custom) return <Custom nodeId={nodeId} readOnly={readOnly} />;
    const open = readOnly ? {} : pressProps(() => { selectNode(nodeId); openById(nodeId); });
    return (
        <span data-node-chip={nodeId} {...open} className={`${BASE} text-text ${readOnly ? '' : 'cursor-pointer hover:bg-text/[0.1]'}`}>
            {node.icon ? <span className="leading-none">{node.icon}</span> : <Icon name={iconOf(node)} size={12} className="shrink-0 text-muted" />}
            <span className="truncate">{node.name}</span>
        </span>
    );
}
