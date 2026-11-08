/**
 * 표 화면이 「지금 보고 있는 표 노드」 하나를 쥔다(명단·달력 scope 와 같은 결).
 *   🔴 ⛔ 저장 안 함 — 「보고 있는 것」은 기기에 안 남긴다. 표 노드를 열면(탐색기에서 두 번 누르기·open) 그 id 가 된다.
 */
import { useSyncExternalStore } from 'react';

let activeTableId: string | null = null;
const listeners = new Set<() => void>();

export function setActiveTable(id: string | null): void {
    if (activeTableId === id) return;
    activeTableId = id;
    for (const l of listeners) l();
}

export function getActiveTable(): string | null { return activeTableId; }

export function useActiveTable(): string | null {
    return useSyncExternalStore(
        (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
        () => activeTableId,
        () => activeTableId,
    );
}
