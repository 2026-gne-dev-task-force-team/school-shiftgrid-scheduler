/**
 * 하위 페이지 줄(Q8) — 이 페이지 밑 페이지 하나를 한 줄로 보여 준다(노션의 「하위 페이지」). 누르면 그 페이지가 열린다.
 *   🔴 이름·아이콘은 노드에서 읽는다(여기 안 쥔다) — 이름을 바꾸면 이 줄도 바뀐다. 줄의 생김·사라짐은 core/children.ts 가 맡는다.
 */
import { useSyncExternalStore } from 'react';
import { Icon, pressProps } from '../../../pane-ui-system';
import { getNodesApi, getPageRev, subscribePageNodes } from '../nodes';

export function ChildPageBlock({ nodeId }: { nodeId?: string }) {
    useSyncExternalStore(subscribePageNodes, getPageRev, getPageRev);   // 이름·아이콘이 바뀌면 다시 그린다
    const api = getNodesApi();
    const node = nodeId ? api?.get(nodeId) : undefined;
    if (!api || !node) return null;
    return (
        <div {...pressProps(() => api.open(node.id))} data-child-page={node.id}
            className="my-0.5 flex items-center gap-2 w-full text-left px-1.5 py-1 rounded text-body text-text hover:bg-text/[0.05] cursor-pointer select-none">
            {node.icon ? <span className="text-lead leading-none">{node.icon}</span> : <Icon name="fileText" size={16} className="text-muted" />}
            <span className="min-w-0 truncate underline decoration-line underline-offset-2">{node.name || '제목 없음'}</span>
        </div>
    );
}
