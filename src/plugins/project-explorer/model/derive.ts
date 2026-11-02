/**
 * 유도 자식 캐시 — 노드마다 derive() 결과를 한 번 계산해 둔다(설계 「노드마다 캐시」).
 *   🔴 다시 계산하는 때는 둘뿐: ① 나무가 바뀌어 그 노드가 changedIds 에 들어올 때(store 가 invalidate)
 *      ② 플러그인이 nodes.invalidate(id) 를 부를 때. 그 밖엔 캐시를 쓴다(derive 가 비싸도 괜찮게).
 *   🔴 derive 가 던지면 「유도 실패」로 접어 둔다 — 나무는 산다(플러그인 activate 예외 격리와 같은 결).
 */
import type { Node } from './tree';
import type { NodeTypeDef, VirtualNode } from './types';

export interface DerivedResult {
    children: VirtualNode[];
    failed: boolean;
}

const cache = new Map<string, DerivedResult>();

/** 이 노드의 유도 자식 — 캐시가 있으면 그대로, 없으면 def.derive 를 돌려 캐시한다. */
export function getDerived(node: Node, def: NodeTypeDef): DerivedResult {
    const hit = cache.get(node.id);
    if (hit) return hit;
    let res: DerivedResult;
    if (!def.derive) {
        res = { children: [], failed: false };
    } else {
        try {
            res = { children: def.derive(node) ?? [], failed: false };
        } catch {
            res = { children: [], failed: true };   // 🔴 던져도 나무는 산다
        }
    }
    cache.set(node.id, res);
    return res;
}

/** 그 노드의 유도 캐시를 버린다 — 다음 getDerived 때 다시 계산한다. */
export function invalidateDerived(id: string): void {
    cache.delete(id);
}

/** 전부 버린다 — 플러그인 활성/비활성으로 타입이 바뀌면 유도 결과도 달라질 수 있다. */
export function clearDerived(): void {
    cache.clear();
}
