/**
 * nodes.Header — 노드 공통 머리(아이콘 고르기 + 제목 입력). 얼굴 하나뿐(Q5 R1 — 머리 두 벌 금지): 아이콘 + 제목 한 줄(V1). 보통 노드 틀(nodes.Frame)이 쓴다.
 *   🔑 아이콘은 node.icon, 제목은 node.name 하나만 읽고 쓴다 → 탐색기 줄과 같은 값(따로 도는 data.icon 없음).
 *   leafId 를 주면 이름이 바뀔 때 그 탭 제목도 창틀 setTitle 로 같이 고친다(뷰는 탭 제목을 모른다).
 */
import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { Icon, IconPicker, TitleField } from '../../../pane-ui-system';
import { setLeafGlyph, setLeafTitle } from '../../../pane-ui-system/plugin';
import type { NodeHeaderProps } from '../contracts/nodes';
import { canDo, iconOf } from '../model/types';
import { apiRename, apiSetField, getState, subscribeState } from '../store';

export function NodeHeader({ nodeId, leafId, fallback, titleAriaLabel, titlePlaceholder, onTitleEnter, onRename }: NodeHeaderProps) {
    const node = useSyncExternalStore(subscribeState, () => getState().tree.nodes[nodeId]);
    const name = node?.name;
    const icon = node?.icon;
    useEffect(() => { if (leafId && name) setLeafTitle(leafId, name); }, [leafId, name]);
    // V2: 아이콘도 제목과 같은 자리에서 — 고르면 그 노드를 연 탭 전부의 아이콘이 바뀐다(지우면 뷰 기본 아이콘으로).
    //     ⛔ 사라질 때 지우지 않는다 — 안 보는 탭은 머리가 내려가 있어도 아이콘은 남아야 한다(실측: 지우면 다른 탭으로 갈 때 사라졌다).
    useEffect(() => { if (leafId) setLeafGlyph(leafId, icon); }, [leafId, icon]);
    if (!node) return null;
    const ok = canDo(node.type, nodeId, 'rename');
    return (
        <PageStack>
            <IconPicker
                icon={node.icon}
                onSetIcon={(i) => apiSetField(nodeId, 'icon', i)}
                fallback={fallback ?? <Icon name={iconOf(node)} size={15} className="text-muted" />}
                sizeClass="text-2xl"
            />
            {ok
                ? <TitleField value={node.name} onRename={(n) => (onRename ?? ((x: string) => apiRename(nodeId, x)))(n)} className="flex-1 min-w-0 text-2xl font-bold leading-tight tracking-tight"
                    ariaLabel={titleAriaLabel} placeholder={titlePlaceholder} onEnter={onTitleEnter} />
                : <span className="px-1 truncate text-text flex-1 min-w-0 text-2xl font-bold leading-tight tracking-tight">{node.name}</span>}
        </PageStack>
    );
}

/** 머리 한 줄 — 아이콘 + 제목이 같은 줄에 선다(V1 · 쥔님 「컴팩트하게 한줄로」). 높이는 모든 노드가 같다. */
function PageStack({ children }: { children: ReactNode }) {
    return <div className="flex-1 min-w-0 flex items-center gap-1.5 h-10">{children}</div>;
}
