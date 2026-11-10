/**
 * 활성 탭 따라가기 — 탐색기 강조·속성 패널이 「지금 보는 탭의 노드」를 가리키게 한다(R3 S3 · 노션 꼴).
 *   ⭐ 노드 틀(NodeFrame)이 뜨면 「이 탭(leafId) = 이 노드」를 여기 적고(bindLeafNode) 곧바로 그 노드를 고른다.
 *   ⭐ 탭이 바뀔 때(작업대 activate) — 적힌 탭이면 그 노드를, 노드가 아닌 가운데 화면(시작 화면·달력 전체·설정)이면 고른 것을 푼다.
 *      사이드 패널(탐색기·속성)이 포커스를 받는 건 탭 바뀜이 아니다 — 건드리지 않는다.
 *   🔴 틀이 사라질 때는 아직 그 노드가 고른 것일 때만 푼다(남이 고른 걸 안 지운다).
 */
import { getState, select } from '../node-store/store';

const leafNodes = new Map<string, string>();

/** 틀이 뜰 때 부른다 — 돌려준 함수가 정리(틀이 사라질 때). */
export function bindLeafNode(leafId: string | undefined, nodeId: string): () => void {
    if (leafId) leafNodes.set(leafId, nodeId);
    const s = getState();
    if (leafId && (s.selectedId !== nodeId || s.selectedIds.length !== 1)) select(nodeId);
    return () => {
        if (leafId && leafNodes.get(leafId) === nodeId) leafNodes.delete(leafId);
        const c = getState();
        if (leafId && c.selectedId === nodeId && c.selectedIds.length === 1) select(null);
    };
}

/** 작업대 activate 이벤트 — area 가 left·right(사이드 패널)면 무시. */
export function followActivatedLeaf(leaf: { id: string; area?: string }): void {
    if (leaf.area === 'left' || leaf.area === 'right') return;
    const node = leafNodes.get(leaf.id);
    const s = getState();
    if (node && s.tree.nodes[node]) { if (s.selectedId !== node || s.selectedIds.length !== 1) select(node); return; }
    if (s.selectedId) select(null);
}
