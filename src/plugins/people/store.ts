/**
 * 명단 화면이 「지금 보고 있는 명단」 하나를 쥔다(달력 scope 와 같은 결).
 *   🔴 ⛔ 저장 안 함 — 「보고 있는 것」은 기기에 안 남긴다. 명단을 열면(탐색기에서 두 번 누르기·open) 그 id 가 된다.
 */
import { useSyncExternalStore } from 'react';

let activeListId: string | null = null;
const listeners = new Set<() => void>();

/** 보고 있는 명단을 바꾼다 — 명단 open 이면 그 id. */
export function setActiveList(id: string | null): void {
    if (activeListId === id) return;
    activeListId = id;
    for (const l of listeners) l();
}

/** 지금 보고 있는 명단 id(없으면 null). */
export function getActiveList(): string | null { return activeListId; }

export function useActiveList(): string | null {
    return useSyncExternalStore(
        (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
        () => activeListId,
        () => activeListId,
    );
}
