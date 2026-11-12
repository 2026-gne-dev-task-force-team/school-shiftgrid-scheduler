// 목록 칸 412 조작 재생 — 순수 함수(네트워크·타이머 없음). 1.2v 설계 ① 12절.
export type Item = unknown;

export type Op =
    | { op: 'add'; list: string; key: string; item: Item }
    | { op: 'del'; list: string; key: string }
    | { op: 'set'; list: string; key: string; item: Item; base: Item };

export type ReplayResult = {
    result: Record<string, Item[]>;
    applied: Op[];
    skipped: { op: Op; why: string }[];
    conflicts: { op: Op; server?: Item }[];
    /** 충돌 뒤 적용하지 않고 남긴 조작(차례 유지). */
    pending: Op[];
};

/** 키 순서에 무관한 JSON 정규화. */
function canon(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(canon);
    if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        return Object.fromEntries(
            Object.keys(o)
                .sort()
                .map((k) => [k, canon(o[k])]),
        );
    }
    return v;
}
export function sameValue(a: unknown, b: unknown): boolean {
    return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

export function replay(
    server: Record<string, Item[]>,
    ops: Op[],
    keyOf: (list: string, item: Item) => string,
): ReplayResult {
    const result: Record<string, Item[]> = {};
    for (const [l, items] of Object.entries(server)) result[l] = structuredClone(items);
    const applied: Op[] = [];
    const skipped: { op: Op; why: string }[] = [];
    const conflicts: { op: Op; server?: Item }[] = [];
    const pending: Op[] = [];

    for (const op of ops) {
        if (conflicts.length > 0) {
            pending.push(op);
            continue;
        }
        const arr = (result[op.list] ??= []);
        const idx = arr.findIndex((it) => keyOf(op.list, it) === op.key);
        if (op.op === 'add') {
            if (idx >= 0) skipped.push({ op, why: '이미 들어감' });
            else {
                arr.push(structuredClone(op.item));
                applied.push(op);
            }
        } else if (op.op === 'del') {
            if (idx < 0) skipped.push({ op, why: '이미 지워짐' });
            else {
                arr.splice(idx, 1);
                applied.push(op);
            }
        } else if (idx >= 0 && sameValue(arr[idx], op.base)) {
            arr[idx] = structuredClone(op.item);
            applied.push(op);
        } else if (idx >= 0 && sameValue(arr[idx], op.item)) {
            skipped.push({ op, why: '이미 같은 값' });
        } else {
            conflicts.push(idx >= 0 ? { op, server: structuredClone(arr[idx]) } : { op });
        }
    }
    return { result, applied, skipped, conflicts, pending };
}
