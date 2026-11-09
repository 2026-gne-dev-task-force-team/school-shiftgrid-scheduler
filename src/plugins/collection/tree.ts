/**
 * 컬렉션 항목 안의 트리 셈(방 안에 방) — 순수 함수(노드·저장을 모른다 · 테스트가 바로 잰다).
 *   🔴 한 항목의 부모는 노드 부모가 아니라 **data 의 parentId 칸**이다(항목은 전부 목록 노드의 납작한 자식).
 *      그래서 중첩은 이 파일이 parentId 사슬로 「다시 그린다」(화면은 레코드 뷰 트리로 들여쓴다).
 *   셋을 쥔다:
 *     · effectiveParentId — parentId 가 **같은 묶음에 살아 있는 항목**을 가리킬 때만 유효(아니면 최상위). 부모 삭제가 여기서 자동으로 「자식 최상위로」가 된다.
 *     · wouldCycle        — id 의 부모를 newParentId 로 두면 순환(자기 자손을 부모로)이 되나.
 */
export interface TreeItem { id: string; parentId?: string }

/** 이 항목의 **유효한** 부모 — parentId 가 같은 묶음에 살아 있는 항목일 때만. 아니면 null(최상위). */
export function effectiveParentId(items: readonly TreeItem[], id: string): string | null {
    const byId = new Map(items.map((r) => [r.id, r]));
    const p = byId.get(id)?.parentId;
    return p && byId.has(p) ? p : null;
}

/** id 의 부모를 newParentId 로 두면 순환이 되나 — newParentId 가 id 자신이거나 id 의 자손이면 참. */
export function wouldCycle(items: readonly TreeItem[], id: string, newParentId: string | null): boolean {
    if (!newParentId) return false;
    if (newParentId === id) return true;
    const byId = new Map(items.map((r) => [r.id, r]));
    let cur: string | null | undefined = newParentId;
    let guard = 0;
    while (cur && guard < 10000) {
        if (cur === id) return true;                 // id 가 newParentId 의 조상 → 자기 자손을 부모로 = 순환
        cur = byId.get(cur)?.parentId ?? null;
        guard++;
    }
    return false;
}
