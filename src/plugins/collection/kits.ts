/**
 * defineCollection 손잡이 표 — 노드 타입(목록·항목) → 그 kit. 관계 칸이 남의 목록 줄에 쓸 때 주인 손(kit 의 NodesApi)을 빌린다
 *   (setData 는 그 타입을 등록한 플러그인만 — collection 의 NodesApi 로는 거부된다).
 */
import type { CollectionKit } from './contracts/collection';

const byType = new Map<string, Pick<CollectionKit, 'config' | 'addItem' | 'setValue'>>();
export const registerKit = (kit: Pick<CollectionKit, 'config' | 'addItem' | 'setValue'>): void => {
    byType.set(kit.config.listType, kit);
    byType.set(kit.config.itemType, kit);
};
export const kitOfType = (type: string | undefined) => (type ? byType.get(type) : undefined);

/** defineCollection 으로 만든 목록 노드 타입들 — 관계 칸이 가리킬 수 있는 대상 후보 */
export const kitListTypes = (): string[] => [...new Set([...byType.values()].map((k) => k.config.listType))];
