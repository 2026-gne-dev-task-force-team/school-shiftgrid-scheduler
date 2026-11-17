/**
 * 상태바 한 귀퉁이 — 「편성 막힘 N건」. 정본이 비어 편성이 안 되는 까닭이 있을 때만 보인다(경고등은 있을 때만).
 *   마우스를 올리면 까닭이 선생님 말로 줄줄이 뜬다. 정본(교직원·학교·과목·시수표·일과표)이 바뀌면 다시 센다.
 */
import { useEffect, useState } from 'react';
import type { PluginHost } from '../../pane-ui-system/plugin';
import type { Clock } from '../bell/contracts/clock';
import type { Duty } from '../duty/contracts/duty';
import type { NodesApi } from '../../pane-ui-system/core/nodes/contracts/nodes';
import type { PlanBlocker } from './contracts/solver';
import { readAndBuild, canonSourcesFromHost } from './read-canon';

/** 지금 정본에서 편성 막힘을 센다. 시간·복무 셈 약속이 꺼져 있으면 그 사실이 막힘이다. */
export function blockersOfHost(host: PluginHost): PlanBlocker[] {
    const clock = host.modules.use<Clock>('clock');
    const duty = host.modules.use<Duty>('duty');
    if (!clock || !duty) {
        return [{ code: 'calc-off', level: 'stop', message: `${!clock ? '일과표' : '복무'} 플러그인이 꺼져 있어 시간을 셀 수 없습니다` }];
    }
    return readAndBuild(canonSourcesFromHost(host), { clock, duty }).blockers;
}

export const stopsOf = (bs: readonly PlanBlocker[]): PlanBlocker[] => bs.filter((b) => b.level === 'stop');

export function BlockersBadge({ host }: { host: PluginHost }) {
    const [list, setList] = useState<PlanBlocker[]>([]);
    useEffect(() => {
        const recount = () => setList(blockersOfHost(host));
        recount();
        const offs = [
            host.modules.use<NodesApi>('nodes')?.subscribe(recount),
            ...(['staff', 'school', 'subjects', 'rooms'] as const).map((n) =>
                host.modules.use<{ onChange(fn: () => void): { dispose(): void } }>(n)?.onChange(recount)),
        ];
        return () => { for (const o of offs) o?.dispose(); };
    }, [host]);
    const stops = stopsOf(list);
    if (stops.length === 0) return null;
    return (
        <span data-testid="solver-blockers" className="tabular-nums select-none" title={list.map((b) => `${b.level === 'stop' ? '막힘' : '참고'}: ${b.message}`).join('\n')}>
            편성 막힘 {stops.length}건
        </span>
    );
}
