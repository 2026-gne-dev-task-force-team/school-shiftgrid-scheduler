/**
 * 캘린더 옵션 스토어 — 설정에서 켜고 끄는 보기 둘(쥔님 2026-11-01 17:23 *"설정에서 껐다 킬수 있는 옵션으로 두는데 기본적으로 꺼져있고"*).
 *   · gantt — 간트 뷰(행은 항목, 열은 날) · dense — 「분기 뷰」(주보다 열이 좁은 시간축, 2주)
 *   값은 host.storage(기기별)에 한 덩어리로 산다. 전환 단추(CalendarTab)와 설정 판이 같은 스토어를 구독한다.
 */
import { useSyncExternalStore } from 'react';
import type { PluginHost } from '../../pane-ui-system/plugin';

export interface CalendarOptions {
    /** 간트 뷰 단추를 보일까 */
    gantt: boolean;
    /** 분기 뷰(2주 시간축) 단추를 보일까 */
    dense: boolean;
}
export const DEFAULT_OPTIONS: CalendarOptions = { gantt: false, dense: false };
const KEY = 'options';

let opts: CalendarOptions = DEFAULT_OPTIONS;
let hostRef: PluginHost | null = null;
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

/** activate 에서 한 번 — 저장된 값을 읽어 온다 */
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
