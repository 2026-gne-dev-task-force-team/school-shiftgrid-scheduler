/**
 * 지어낸 작은 학교 — 시험용. 실명·실제 데이터 없음.
 *  · 규격 2개: 3학년(점심 4교시 뒤) · 5학년(점심 5교시 뒤)
 *    분을 맞춰서 「3학년 4교시(11:00~11:40) == 5학년 5교시(11:00~11:40)」,
 *    「3학년 5교시(12:20~13:00) != 5학년 5교시」가 되게 했다(벽시계 모델 시험).
 *  · 3학년 2반 · 5학년 2반 · 전담 3명 · 특별실 1 · 수요 12개(시수 20)
 */
import type { Doc } from '../../types/doc';
import { makeSpec } from '../spec';
import { defaultRules } from '../rules';

export const IDS = {
    sp3: 'sp3', sp5: 'sp5',
    t31: 't31', t32: 't32', t51: 't51', t52: 't52',
    a1: 'a1', a2: 'a2', a3: 'a3',
    sci: 'sci', eng: 'eng', pe: 'pe',
    r1: 'r1',
    tt3: 'tt3', tt5: 'tt5',
};

/** 3학년 4교시 = slotIndex 3, 5학년 5교시 = slotIndex 4, 3학년 5교시 = slotIndex 5 */
export const SLOT = { g3_p4: 3, g3_p5: 5, g5_p5: 4 };

export function makeSmallDoc(): Doc {
    const spec3 = makeSpec({ id: IDS.sp3, name: '3학년 규격', periods: 6, lunchAfter: 4, dayStart: '09:00', lessonMin: 40, breakMin: 0, lunchMin: 40 });
    const spec5 = makeSpec({ id: IDS.sp5, name: '5학년 규격', periods: 6, lunchAfter: 5, dayStart: '08:20', lessonMin: 40, breakMin: 0, lunchMin: 40 });

    const demands = [
        // a1 과학 (특별실 r1 사용) — 4반 × 2시간
        ...[IDS.t31, IDS.t32, IDS.t51, IDS.t52].map((tid, i) => ({
            id: `d-sci-${i}`, agentId: IDS.a1, trackId: tid, activityId: IDS.sci, count: 2, resourceId: IDS.r1,
        })),
        // a2 영어 — 4반 × 2시간
        ...[IDS.t31, IDS.t32, IDS.t51, IDS.t52].map((tid, i) => ({
            id: `d-eng-${i}`, agentId: IDS.a2, trackId: tid, activityId: IDS.eng, count: 2,
        })),
        // a3 체육 — 4반 × 1시간
        ...[IDS.t31, IDS.t32, IDS.t51, IDS.t52].map((tid, i) => ({
            id: `d-pe-${i}`, agentId: IDS.a3, trackId: tid, activityId: IDS.pe, count: 1,
        })),
    ];

    return {
        meta: { name: '작은초', term: '2026학년도 2학기', schemaVersion: 2 },
        agents: [
            { kind: 'agent', id: IDS.a1, name: '가 선생', tier: 1, role: '전담' },
            { kind: 'agent', id: IDS.a2, name: '나 선생', tier: 2, role: '전담' },
            { kind: 'agent', id: IDS.a3, name: '다 선생', tier: 3, role: '전담' },
        ],
        activities: [
            { kind: 'activity', id: IDS.sci, name: '과학' },
            { kind: 'activity', id: IDS.eng, name: '영어' },
            { kind: 'activity', id: IDS.pe, name: '체육' },
        ],
        resources: [
            { kind: 'resource', id: IDS.r1, name: '과학실', capacity: 1, activityIds: [IDS.sci] },
        ],
        specs: [spec3, spec5],
        tracks: [
            { kind: 'track', id: IDS.t31, name: '3-1', specId: IDS.sp3, grade: 3 },
            { kind: 'track', id: IDS.t32, name: '3-2', specId: IDS.sp3, grade: 3 },
            { kind: 'track', id: IDS.t51, name: '5-1', specId: IDS.sp5, grade: 5 },
            { kind: 'track', id: IDS.t52, name: '5-2', specId: IDS.sp5, grade: 5 },
        ],
        timetables: [
            { id: IDS.tt3, name: '3학년 정규', specId: IDS.sp3, startDate: '2026-09-01', endDate: '2027-02-28', priority: 0 },
            { id: IDS.tt5, name: '5학년 정규', specId: IDS.sp5, startDate: '2026-09-01', endDate: '2027-02-28', priority: 0 },
        ],
        demands,
        assignments: [],
        blackouts: [],
        weeklyBlocks: [],
        rules: defaultRules(),
        boards: [],
    };
}

/** 배치 한 줄 만들기 — 시험에서 손으로 칸을 채울 때 */
export function put(
    id: string, trackId: string, dayIndex: number, slotIndex: number,
    extra: Partial<import('../../types/schema').WorkAssignment> = {},
): import('../../types/schema').WorkAssignment {
    return { kind: 'work', id, timetableId: '', trackId, dayIndex, slotIndex, ...extra };
}
