/**
 * 달력 프리셋 레지스트리(약속 calendar 0.2) — 저장소 노드 `data.preset` 이 가리키는 「생긴 것·낱말·첫 화면·미리 깔린 칸」.
 *   🔴 못 찾으면(프리셋 플러그인이 꺼짐·옛 저장소) 「기본 달력」 — 데이터는 그대로, 낱말만 돌아간다.
 *   ⭐ feed.ts 와 같은 결의 모듈 전역 싱글턴 — 테스트 격리는 __resetPresets 로.
 */
import { useSyncExternalStore } from 'react';
import type { Disposable } from '../../pane-ui-system/plugin';
import type { CalendarPreset } from './contracts/calendar';
import { EVENT_CONFIG } from './config';
import { getNodesApi } from './nodes';
import { useScope } from './store';

/** 「기본 달력」 — 지금 낱말·칸 그대로(행동 변화 0). */
export const DEFAULT_PRESET: CalendarPreset = {
    id: 'calendar.default',
    label: '달력',
    icon: EVENT_CONFIG.listIcon,
    words: { store: EVENT_CONFIG.listLabel, event: '일정', newEvent: '새 일정', unit: EVENT_CONFIG.unit },
    start: { description: EVENT_CONFIG.text.startDescription, hint: EVENT_CONFIG.text.startHint },
};

let presets = new Map<string, CalendarPreset>();
let version = 0;
const listeners = new Set<() => void>();
function emit(): void { version++; for (const l of listeners) l(); }

/** 프리셋 등록 — 같은 id 를 다시 등록하면 뒤엣것이 이긴다. 해제는 멱등이고, 그 사이 덮어쓴 것은 안 지운다. */
export function registerPreset(preset: CalendarPreset): Disposable {
    presets.set(preset.id, preset);
    emit();
    return {
        dispose() {
            if (presets.get(preset.id) !== preset) return;
            presets.delete(preset.id);
            emit();
        },
    };
}

/** 저장소의 프리셋 — storeId 가 없거나 data.preset 을 못 찾으면 기본 달력. */
export function presetOf(storeId: string | null | undefined): CalendarPreset {
    if (!storeId) return DEFAULT_PRESET;
    const id = (getNodesApi()?.get(storeId)?.data as { preset?: unknown } | undefined)?.preset;
    return (typeof id === 'string' && presets.get(id)) || DEFAULT_PRESET;
}

/** 뷰용 — 프리셋 등록·해제 때 다시 그린다(저장소 노드 변화는 useCalendarData 가 깨운다). */
export function usePreset(storeId: string | null | undefined): CalendarPreset {
    useSyncExternalStore(
        (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
        () => version,
        () => version,
    );
    return presetOf(storeId);
}

/** 지금 범위 저장소의 낱말 — 전체 보기(범위 없음)면 기본 달력. */
export function useWords(): CalendarPreset['words'] { return usePreset(useScope()).words; }

/** 🔴 테스트 격리용. */
export function __resetPresets(): void {
    presets = new Map();
    version = 0;
    listeners.clear();
}
