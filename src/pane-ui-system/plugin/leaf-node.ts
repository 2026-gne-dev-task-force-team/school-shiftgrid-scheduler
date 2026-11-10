/**
 * useLeafNode — 탭(leaf)이 「어느 노드를 보고 있나」를 새로고침 너머로 기억한다.
 *   배경: 노드를 여는 화면들은 「보고 있는 노드 id」를 모듈 전역(store)에 쥔다 — 저장 안 함이라 새로고침하면 null,
 *   탭 이름(leaf.title)만 저장돼 「탭 이름은 있는데 내용은 시작 화면」이 됐다(QA 1바퀴).
 *   해법: leaf id → 노드 id 를 localStorage 한 키에 적어 두고, 전역이 비어 있으면 거기서 복원한다.
 *   🔴 전역이 이미 있으면(이번 세션에서 열었다) 전역이 이긴다 · 시작 화면(null)은 적지 않는다(마지막 노드를 지우지 않는다).
 *   노드가 이미 없어졌으면(영구 삭제) 호출 쪽의 「노드 없음 → 시작 화면」 분기가 그대로 받는다.
 */
import { useEffect } from 'react';
import { storageKey } from '../storage';

const KEY = 'leaf-node';

function readAll(): Record<string, string> {
    try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey(KEY)) : null;
        const v = raw ? JSON.parse(raw) : null;
        return v && typeof v === 'object' ? (v as Record<string, string>) : {};
    } catch { return {}; }
}

export function readLeafNode(leafId: string | undefined): string | null {
    if (!leafId) return null;
    const v = readAll()[leafId];
    return typeof v === 'string' && v ? v : null;
}

export function writeLeafNode(leafId: string, nodeId: string): void {
    try {
        const all = readAll();
        if (all[leafId] === nodeId) return;
        all[leafId] = nodeId;
        localStorage.setItem(storageKey(KEY), JSON.stringify(all));
    } catch { /* 저장 못 해도 화면은 돈다 */ }
}

/** 지금 보여 줄 노드 id 를 돌려준다(전역 ?? 저장된 값). 전역이 비어 복원했으면 setActive 로 전역도 채운다. */
export function useLeafNode(leafId: string | undefined, activeId: string | null, setActive: (id: string) => void): string | null {
    const stored = activeId ? null : readLeafNode(leafId);
    useEffect(() => {
        if (!leafId) return;
        if (activeId) writeLeafNode(leafId, activeId);
        else if (stored) setActive(stored);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [leafId, activeId, stored]);
    return activeId ?? stored;
}
