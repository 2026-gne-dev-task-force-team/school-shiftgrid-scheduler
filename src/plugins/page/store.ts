/**
 * 「지금 보고 있는 페이지」 하나를 쥔다 — 시간표 그리드 store 와 같은 결.
 *   🔴 ⛔ 저장 안 함(기기에 안 남긴다). 탐색기에서 페이지를 열면 그 노드 id 가 된다.
 */
import { useSyncExternalStore } from 'react';

let activeId: string | null = null;
const listeners = new Set<() => void>();

export function setActivePage(id: string | null): void {
    if (activeId === id) return;
    activeId = id;
    for (const l of listeners) l();
}

export function getActivePage(): string | null { return activeId; }

export function useActivePage(): string | null {
    return useSyncExternalStore(
        (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
        () => activeId,
        () => activeId,
    );
}
