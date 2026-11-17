/**
 * 옛 보결 줄(기기 저장소 `plugin.ops-sub.part`) → 노드 이사(T-10fg R13) — 한 번 돌고, 다시 돌려도 같다.
 *   🔴 옛 값은 지우지 않는다(되돌릴 수 있게) — 「옮김」 표시 키만 쓴다. 표시는 일이 끝난 뒤(옮길 게 없어도) 쓴다.
 *   🔴 약속(nodes)이 꺼져 있으면 미룬다(null) — 표시를 쓰지 않으니 켜진 뒤 다시 돈다.
 *   🔴 같은 id 줄이 이미 노드에 있으면 건너뛴다 — 표시를 못 써도 두 번째 이사가 줄을 늘리지 않는다.
 *   옛 저장소에 값이 없을 때 쓰던 데모 줄(seed)은 옮기지 않는다.
 */
import type { NodesApi } from '../../pane-ui-system/core/nodes/contracts/nodes';
import type { SubSlotRow } from './contracts/sub';
import { LS_KEY } from './list/source';
import { SLOT_TYPE, addSlotNode } from './store';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
export interface MoveResult { moved: number; skipped: number; /** 이미 옮겨 둔 뒤라 아무것도 안 했다 */ done: boolean }

export const movedKeyOf = (key: string = LS_KEY): string => `${key}.moved`;
export function isMoved(storage: StorageLike, key: string = LS_KEY): boolean {
    try { return storage.getItem(movedKeyOf(key)) !== null; } catch { return false; }
}

function readOld(storage: StorageLike, key: string): SubSlotRow[] {
    try {
        const raw = storage.getItem(key);
        const p = raw ? JSON.parse(raw) as unknown : null;
        return Array.isArray(p) ? p.filter((r): r is SubSlotRow => !!r && typeof (r as SubSlotRow).id === 'string' && typeof (r as SubSlotRow).date === 'string') : [];
    } catch { return []; }
}

export function moveLocalSlots(nodes: NodesApi, storage: StorageLike, key: string = LS_KEY): MoveResult {
    if (isMoved(storage, key)) return { moved: 0, skipped: 0, done: true };
    const have = new Set(nodes.liveByType(SLOT_TYPE).map((n) => (n.data as SubSlotRow | undefined)?.id));
    let moved = 0;
    let skipped = 0;
    nodes.batch(() => {
        for (const r of readOld(storage, key)) {
            if (have.has(r.id)) { skipped++; continue; }
            
            if (addSlotNode(nodes, r)) { moved++; have.add(r.id); } else skipped++;
        }
    });
    try { storage.setItem(movedKeyOf(key), JSON.stringify({ moved, skipped })); } catch { /* 표시를 못 써도 같은 id 건너뜀이 두 번째 이사를 막는다 */ }
    return { moved, skipped, done: false };
}

/** 기동 때 한 번 시도 — 노드가 꺼져 있거나 이미 옮겼으면 null. */
export function runSlotMigration(nodes: NodesApi | null, storage: StorageLike = localStorage): MoveResult | null {
    if (!nodes || isMoved(storage)) return null;
    return moveLocalSlots(nodes, storage);
}
