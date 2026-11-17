/**
 * 보결 명단 → 교직원 명단(staff) 값 이사(R4 · T-10ey) — 한 번 돌고, 다시 돌려도 같은 결과.
 *   🔴 옛 노드(substitute.list·substitute.staff)는 지우지 않는다 — data.movedTo 에 새 노드 id 만 적는다(「옮김」 표시).
 *     표시를 지우면 다시 옮기고, 옛 값은 그대로라 되돌릴 수 있다.
 *   🔴 새 노드 타입 이름은 글자로만 안다(남의 조각 값 import 금지 · 구조 검사). 칸 key·값은 그대로 복사한다 — 구분 value 가 두 조각에서 같다.
 *   ⛔ NodesApi 하나로만. staff 가 꺼져 있어 새 타입이 없으면 아무것도 안 하고 0 을 돌려준다(켜진 뒤 다시 돈다).
 */
import type { NodesApi } from '../../pane-ui-system/core/nodes/contracts/nodes';

export const OLD_LIST_TYPE = 'substitute.list';
export const OLD_ITEM_TYPE = 'substitute.staff';
const NEW_LIST_TYPE = 'staff.list';
const NEW_ITEM_TYPE = 'staff.member';
/** 옛 노드 data 에 적는 「옮김」 표시 — 값은 새 노드 id. */
export const MOVED_KEY = 'movedTo';

const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)) as T);
const dataOf = (nodes: NodesApi, id: string): Record<string, unknown> => ((nodes.get(id)?.data ?? {}) as Record<string, unknown>);
export const movedTo = (nodes: NodesApi, id: string): string | undefined => {
    const v = dataOf(nodes, id)[MOVED_KEY];
    return typeof v === 'string' && v !== '' ? v : undefined;
};

/**
 * 옮긴 것 수(새 노드를 만든 수 · 이미 옮겨진 것은 안 센다) — 두 번째부터는 0.
 *   staffUp = 교직원 명단(staff)이 켜져 있나 — 꺼져 있으면(새 타입이 안 꽂혀 있으면) 0 으로 돌아온다(주면 켜졌다고 본다).
 */
export function migrateSubstituteToStaff(nodes: NodesApi, staffUp: () => boolean = () => true): number {
    if (!staffUp()) return 0;
    let made = 0;
    const mark = (oldId: string, newId: string) => nodes.setData(oldId, { ...dataOf(nodes, oldId), [MOVED_KEY]: newId });

    /** 옛 명단 하나의 새 짝 id — 없으면 만든다(부모가 옛 명단이면 그 짝 밑으로). 못 만들면 ''. */
    const ensureList = (oldId: string, depth = 0): string => {
        const done = movedTo(nodes, oldId);
        if (done && nodes.get(done)) return done;
        if (depth > 20) return '';
        const old = nodes.get(oldId);
        if (!old) return '';
        let parent = nodes.parent(oldId) ?? nodes.roots.main;
        if (nodes.get(parent)?.type === OLD_LIST_TYPE) parent = ensureList(parent, depth + 1);
        if (!parent) return '';
        const newId = nodes.create(parent, { type: NEW_LIST_TYPE, name: old.name, data: stripMark(clone(old.data)) });
        if (!newId) return '';
        mark(oldId, newId);
        made++;
        return newId;
    };

    nodes.batch(() => {
        for (const list of nodes.byType(OLD_LIST_TYPE)) {
            if (nodes.isTrashed(list.id)) continue;
            const target = ensureList(list.id);
            if (!target) continue;
            for (const it of nodes.children(list.id)) {
                if (it.type !== OLD_ITEM_TYPE || nodes.isTrashed(it.id)) continue;
                const done = movedTo(nodes, it.id);
                if (done && nodes.get(done)) continue;
                const newId = nodes.create(target, { type: NEW_ITEM_TYPE, name: it.name, data: stripMark(clone(it.data)) });
                if (!newId) continue;
                mark(it.id, newId);
                made++;
            }
        }
    });
    return made;
}

/** 새 노드로 복사할 data 에서 「옮김」 표시는 뺀다. */
function stripMark(d: unknown): unknown {
    if (!d || typeof d !== 'object') return d;
    const { [MOVED_KEY]: _m, ...rest } = d as Record<string, unknown>;
    return rest;
}
