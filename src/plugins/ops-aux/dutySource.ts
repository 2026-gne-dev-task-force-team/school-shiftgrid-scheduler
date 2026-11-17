/**
 * 근태 창구에 「달력」을 덧댄다(R16 · T-10fr) — 배정(day)·예외(exceptions)는 달력 일정에서 읽고 쓰고, 나머지 칸은 아래 창구(호스트 저장)가 그대로 맡는다.
 *   🔴 달력·노드 약속이 꺼져 있거나 근태 저장소가 아직 없으면 아래 창구만 쓴다(이사 전 · 옛 값 그대로).
 *   🔴 쓸 때 옛 호스트 저장의 배정·예외는 건드리지 않는다(지우지 않는 이사). 월 마감 판정은 부르는 쪽(`applyAuxOps`)이 먼저 한다.
 */
import type { NodesApi } from '../../pane-ui-system/core/nodes/contracts/nodes';
import type { PluginHost } from '../../pane-ui-system/plugin';
import type { Calendar } from '../calendar/contracts/calendar';
import { readDuty, writeDuty, type DutyDeps } from './duty';
import { auxSourceFor, type AuxSource, type PartStore } from './source';

type Modules = Pick<PluginHost['modules'], 'use'>;
const depsOf = (m: Modules): DutyDeps | null => {
    const calendar = m.use<Calendar>('calendar');
    const nodes = m.use<NodesApi>('nodes');
    return calendar && nodes ? { calendar, nodes } : null;
};

export function withDuty(base: AuxSource, modules: Modules): AuxSource {
    return {
        ...base,
        load: async () => {
            const part = await base.load();
            const deps = depsOf(modules);
            const duty = deps ? readDuty(deps.nodes) : null;
            return duty ? { ...part, day: duty.day, exceptions: duty.exceptions } : part;
        },
        save: async (next) => {
            const deps = depsOf(modules);
            if (!deps || !writeDuty(deps, next)) { await base.save(next); return; }
            const stored = await base.load();
            await base.save({ ...next, day: stored.day, exceptions: stored.exceptions });
        },
        subscribe: (fn) => {
            const a = base.subscribe?.(fn);
            const b = modules.use<NodesApi>('nodes')?.subscribe(fn);
            return () => { a?.(); b?.dispose(); };
        },
    };
}

/** 호스트(저장·약속)마다 한 창구 — 화면·상태바 배지가 구독을 나눈다. */
const byStore = new WeakMap<object, AuxSource>();
export function auxSourceOfHost(host: Pick<PluginHost, 'modules' | 'storage'>): AuxSource | undefined {
    if (!host.storage) return undefined;   // 호스트 저장이 없으면(단독 그림·시험) 화면이 기본 창구를 쓴다
    const store = host.storage as PartStore;
    let src = byStore.get(store);
    if (!src) { src = withDuty(auxSourceFor(store), host.modules); byStore.set(store, src); }
    return src;
}
