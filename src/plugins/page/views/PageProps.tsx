/**
 * 페이지 노드의 속성 칸 — 제목(= 노드 이름)·아이콘·위치를 본다. 제목은 여기서도 고친다(노드 rename 그대로).
 *   🔴 칸은 노트(페이지 주인)가 낸다(contributes.properties · target = PAGE_TYPE).
 *   아이콘은 보기만 — 고치기는 페이지 화면의 아이콘 고르기가 쥔다(열린 페이지의 되돌리기와 엇갈리지 않게).
 */
import { useSyncExternalStore } from 'react';
import { PropertyField } from '../../../pane-ui-system';
import type { PropertiesPaneProps } from '../../../pane-ui-system/plugin';
import { getNodesApi, getPageRev, pageNodeOf, parentNameOf, subscribePageNodes } from '../nodes';

export function PageProps({ target }: PropertiesPaneProps) {
    useSyncExternalStore(subscribePageNodes, getPageRev);
    const node = pageNodeOf(target.id);
    if (!node) return null;
    return (
        <div className="flex flex-col gap-2">
            <PropertyField label="제목" value={node.name} onCommit={(v) => { if (v.trim()) getNodesApi()?.rename(target.id, v.trim()); }} />
            <PropertyField label="아이콘" value={node.icon ?? ''} />
            <PropertyField label="위치" value={parentNameOf(target.id) ?? ''} />
        </div>
    );
}
