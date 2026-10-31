/**
 * 스케줄 임시 보관 — 🔴 ⭐ 갈아끼울 자리를 한 함수로 모은 곳.
 *
 *   지금(P4): 기기별 host.storage(localStorage · plugin.scheduler.schedule).
 *   나중(P3 머지 뒤): host.doc 로 갈아탄다 — 이 두 함수의 속만 바꾸면 되고, 스토어·뷰는 안 건드린다.
 *     → loadSchedule: host.doc.get().plugins.scheduler
 *     → saveSchedule: host.doc.update((d) => { d.plugins.scheduler = s })   (저장 단추는 호스트 몫)
 *
 * ⛔ 자동 저장이 "열어 둔 파일을 덮는" 일은 P3 의 임시 보관이 막는다 — 지금은 기기 localStorage 라 파일이 없다.
 */
import type { PluginHost } from '../../pane-ui-system/plugin';
import type { Schedule } from './model';
import { defaultSchedule } from './model';

const KEY = 'schedule';

/** 저장된 스케줄 — 모양이 깨졌으면 기본 스케줄. */
export function loadSchedule(host: PluginHost): Schedule {
    const raw = host.storage.get<Schedule | null>(KEY, null);
    if (raw && typeof raw === 'object' && Array.isArray(raw.rows) && Array.isArray(raw.cols) && Array.isArray(raw.cards)) {
        return raw;
    }
    return defaultSchedule();
}

/** 스케줄을 기기별로 보관한다(갈아끼울 자리). */
export function saveSchedule(host: PluginHost, schedule: Schedule): void {
    host.storage.set(KEY, schedule);
}
