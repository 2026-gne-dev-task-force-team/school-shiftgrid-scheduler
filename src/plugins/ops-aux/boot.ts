/**
 * 옛 근태 명부 이사를 기동 때 돌리는 다리(T-10f7) — 활성 때 한 번 + 노드가 바뀔 때·약속이 늦게 켜질 때 다시 시도한다.
 *   🔴 nodes·staff 약속이 꺼져 있으면 미룬다 — 옮김 표시 키를 쓰지 않으니 켜진 뒤 다시 돈다.
 *   🔴 이미 옮김 표시가 있으면 다시 안 한다(교직원 명단에서 지운 사람이 되살아나지 않게). 두 번 돌아도 같다(f_aux_id 로 건너뜀).
 */
import type { NodesApi } from '../../pane-ui-system/core/nodes/contracts/nodes';
import type { Disposable, PluginHost } from '../../pane-ui-system/plugin';
import { LS_KEY, moveLocalAuxStaff, movedKeyOf } from './migrate';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** 한 번 시도 — 미뤘거나 이미 옮겼으면 null, 돌았으면 새로 만든 수. */
export function runAuxMigration(host: Pick<PluginHost, 'modules'>, storage: StorageLike = localStorage): number | null {
    const nodes = host.modules.use<NodesApi>('nodes');
    const staffUp = () => host.modules.use('staff') !== null;
    if (!nodes || !staffUp()) return null;
    try { if (storage.getItem(movedKeyOf(LS_KEY)) !== null) return null; } catch { /* 저장소 막힘 — 옮길 것도 없다 */ return null; }
    return moveLocalAuxStaff(nodes, storage, staffUp);
}

/** 활성(index.ts)이 한 번 — 바로 시도하고, 노드가 바뀔 때마다 다시 시도한다(표시가 서면 조용히 지나간다). */
export function initAuxMigration(host: PluginHost, storage?: StorageLike): Disposable {
    const attempt = () => { try { runAuxMigration(host, storage); } catch { /* 이사 실패가 켜짐을 막지 않는다 */ } };
    attempt();
    const sub = host.modules.use<NodesApi>('nodes')?.subscribe(attempt);
    return { dispose: () => { sub?.dispose(); } };
}
