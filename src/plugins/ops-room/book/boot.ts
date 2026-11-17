/**
 * 옛 예약 이사를 기동 때 돌리는 다리(T-10f7) — 활성 때 한 번 + 노드가 바뀔 때·약속이 늦게 켜질 때 다시 시도한다.
 *   🔴 약속(calendar·rooms·nodes)이 하나라도 꺼져 있으면 미룬다 — 표시 키를 쓰지 않으니 켜진 뒤 다시 돈다.
 *   🔴 옛 값이 있는데 방 목록이 아직 비어 있으면(rooms 가 덜 떴으면) 미룬다 — 지금 돌리면 전부 「건너뜀」 으로 표시돼 영영 못 옮긴다.
 *   🔴 두 번 돌아도 같다 — moveLocalReservations 가 옮김 표시로 바로 돌아온다. ⛔ 남의 조각은 약속 타입으로만.
 */
import type { NodesApi } from '../../../pane-ui-system/core/nodes/contracts/nodes';
import type { Disposable, PluginHost } from '../../../pane-ui-system/plugin';
import type { Calendar } from '../../calendar/contracts/calendar';
import type { Rooms } from '../../rooms/contracts/rooms';
import { LS_KEY, isMoved, moveLocalReservations, type MoveResult, type StorageLike } from './migrate';

/** 한 번 시도 — 미뤘으면 null, 돌았으면 결과. */
export function runRoomMigration(host: Pick<PluginHost, 'modules'>, storage: StorageLike = localStorage): MoveResult | null {
    const calendar = host.modules.use<Calendar>('calendar');
    const rooms = host.modules.use<Rooms>('rooms');
    const nodes = host.modules.use<NodesApi>('nodes');
    if (!calendar || !rooms || !nodes) return null;
    if (isMoved(storage)) return null;
    let hasOld = false;
    try { hasOld = !!storage.getItem(LS_KEY); } catch { /* 저장소 막힘 — 옛 값 없음 */ }
    if (hasOld && rooms.lists().length === 0) return null;
    return moveLocalReservations({ calendar, nodes, rooms }, storage);
}

/** 활성(index.ts)이 한 번 — 바로 시도하고, 노드가 바뀔 때마다 다시 시도한다(옮김 표시가 서면 조용히 지나간다). */
export function initRoomMigration(host: PluginHost, storage?: StorageLike): Disposable {
    const attempt = () => { try { runRoomMigration(host, storage); } catch { /* 이사 실패가 켜짐을 막지 않는다 */ } };
    attempt();
    const nodes = host.modules.use<NodesApi>('nodes');
    const sub = nodes?.subscribe(attempt);
    return { dispose: () => { sub?.dispose(); } };
}
