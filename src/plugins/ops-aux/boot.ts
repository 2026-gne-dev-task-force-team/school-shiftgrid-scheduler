/**
 * 옛 근태 명부 이사를 기동 때 돌리는 다리(T-10f7) — 활성 때 한 번 + 노드가 바뀔 때·약속이 늦게 켜질 때 다시 시도한다.
 *   🔴 nodes·staff 약속이 꺼져 있으면 미룬다 — 옮김 표시 키를 쓰지 않으니 켜진 뒤 다시 돈다.
 *   🔴 이미 옮김 표시가 있으면 다시 안 한다(교직원 명단에서 지운 사람이 되살아나지 않게). 두 번 돌아도 같다(f_aux_id 로 건너뜀).
 */
import type { NodesApi } from '../../pane-ui-system/core/nodes/contracts/nodes';
import type { Disposable, PluginHost } from '../../pane-ui-system/plugin';
import { moveLocalAuxStaff, staffMoved } from './migrate';
import { movePartToStorage } from './partmove';
import { dutyMoved, dutyPreset, moveDutyToCalendar } from './duty';
import { readStoredPart } from './source';
import type { Calendar } from '../calendar/contracts/calendar';

/** 옛 기기 저장소 — 읽기만 한다. */
type StorageLike = Pick<Storage, 'getItem'>;

/** 한 번 시도 — 미뤘거나 이미 옮겼으면 null, 돌았으면 새로 만든 수. */
export function runAuxMigration(host: Pick<PluginHost, 'modules' | 'storage'>, storage: StorageLike = localStorage): number | null {
    // R17 — 옛 기기 저장소 → 호스트 저장(약속과 무관하게 먼저 한 번).
    try { movePartToStorage(host.storage, storage); } catch { /* 저장소 막힘 — 이사 실패가 켜짐을 막지 않는다 */ }
    const nodes = host.modules.use<NodesApi>('nodes');
    // R16 — 옛 배정·예외 → 달력 일정(calendar·nodes 약속이 꺼져 있으면 미룸 · 표시가 있으면 다시 안 함).
    const calendar = host.modules.use<Calendar>('calendar');
    if (calendar && nodes && !dutyMoved(host.storage)) {
        try { moveDutyToCalendar({ calendar, nodes }, host.storage, readStoredPart(host.storage)); } catch { /* 이사 실패가 켜짐을 막지 않는다 */ }
    }
    const staffUp = () => host.modules.use('staff') !== null;
    if (!nodes || !staffUp()) return null;
    if (staffMoved(host.storage, storage)) return null;
    return moveLocalAuxStaff(nodes, storage, host.storage, staffUp);
}

/** 활성(index.ts)이 한 번 — 바로 시도하고, 노드가 바뀔 때마다 다시 시도한다(표시가 서면 조용히 지나간다). */
export function initAuxMigration(host: Pick<PluginHost, 'modules' | 'storage'>, storage?: StorageLike): Disposable {
    const attempt = () => { try { runAuxMigration(host, storage); } catch { /* 이사 실패가 켜짐을 막지 않는다 */ } };
    attempt();
    const sub = host.modules.use<NodesApi>('nodes')?.subscribe(attempt);
    return { dispose: () => { sub?.dispose(); } };
}

/** 달력 프리셋 「근태」 등록 — 달력이 꺼져 있으면 null. 마감 목록은 호스트 저장에서 그때그때 읽는다(월 마감은 ops-aux 에 남는다). */
export const registerDutyPreset = (host: Pick<PluginHost, 'modules' | 'storage'>): Disposable | null =>
    host.modules.use<Calendar>('calendar')?.registerPreset(dutyPreset(() => readStoredPart(host.storage)?.monthClose ?? [])) ?? null;
