/**
 * nodes.Header — 노드 공통 머리(아이콘 고르기 + 제목 입력). 큰 얼굴 하나뿐(Q5 R1 — 머리 두 벌 금지): 아이콘이 윗줄, 제목이 그 밑 왼쪽 선에 선다. 보통 노드 틀(nodes.Frame)이 쓴다.
 *   🔑 아이콘은 node.icon, 제목은 node.name 하나만 읽고 쓴다 → 탐색기 줄과 같은 값(따로 도는 data.icon 없음).
 *   leafId 를 주면 이름이 바뀔 때 그 탭 제목도 창틀 setTitle 로 같이 고친다(뷰는 탭 제목을 모른다).
 */
import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { Icon, IconPicker, TitleField } from '../../../pane-ui-system';
import { setLeafTitle } from '../../../pane-ui-system/plugin';
import type { NodeHeaderProps } from '../contracts/nodes';
import { canDo, iconOf } from '../model/types';
import { apiRename, apiSetField, getState, subscribeState } from '../store';

export function NodeHeader({ nodeId, leafId, fallback, titleAriaLabel, titlePlaceholder, onTitleEnter, onRename }: NodeHeaderProps) {
    const node = useSyncExternalStore(subscribeState, () => getState().tree.nodes[nodeId]);
    const name = node?.name;
    useEffect(() => { if (leafId && name) setLeafTitle(leafId, name); }, [leafId, name]);
    if (!node) return null;
    const ok = canDo(node.type, nodeId, 'rename');
    return (
        <PageStack>
            <IconPicker
                icon={node.icon}
                onSetIcon={(i) => apiSetField(nodeId, 'icon', i)}
                fallback={fallback ?? <Icon name={iconOf(node)} size={15} className="text-muted" />}
                sizeClass="text-4xl"
            />
            {ok
                ? <TitleField value={node.name} onRename={(n) => (onRename ?? ((x: string) => apiRename(nodeId, x)))(n)} className="w-full text-3xl font-bold leading-tight tracking-tight"
                    ariaLabel={titleAriaLabel} placeholder={titlePlaceholder} onEnter={onTitleEnter} />
                : <span className={`px-1 truncate text-text w-full text-3xl font-bold leading-tight tracking-tight`}>{node.name}</span>}
        </PageStack>
    );
}

/** 큰 얼굴 — 아이콘이 윗줄, 제목이 그 밑 왼쪽 선에 선다(노션 · 속성·본문도 같은 선). */
function PageStack({ children }: { children: ReactNode }) {
    return <div className="flex-1 min-w-0 flex flex-col items-start gap-1">{children}</div>;
}
