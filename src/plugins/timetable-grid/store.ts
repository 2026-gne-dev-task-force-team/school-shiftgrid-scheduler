/**
 * 그리드 화면이 「지금 보고 있는 시간표」 하나(시간표든 특별이든)를 쥔다 — 달력 scope·명단 active 와 같은 결.
 *   🔴 ⛔ 저장 안 함(기기에 안 남긴다). 탐색기에서 시간표를 열면(두 번 누르기·open) 그 노드 id 가 된다.
 */
import { useSyncExternalStore } from 'react';

let activeId: string | null = null;
const listeners = new Set<() => void>();

export function setActiveSheet(id: string | null): void {
    if (activeId === id) return;
    activeId = id;
    for (const l of listeners) l();
}

export function getActiveSheet(): string | null { return activeId; }

export function useActiveSheet(): string | null {
    return useSyncExternalStore(
        (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
        () => activeId,
        () => activeId,
    );
}
