/**
 * 달력 옵션 스토어 — 설정에서 켜고 끄는 옵션(쥔님 2026-11-01 17:23 *"설정에서 껐다 킬수 있는 옵션으로 두는데 기본적으로 꺼져있고"*).
 *   · experimental — 「시험 기능 보기」. 켜면 시험 모드(분기·3일·하루·간트)가 전환 단추에 다시 보인다.
 *     🔴 2026-11-08 쥔님: 선생님이 실수로 못 켜게, 분기·간트 토글 둘을 이 하나로 합쳤다(년·월·주·일정만 기본).
 *   값은 host.storage(기기별)에 한 덩어리로 산다. 전환 단추(CalendarTab)와 설정 판이 같은 스토어를 구독한다.
 */
import { useSyncExternalStore } from 'react';
import type { PluginHost } from '../../pane-ui-system/plugin';

export interface CalendarOptions {
    /** 시험 기능(분기·3일·하루·간트 보기)을 전환 단추에 보일까 — 기본 꺼짐 */
    experimental: boolean;
}
export const DEFAULT_OPTIONS: CalendarOptions = { experimental: false };
const KEY = 'options';

let opts: CalendarOptions = DEFAULT_OPTIONS;
let hostRef: PluginHost | null = null;
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

/** onActivate 에서 한 번 — 저장된 값을 읽어 온다 */
export function initOptions(host: PluginHost): void {
    hostRef = host;
    const saved = host.storage.get<Partial<CalendarOptions>>(KEY, {});
    opts = { ...DEFAULT_OPTIONS, ...saved };
    emit();
}

export function setOption<K extends keyof CalendarOptions>(key: K, value: CalendarOptions[K]): void {
    if (opts[key] === value) return;
    opts = { ...opts, [key]: value };
    hostRef?.storage.set(KEY, opts);
    emit();
}

export function useOptions(): CalendarOptions {
    return useSyncExternalStore(
        (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
        () => opts,
        () => opts,
    );
}

// ── 범위 저장소(scope) — 저장소를 열면 그 저장소(+자손)만 보이게. 전체면 null. ──
//    🔴 ⛔ 저장 안 함(anchor·mode 와 같은 결 — 「보고 있는 것」은 기기에 안 남긴다). 쥔님 2026-11-02:
//       *"일정 저장소 클릭해서 열리면 그 일정 저장소에 대한 거만 보여줘야지. 그 하위 일정저장소가 있다면 그거 포함해서"*.
let scopeStoreId: string | null = null;
const scopeListeners = new Set<() => void>();

/** 범위 저장소를 바꾼다 — 저장소 open(탐색기 한 번 누르기·「달력에서 열기」)이면 그 id, 리본 「달력 열기」면 null(전체). */
export function setScope(id: string | null): void {
    if (scopeStoreId === id) return;
    scopeStoreId = id;
    for (const l of scopeListeners) l();
}

/** 지금 범위 저장소 id(없으면 null) — 뷰 밖(nodes.createEvent 기본 저장소)에서 읽는다. */
export function getScope(): string | null { return scopeStoreId; }

export function useScope(): string | null {
    return useSyncExternalStore(
        (l) => { scopeListeners.add(l); return () => { scopeListeners.delete(l); }; },
        () => scopeStoreId,
        () => scopeStoreId,
    );
}
