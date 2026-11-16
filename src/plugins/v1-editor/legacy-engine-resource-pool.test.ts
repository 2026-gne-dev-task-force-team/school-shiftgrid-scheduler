/**
 * R106 — 「예약만 받는 방」(attr.bookingOnly) + 정원 부풀림 고침.
 *   과학실(정원 1 · 과학) + 다목적실·도서실(과목 없음) 학교에서 두 반이 같은 요일·교시에 과학실을 쓰면:
 *     고치기 전(두 방이 모든 과목 정원에 더해짐) → 정원 3 이라 위반 0 (재현)
 *     두 방을 「예약만 받는 방」으로 켜면 → 정원 1 이라 위반 1 · 사전 점검 수용도 1/3 → 1/1
 */
import { describe, it, expect } from 'vitest';
import type { Doc } from './legacy/types/doc';
import type { Resource, Violation } from './legacy/types/schema';
import { evaluateAll, checkCapacity, solve } from './legacy/engine/core';
import { makeSmallDoc, put, IDS, SLOT } from './legacy/engine/__fixtures__/small';
import { isBookingOnly, pooledCapacity, resourcePool, resourcesInUse, withBookingOnly } from './legacy/engine/resource-pool';

const count = (viols: Violation[], templateId: string) => viols.filter((v) => v.templateId === templateId).length;

const SHARED = (bookingOnly: boolean): Resource[] => [
    { kind: 'resource', id: 'r-multi', name: '다목적실', capacity: 1, ...(bookingOnly ? { attr: { bookingOnly: true } } : {}) },
    { kind: 'resource', id: 'r-lib', name: '도서실', capacity: 1, ...(bookingOnly ? { attr: { bookingOnly: true } } : {}) },
];

function school(bookingOnly: boolean, assignments = twoClassesInScienceRoom()): Doc {
    const base = makeSmallDoc();
    return { ...base, demands: [], resources: [...base.resources, ...SHARED(bookingOnly)], assignments };
}
function twoClassesInScienceRoom() {
    return [
        put('s1', IDS.t31, 0, SLOT.g3_p4, { agentId: IDS.a1, activityId: IDS.sci, resourceId: IDS.r1 }),
        put('s2', IDS.t32, 0, SLOT.g3_p4, { agentId: IDS.a2, activityId: IDS.sci, resourceId: IDS.r1 }),
    ];
}

describe('pooledCapacity — 정원 합산 한 곳', () => {
    it('과목 칸 빈 방은 모든 과목 정원에 더한다(예약만 꺼짐) → 과학 3', () => {
        expect(pooledCapacity(school(false).resources, IDS.sci, new Set())).toBe(3);
    });
    it('「예약만 받는 방」은 더하지 않는다 → 과학 1', () => {
        expect(pooledCapacity(school(true).resources, IDS.sci, new Set())).toBe(1);
        expect(resourcePool(school(true).resources, IDS.sci, new Set()).map((r) => r.id)).toEqual([IDS.r1]);
    });
    it('직접 고른 방(referenced)은 예약만이어도 남긴다', () => {
        expect(pooledCapacity(school(true).resources, IDS.sci, new Set(['r-lib']))).toBe(2);
    });
    it('받는 방이 하나도 없으면 1', () => {
        expect(pooledCapacity(school(true).resources, IDS.eng, new Set())).toBe(1);
    });
});

describe('규칙 「특별실 정원 초과」 (rules)', () => {
    it('고치기 전 꼴(빈 과목 방 둘) → 두 반 같은 시각 과학실이어도 위반 0 (재현)', () => {
        expect(count(evaluateAll(school(false)), 'no-overlap-resource')).toBe(0);
    });
    it('두 방을 「예약만 받는 방」으로 켜면 → 위반 1', () => {
        expect(count(evaluateAll(school(true)), 'no-overlap-resource')).toBe(1);
    });
    it('한 반이 예약만 받는 도서실을 직접 고르면 그 방 정원은 남는다 → 위반 0', () => {
        const asg = twoClassesInScienceRoom();
        asg[1] = { ...asg[1], resourceId: 'r-lib' };
        expect(count(evaluateAll(school(true, asg)), 'no-overlap-resource')).toBe(0);
    });
});

describe('사전 점검 (capacity)', () => {
    const heavy = (bookingOnly: boolean): Doc => {
        const base = makeSmallDoc();
        // 과학 시수를 일부러 크게 — 두 경우 모두 부족 판정이 나오게 해서 수용 칸 수를 비교한다
        return { ...base, resources: [...base.resources, ...SHARED(bookingOnly)], demands: base.demands.map((d) => (d.resourceId ? { ...d, count: 500 } : d)) };
    };
    it('수용 방 1/3 → 1/1 — 수용 칸 수가 3분의 1이 되고, 방 이름에서 두 방이 빠진다', () => {
        const before = checkCapacity(heavy(false)).find((x) => x.kind === 'resource')!;
        const after = checkCapacity(heavy(true)).find((x) => x.kind === 'resource')!;
        expect(before.name).toBe('과학실·다목적실·도서실');
        expect(after.name).toBe('과학실');
        expect(before.capacity).toBe(after.capacity * 3);
    });
});

describe('자동 배정 (solver) — 예약만 받는 방은 정원에 안 든다', () => {
    it('과학 시수를 채운 결과에 정원 초과가 없다', async () => {
        const base = makeSmallDoc();
        const doc: Doc = { ...base, resources: [...base.resources, ...SHARED(true)] };
        const r = await solve(doc, { budgetMs: 1500, candidates: 1, seed: 7 });
        expect(count(evaluateAll({ ...doc, assignments: r.best.assignments }), 'no-overlap-resource')).toBe(0);
    });
});

describe('attr.bookingOnly 쓰기 — 켰을 때만 칸, 끄면 지움', () => {
    it('켜면 true 칸이 생기고 다른 칸은 그대로', () => {
        expect(withBookingOnly({ color: '#123' }, true)).toEqual({ color: '#123', bookingOnly: true });
    });
    it('끄면 칸을 지운다(false 를 적지 않는다)', () => {
        const off = withBookingOnly({ color: '#123', bookingOnly: true }, false)!;
        expect(off).toEqual({ color: '#123' });
        expect('bookingOnly' in off).toBe(false);
    });
    it('안 바뀌면 같은 객체(옛 파일 내보내기가 안 바뀜)', () => {
        const a = { color: '#123' };
        expect(withBookingOnly(a, false)).toBe(a);
        const b = { color: '#123', bookingOnly: true };
        expect(withBookingOnly(b, true)).toBe(b);
    });
    it('isBookingOnly 는 true 일 때만', () => {
        expect(isBookingOnly({ kind: 'resource', id: 'x', name: 'x' })).toBe(false);
        expect(isBookingOnly({ kind: 'resource', id: 'x', name: 'x', attr: { bookingOnly: 'yes' } })).toBe(false);
        expect(isBookingOnly({ kind: 'resource', id: 'x', name: 'x', attr: { bookingOnly: true } })).toBe(true);
    });
});

describe('resourcesInUse — 「예약만」 전환을 막을 방', () => {
    it('시수 줄이 고른 방 + 고정 수업이 고른 방만', () => {
        const base = makeSmallDoc();
        const used = resourcesInUse({
            demands: base.demands,
            assignments: [
                put('f', IDS.t31, 0, 0, { fixed: true, resourceId: 'r-multi' }),
                put('w', IDS.t31, 0, 1, { resourceId: 'r-lib' }),
            ],
        });
        expect([...used].sort()).toEqual([IDS.r1, 'r-multi'].sort());
    });
});
