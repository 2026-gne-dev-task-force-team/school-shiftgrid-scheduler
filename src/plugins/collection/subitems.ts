/**
 * 하위 항목(sub-items) 순수 로직 — 행 밑에 행. React·노드 0줄(vitest 가 덮는다).
 *   🔴 저장 꼴은 「행 노드 아래 행 노드」(nodes.ts). 여기는 그 중첩을 화면에 어떻게 펴 보일지만 계산한다.
 *   ⭐ 트리는 「수동 순서」일 때만 보인다 — 정렬·필터·검색이 걸리면 평평해진다(노션과 같다 · deriveRows 가 그 평평한 목록을 만든다).
 */

/** 화면에 펴 보일 한 줄 — 원래 행 + 들여쓰기 깊이 + 자식이 있나(접기 삼각형용). */
export interface TreeRow<T> {
    row: T;
    depth: number;
    hasChildren: boolean;
}

/**
 * 부모 사전으로 트리를 만들어 깊이-우선 순서로 편다(순수).
 *   - 형제 순서 = records 에 들어온 순서(= 노드 children 순서).
 *   - 부모 id 가 null 이거나 이 목록에 없으면(유령 부모) 뿌리로 본다 — 자식이 미아가 되지 않는다.
 *   - 접힌(collapsed) 행의 자손은 건너뛴다. hasChildren 은 접힘과 무관하게 「자식이 있나」다.
 *   🔴 순환(스스로가 제 조상)은 한 번 그린 id 를 다시 안 그려 무한 루프를 막는다.
 */
export function buildTree<T>(
    records: readonly T[],
    getId: (r: T) => string,
    getParent: (r: T) => string | null,
    isCollapsed: (id: string) => boolean,
): TreeRow<T>[] {
    const present = new Set(records.map(getId));
    const kids = new Map<string | null, T[]>();
    for (const r of records) {
        const p = getParent(r);
        const key = p !== null && present.has(p) ? p : null;   // 유령 부모 → 뿌리
        (kids.get(key) ?? kids.set(key, []).get(key)!).push(r);
    }
    const hasKids = (id: string) => (kids.get(id)?.length ?? 0) > 0;
    // 뿌리(null)에서 접힘을 무시하고 닿을 수 있는 id — 이 바깥은 순수 순환이라 뿌리로 올려 준다(접힘으로 숨은 것과 구별).
    const reachable = new Set<string>();
    const mark = (parent: string | null) => {
        for (const r of kids.get(parent) ?? []) {
            const id = getId(r);
            if (reachable.has(id)) continue;
            reachable.add(id);
            mark(id);
        }
    };
    mark(null);

    const out: TreeRow<T>[] = [];
    const seen = new Set<string>();
    const walk = (parent: string | null, depth: number) => {
        for (const r of kids.get(parent) ?? []) {
            const id = getId(r);
            if (seen.has(id)) continue;   // 순환 방어
            seen.add(id);
            out.push({ row: r, depth, hasChildren: hasKids(id) });
            if (!isCollapsed(id)) walk(id, depth + 1);
        }
    };
    walk(null, 0);
    // 뿌리에서 못 닿은 행(순수 순환)만 미아로 버리지 않고 뿌리로 그린다 — 접힘으로 숨은 자손은 건드리지 않는다.
    for (const r of records) {
        const id = getId(r);
        if (seen.has(id) || reachable.has(id)) continue;
        seen.add(id);
        out.push({ row: r, depth: 0, hasChildren: hasKids(id) });
        if (!isCollapsed(id)) walk(id, 1);
    }
    return out;
}
