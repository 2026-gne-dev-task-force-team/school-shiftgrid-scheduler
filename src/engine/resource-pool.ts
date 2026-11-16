/**
 * 특별실 정원 합산 — 한 과목이 같은 시각에 쓸 수 있는 특별실 정원을 이 한 곳에서 센다(R106).
 *   규칙 「특별실 정원 초과」(rules.ts) · 사전 점검(capacity.ts) · 자동 배정 채점과 초기화(solver.ts)가 모두 이 함수를 쓴다.
 *   그 과목을 받는 방:
 *     1) 시수 줄·배치가 직접 고른 방(referenced) — 「예약만 받는 방」이어도 넣는다(빼면 정원 0 → 1 로 대체되어 어긋난다)
 *     2) 과목 칸에 그 과목이 든 방
 *     3) 과목 칸이 빈 방(모든 과목이 함께 쓰는 방) — 단 「예약만 받는 방」(attr.bookingOnly === true)은 뺀다
 *   합이 0 이면 1 로 본다.
 */
import type { Doc } from '../types/doc';
import type { Resource } from '../types/schema';

/** 「예약만 받는 방」 — 도서실·다목적실처럼 과목 정원에 저절로 더하지 않는 방. 켰을 때만 attr.bookingOnly 칸이 있다(끄면 칸을 지운다). */
export const isBookingOnly = (r: Resource): boolean => r.attr?.bookingOnly === true;

/** 이 방이 그 과목의 정원 합산에 드는가 */
export function servesActivity(r: Resource, actId: string, referenced: ReadonlySet<string>): boolean {
    if (referenced.has(r.id)) return true;
    if (r.activityIds && r.activityIds.length > 0) return r.activityIds.includes(actId);
    return !isBookingOnly(r);
}

/** 그 과목의 정원 합산에 드는 방들 (문서 순서 그대로) */
export function resourcePool(resources: readonly Resource[], actId: string, referenced: ReadonlySet<string>): Resource[] {
    return resources.filter((r) => servesActivity(r, actId, referenced));
}

/** 그 과목이 같은 시각에 쓸 수 있는 특별실 정원 합 (0 이면 1) */
export function pooledCapacity(resources: readonly Resource[], actId: string, referenced: ReadonlySet<string>): number {
    let cap = 0;
    for (const r of resources) if (servesActivity(r, actId, referenced)) cap += r.capacity ?? 1;
    return cap <= 0 ? 1 : cap;
}

/**
 * attr 에 「예약만 받는 방」을 켜거나 끈다 — 켰을 때만 bookingOnly: true 칸을 적고, 끄면 칸을 지운다(false 를 적지 않는다).
 *   이미 그 상태면 같은 객체를 그대로 돌려준다(특별실 표가 고칠 때마다 방을 새로 만들어도 옛 파일 내보내기가 안 바뀌게).
 */
export function withBookingOnly(attr: Record<string, unknown> | undefined, on: boolean): Record<string, unknown> | undefined {
    const now = attr?.bookingOnly === true;
    if (on === now) return attr;
    if (on) return { ...attr, bookingOnly: true };
    const rest = { ...attr };
    delete rest.bookingOnly;
    return rest;
}

/** 시수표 줄·고정 수업이 이미 고른 특별실 id — 이 방들은 「예약만 받는 방」으로 바꾸지 않는다 */
export function resourcesInUse(doc: Pick<Doc, 'demands' | 'assignments'>): Set<string> {
    const out = new Set<string>();
    for (const d of doc.demands) if (d.resourceId) out.add(d.resourceId);
    for (const a of doc.assignments) if (a.fixed && a.resourceId) out.add(a.resourceId);
    return out;
}
