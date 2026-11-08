/**
 * 방 안에 방 — 순수 트리 셈(노드·저장을 모른다 · 테스트가 바로 잰다).
 *   🔴 방 하나의 부모는 노드 부모가 아니라 **data 의 parentId 칸**이다(방은 전부 목록 노드의 납작한 자식 — people 과 같은 꼴).
 *      그래서 중첩은 이 파일이 parentId 사슬로 「다시 그린다」(화면은 depth 로 들여쓴다).
 *
 *   세 가지를 쥔다:
 *     · effectiveParentId — parentId 가 **같은 목록에 살아 있는 방**을 가리킬 때만 유효(아니면 최상위). 부모 삭제가 여기서 자동으로 「자식 최상위로」가 된다.
 *     · buildRoomTree     — 뿌리(최상위)부터 깊이 우선으로 펼친 [{방, depth}] (형제 순서 = 노드 순서 유지).
 *     · wouldCycle        — id 의 부모를 newParentId 로 두면 순환(자기 자손을 부모로)이 되나.
 */
import type { Room } from './contracts/rooms';

/** 이 방의 **유효한** 부모 — parentId 가 같은 묶음에 살아 있는 방일 때만. 아니면 null(최상위). */
export function effectiveParentId(rooms: readonly Room[], id: string): string | null {
    const byId = new Map(rooms.map((r) => [r.id, r]));
    const p = byId.get(id)?.parentId;
    return p && byId.has(p) ? p : null;
}

export interface RoomRow {
    room: Room;
    /** 중첩 깊이(0 = 최상위). 화면이 이만큼 들여쓴다. */
    depth: number;
}

/**
 * 방들을 「방 안에 방」 트리 순서로 펼친다 — 뿌리부터 깊이 우선, 형제는 들어온 순서(노드 순서) 그대로.
 *   🔴 부모가 사라진(휴지통으로 간) 방의 자식은 최상위로 올라온다(effectiveParentId 가 null 을 주니 뿌리가 된다).
 *   방어: 저장 데이터에 사이클이 있어 뿌리에서 못 닿은 방도 최상위로 건진다(보통 setParent 가 막아 안 생긴다).
 */
export function buildRoomTree(rooms: readonly Room[]): RoomRow[] {
    const byId = new Map(rooms.map((r) => [r.id, r]));
    const kids = new Map<string | null, Room[]>();
    for (const r of rooms) {
        const p = r.parentId && byId.has(r.parentId) ? r.parentId : null;   // 유효하지 않은 부모 → 최상위
        const arr = kids.get(p);
        if (arr) arr.push(r); else kids.set(p, [r]);
    }
    const out: RoomRow[] = [];
    const seen = new Set<string>();
    const walk = (r: Room, depth: number): void => {
        if (seen.has(r.id)) return;
        seen.add(r.id);
        out.push({ room: r, depth });
        for (const c of kids.get(r.id) ?? []) walk(c, depth + 1);
    };
    for (const r of kids.get(null) ?? []) walk(r, 0);
    for (const r of rooms) if (!seen.has(r.id)) walk(r, 0);   // 방어: 사이클로 못 닿은 방
    return out;
}

/** id 의 부모를 newParentId 로 두면 순환이 되나 — newParentId 가 id 자신이거나 id 의 자손이면 참. */
export function wouldCycle(rooms: readonly Room[], id: string, newParentId: string | null): boolean {
    if (!newParentId) return false;
    if (newParentId === id) return true;
    const byId = new Map(rooms.map((r) => [r.id, r]));
    let cur: string | null | undefined = newParentId;
    let guard = 0;
    while (cur && guard < 10000) {
        if (cur === id) return true;                 // id 가 newParentId 의 조상 → 자기 자손을 부모로 = 순환
        cur = byId.get(cur)?.parentId ?? null;
        guard++;
    }
    return false;
}
