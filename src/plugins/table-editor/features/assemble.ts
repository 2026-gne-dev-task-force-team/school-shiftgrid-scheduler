/**
 * 조립기 — features 목록을 받아 ①문자열 id 풀기 ②needs 위상 정렬 ③conflicts 쌍이면 그 자리에서 던진다
 *   ④순환이면 던진다. 플러그인 레지스트리 M0 의 축소판(같은 낱말 needs≈requires).
 *   ⛔ 조용히 하나를 빼지 않는다 — 어긋나면 던져서 조립한 사람이 안다.
 *   🔴 순수 함수(ctx 없음) — install 은 Table 이 ctx 로 돌린다. 던지는 길을 테스트로 못 박는다(버그 심기 검산).
 */
import type { TableFeature } from '../../contract-table/types';

export type FeatureLookup = (id: string) => TableFeature | undefined;

/** features 목록 → 설치 순서대로 정렬된 모듈 배열. 어긋나면 던진다. */
export function resolveFeatures(
    entries: (string | TableFeature)[],
    lookup: FeatureLookup,
): TableFeature[] {
    // ① 풀기(문자열 → 모듈) + id 중복 제거(먼저 온 것이 이긴다).
    const byId = new Map<string, TableFeature>();
    for (const e of entries) {
        const f = typeof e === 'string' ? lookup(e) : e;
        if (!f) throw new Error(`표 기능 모듈을 찾을 수 없다: '${e as string}'`);
        if (!byId.has(f.id)) byId.set(f.id, f);
    }
    const present = new Set(byId.keys());

    // ② needs — 빠진 의존이면 던진다.
    for (const f of byId.values()) {
        for (const need of f.needs ?? []) {
            if (!present.has(need)) throw new Error(`기능 '${f.id}' 가 '${need}' 를 needs 하는데 목록에 없다`);
        }
    }

    // ③ conflicts — 쌍이 같이 있으면 던진다(한쪽 방향만 적어도 걸린다).
    for (const f of byId.values()) {
        for (const bad of f.conflicts ?? []) {
            if (present.has(bad)) throw new Error(`기능 '${f.id}' 와 '${bad}' 는 같이 쓸 수 없다(conflicts)`);
        }
    }

    // ④ needs 위상 정렬(순환이면 던진다).
    const order: TableFeature[] = [];
    const state = new Map<string, 0 | 1 | 2>(); // 0 미방문·1 방문중·2 끝
    const visit = (id: string): void => {
        const st = state.get(id) ?? 0;
        if (st === 2) return;
        if (st === 1) throw new Error(`기능 의존이 순환한다: '${id}'`);
        state.set(id, 1);
        const f = byId.get(id)!;
        for (const need of f.needs ?? []) visit(need);
        state.set(id, 2);
        order.push(f);
    };
    for (const id of byId.keys()) visit(id);
    return order;
}
