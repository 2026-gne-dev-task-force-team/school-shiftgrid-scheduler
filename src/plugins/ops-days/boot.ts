/**
 * 옛 학사 자료 이사를 기동 때 돌리는 다리(T-10fb) — 활성 때 한 번 + 노드가 바뀔 때·약속이 늦게 켜질 때 다시 시도한다.
 *   🔴 약속(calendar·nodes)이 하나라도 꺼져 있으면 미룬다 — 표시 키를 쓰지 않으니 켜진 뒤 다시 돈다. 두 번 돌아도 같다.
 */
import type { NodesApi } from '../../pane-ui-system/core/nodes/contracts/nodes';
import type { Disposable, PluginHost } from '../../pane-ui-system/plugin';
import type { Calendar } from '../calendar/contracts/calendar';
import { ACADEMIC_PRESET, isMoved, moveDaysToCalendar, type MoveResult, type StorageLike } from './academic';

/** 한 번 시도 — 미뤘으면 null, 돌았으면 결과. */
export function runDaysMigration(host: Pick<PluginHost, 'modules'>, storage: StorageLike = localStorage): MoveResult | null {
    const calendar = host.modules.use<Calendar>('calendar');
    const nodes = host.modules.use<NodesApi>('nodes');
    if (!calendar || !nodes) return null;
    if (isMoved(storage)) return null;
    return moveDaysToCalendar({ calendar, nodes }, storage);
}

export function initDaysMigration(host: PluginHost, storage?: StorageLike): Disposable {
    const attempt = () => { try { runDaysMigration(host, storage); } catch { /* 이사 실패가 켜짐을 막지 않는다 */ } };
    attempt();
    const sub = host.modules.use<NodesApi>('nodes')?.subscribe(attempt);
    return { dispose: () => { sub?.dispose(); } };
}

/** 프리셋 등록 — 달력이 꺼져 있으면 null. */
export const registerAcademicPreset = (host: Pick<PluginHost, 'modules'>): Disposable | null => host.modules.use<Calendar>('calendar')?.registerPreset(ACADEMIC_PRESET) ?? null;
