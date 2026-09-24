/**
 * 샘플 학교 — 처음 켰을 때 「이렇게 생겼습니다」를 보여주는 지어낸 초등학교.
 * ⛔ 실명 금지 (공개 레포) — 사람 이름은 순우리말 한 낱말(하늘·바다 …)만 쓴다.
 * ⚠️ 엔진(src/engine)에 의존하지 않는다 — 엔진 판이 아직 채우는 중이라도 이 파일만으로 doc 이 완성된다.
 *    규격(TimetableSpec)의 슬롯도 engine/api 의 makeSpec() 을 안 부르고 배열을 직접 적는다.
 *
 * ── 시각표 (1교시 09:00 · 수업 40분 · 쉬는시간 10분 · 점심 50분) ──────────────
 *   1·2학년 (5교시, 점심 4교시 뒤): 1교시 09:00 … 4교시 11:30-12:10 · 점심 12:10-13:00 · 5교시 13:10-13:50
 *   3·4학년 (6교시, 점심 4교시 뒤): 〃 4교시까지 동일 · 점심 12:10-13:00 · 5교시 13:10-13:50 · 6교시 14:00-14:40
 *   5·6학년 (6교시, 점심 5교시 뒤): 〃 4교시까지 동일 · 5교시 12:20-13:00 · 점심 13:00-13:50 · 6교시 14:00-14:40
 *   ⭐ 세 규격 모두 "4교시"는 11:30-12:10 로 시각이 같다 — 수요일 4교시 전 학년 고정 블록(창체/동아리)이
 *      교시 번호 하나로 세 규격을 동시에 가리킬 수 있는 이유가 이것이다.
 */
import { type Doc } from '../types/doc';
import type {
    Agent, Activity, Resource, Track, TimetableSpec, Timetable, Demand,
    WeeklyBlock, WorkAssignment, SchoolMeta,
} from '../types/schema';

// ──────────────────────────────────────────────── 1. 학교 메타

const meta: SchoolMeta = { name: '샘플초등학교', term: '2026학년도 2학기', schemaVersion: 2 };

// ──────────────────────────────────────────────── 2. 시간 규격 (학년군 3개)

const SPEC_1_2: TimetableSpec = {
    id: 's-1-2',
    name: '1·2학년 규격',
    cycleDays: 7,
    activeDays: [0, 1, 2, 3, 4],
    dayStart: '09:00',
    dayEnd: '13:50',
    slots: [
        { index: 0, label: '1교시', start: '09:00', end: '09:40', assignable: true, kind: 'lesson' },
        { index: 1, label: '2교시', start: '09:50', end: '10:30', assignable: true, kind: 'lesson' },
        { index: 2, label: '3교시', start: '10:40', end: '11:20', assignable: true, kind: 'lesson' },
        { index: 3, label: '4교시', start: '11:30', end: '12:10', assignable: true, kind: 'lesson' },
        { index: 4, label: '점심', start: '12:10', end: '13:00', assignable: false, kind: 'lunch' },
        { index: 5, label: '5교시', start: '13:10', end: '13:50', assignable: true, kind: 'lesson' },
    ],
    // 1·2학년은 월·금요일에 5교시가 없다(4교시까지만) — 값은 그 요일의 '수업 칸 수'
    lessonsPerDay: { 0: 4, 4: 4 },
};

const SPEC_3_4: TimetableSpec = {
    id: 's-3-4',
    name: '3·4학년 규격',
    cycleDays: 7,
    activeDays: [0, 1, 2, 3, 4],
    dayStart: '09:00',
    dayEnd: '14:40',
    slots: [
        { index: 0, label: '1교시', start: '09:00', end: '09:40', assignable: true, kind: 'lesson' },
        { index: 1, label: '2교시', start: '09:50', end: '10:30', assignable: true, kind: 'lesson' },
        { index: 2, label: '3교시', start: '10:40', end: '11:20', assignable: true, kind: 'lesson' },
        { index: 3, label: '4교시', start: '11:30', end: '12:10', assignable: true, kind: 'lesson' },
        { index: 4, label: '점심', start: '12:10', end: '13:00', assignable: false, kind: 'lunch' },
        { index: 5, label: '5교시', start: '13:10', end: '13:50', assignable: true, kind: 'lesson' },
        { index: 6, label: '6교시', start: '14:00', end: '14:40', assignable: true, kind: 'lesson' },
    ],
};

const SPEC_5_6: TimetableSpec = {
    id: 's-5-6',
    name: '5·6학년 규격',
    cycleDays: 7,
    activeDays: [0, 1, 2, 3, 4],
    dayStart: '09:00',
    dayEnd: '14:40',
    slots: [
        { index: 0, label: '1교시', start: '09:00', end: '09:40', assignable: true, kind: 'lesson' },
        { index: 1, label: '2교시', start: '09:50', end: '10:30', assignable: true, kind: 'lesson' },
        { index: 2, label: '3교시', start: '10:40', end: '11:20', assignable: true, kind: 'lesson' },
        { index: 3, label: '4교시', start: '11:30', end: '12:10', assignable: true, kind: 'lesson' },
        { index: 4, label: '5교시', start: '12:20', end: '13:00', assignable: true, kind: 'lesson' },
        { index: 5, label: '점심', start: '13:00', end: '13:50', assignable: false, kind: 'lunch' },
        { index: 6, label: '6교시', start: '14:00', end: '14:40', assignable: true, kind: 'lesson' },
    ],
};

const specs: TimetableSpec[] = [SPEC_1_2, SPEC_3_4, SPEC_5_6];

// 학년 → 규격
const specIdOfGrade = (grade: number): string =>
    grade <= 2 ? SPEC_1_2.id : grade <= 4 ? SPEC_3_4.id : SPEC_5_6.id;

// 학년 → 그 학년의 '4교시' 슬롯 index. 세 규격 모두 index 3 로 같다(위 시각표 참고)
const PERIOD4_INDEX = 3;

// ──────────────────────────────────────────────── 3. 반 (학년당 3반 × 6학년 = 18반)

const tracks: Track[] = [];
for (let grade = 1; grade <= 6; grade++) {
    for (let cls = 1; cls <= 3; cls++) {
        tracks.push({
            kind: 'track', id: `t-${grade}-${cls}`, name: `${grade}-${cls}`,
            specId: specIdOfGrade(grade), grade, attr: { classNum: cls },
        });
    }
}
const trackId = (grade: number, cls: number) => `t-${grade}-${cls}`;
const tracksOfGrade = (grade: number) => tracks.filter((t) => t.grade === grade);

// ──────────────────────────────────────────────── 4. 사람 (담임 18 + 전담 9 + 강사 1 = 28)
//     ⛔ 실명 아님 — 순우리말 한 낱말

const HOMEROOM_NAMES = [
    '하늘', '바다', '구름',   // 1학년 1·2·3반
    '시내', '나루', '다솜',   // 2학년
    '아라', '여울', '초록',   // 3학년
    '새봄', '온유', '다온',   // 4학년
    '라온', '하람', '미르',   // 5학년
    '가온', '다래', '보람',   // 6학년
];

const agents: Agent[] = [];
{
    let i = 0;
    for (let grade = 1; grade <= 6; grade++) {
        for (let cls = 1; cls <= 3; cls++) {
            agents.push({
                kind: 'agent', id: `a-hr-${grade}-${cls}`, name: HOMEROOM_NAMES[i++],
                role: '담임', homeroomTrackId: trackId(grade, cls),
            });
        }
    }
}
// ⚠️ 밀도 주의 (2026-09-24 실측): 한 전담이 12반×3시간=36시수를 맡으면 주간 수업 칸(약 30)을 넘어
//    어떤 솔버도 하드 0을 못 만든다. 그래서 영어·과학·체육은 실제 학교처럼 학년군별로 두 명이다.
agents.push(
    { kind: 'agent', id: 'a-eng', name: '이든', role: '전담', tier: 1 },    // 영어 부장 (3·4학년)
    { kind: 'agent', id: 'a-eng2', name: '가람', role: '전담', tier: 2 },   // 영어 (5·6학년)
    { kind: 'agent', id: 'a-sci', name: '한별', role: '전담', tier: 2 },    // 과학 (3·4학년)
    { kind: 'agent', id: 'a-sci2', name: '누리', role: '전담', tier: 2 },   // 과학 (5·6학년)
    { kind: 'agent', id: 'a-pe', name: '빛나', role: '전담', tier: 2 },     // 체육 (3·4학년)
    { kind: 'agent', id: 'a-pe2', name: '한결', role: '전담', tier: 2 },    // 체육 (5·6학년)
    { kind: 'agent', id: 'a-music', name: '슬기', role: '전담', tier: 2 },  // 음악
    { kind: 'agent', id: 'a-art', name: '푸름', role: '전담', tier: 2 },    // 미술
    { kind: 'agent', id: 'a-tech', name: '샛별', role: '전담', tier: 2 },   // 실과
    { kind: 'agent', id: 'a-sports', name: '마루', role: '비교과', tier: 3, coteach: true }, // 스포츠강사
);

// ──────────────────────────────────────────────── 5. 과목 (6 + 담임 고정용 창체)

const activities: Activity[] = [
    { kind: 'activity', id: 'act-eng', name: '영어' },
    { kind: 'activity', id: 'act-sci', name: '과학' },
    { kind: 'activity', id: 'act-pe', name: '체육' },
    { kind: 'activity', id: 'act-music', name: '음악' },
    { kind: 'activity', id: 'act-art', name: '미술' },
    { kind: 'activity', id: 'act-tech', name: '실과' },
    { kind: 'activity', id: 'act-changje', name: '창체' },
];

// ──────────────────────────────────────────────── 6. 특별실

const resources: Resource[] = [
    { kind: 'resource', id: 'r-science', name: '과학실', capacity: 2, activityIds: ['act-sci'] },
    { kind: 'resource', id: 'r-gym', name: '체육관', capacity: 1, activityIds: ['act-pe'] },
    // 체육 총 48시수 > 주간 칸 30 이라 공간이 둘이어야 한다 — 같은 과목의 방은 cap 이 합산된다(과학실 2와 같은 규칙)
    { kind: 'resource', id: 'r-field', name: '운동장', capacity: 1, activityIds: ['act-pe'] },
    { kind: 'resource', id: 'r-music', name: '음악실', capacity: 1, activityIds: ['act-music'] },
    { kind: 'resource', id: 'r-computer', name: '컴퓨터실', capacity: 1, activityIds: ['act-tech'] },
];

// ──────────────────────────────────────────────── 7. 시간표 (규격마다 한 장, 2학기 전체)

const timetables: Timetable[] = [
    { id: 'tt-1-2', name: '1·2학년 2학기', specId: SPEC_1_2.id, startDate: '2026-09-01', endDate: '2027-02-28', priority: 0 },
    { id: 'tt-3-4', name: '3·4학년 2학기', specId: SPEC_3_4.id, startDate: '2026-09-01', endDate: '2027-02-28', priority: 0 },
    { id: 'tt-5-6', name: '5·6학년 2학기', specId: SPEC_5_6.id, startDate: '2026-09-01', endDate: '2027-02-28', priority: 0 },
];
const timetableIdOfGrade = (grade: number) => grade <= 2 ? 'tt-1-2' : grade <= 4 ? 'tt-3-4' : 'tt-5-6';

// ──────────────────────────────────────────────── 8. 수요 (시수표)
//     3~6학년: 영어3 · 과학3(과학실2, 순배) · 체육3(체육관) · 음악2(음악실) · 미술2(연강)
//     5·6학년만: 실과2(컴퓨터실)
//     1·2학년: 체육2(체육관, 스포츠강사 coteach)

const demands: Demand[] = [];
let dseq = 0;
const nextDemandId = () => `d-${++dseq}`;

for (let grade = 3; grade <= 6; grade++) {
    const hi = grade >= 5;   // 5·6학년은 두 번째 전담이 맡는다
    for (const t of tracksOfGrade(grade)) {
        demands.push({ id: nextDemandId(), agentId: hi ? 'a-eng2' : 'a-eng', trackId: t.id, activityId: 'act-eng', count: 3 });
        demands.push({
            id: nextDemandId(), agentId: hi ? 'a-sci2' : 'a-sci', trackId: t.id, activityId: 'act-sci', count: 3,
            resourceId: 'r-science', roomHours: 2, cycle: true,
        });
        demands.push({
            id: nextDemandId(), agentId: hi ? 'a-pe2' : 'a-pe', trackId: t.id, activityId: 'act-pe', count: 3,
            resourceId: hi ? 'r-field' : 'r-gym',
        });
        demands.push({
            id: nextDemandId(), agentId: 'a-music', trackId: t.id, activityId: 'act-music', count: 2,
            resourceId: 'r-music',
        });
        demands.push({
            id: nextDemandId(), agentId: 'a-art', trackId: t.id, activityId: 'act-art', count: 2,
            block: [2],
        });
        if (grade >= 5) {
            demands.push({
                id: nextDemandId(), agentId: 'a-tech', trackId: t.id, activityId: 'act-tech', count: 2,
                resourceId: 'r-computer',
            });
        }
    }
}
for (let grade = 1; grade <= 2; grade++) {
    for (const t of tracksOfGrade(grade)) {
        demands.push({
            id: nextDemandId(), agentId: 'a-sports', trackId: t.id, activityId: 'act-pe', count: 2,
            resourceId: 'r-gym',
        });
    }
}

// ──────────────────────────────────────────────── 9. 주간 금지칸 (WeeklyBlock)

const weeklyBlocks: WeeklyBlock[] = [
    // 동아리 — 수요일 4교시, 전 학년(targets 비움) 하드 블록. 아래 10번 고정 배치와 짝이다(같은 칸)
    { id: 'wb-club', name: '동아리', dayIndex: 2, slotIndex: PERIOD4_INDEX, targets: [] },
    // 부장회의 — 영어 부장(이든), 월요일 14:00~15:00 하드 블록. 교사 대상이라 시각으로 적는다
    { id: 'wb-head-meeting', name: '부장회의', dayIndex: 0, from: '14:00', to: '15:00', targets: [{ kind: 'agent', id: 'a-eng' }] },
    // 체육 전담(빛나) 금요일 6교시 회피(소프트). 3·4·5·6학년 6교시가 둘 다 14:00-14:40 이라 시각으로 적는다
    { id: 'wb-pe-avoid-fri6', name: '체육 금요일 6교시 회피', dayIndex: 4, from: '14:00', to: '14:40', targets: [{ kind: 'agent', id: 'a-pe' }], soft: true },
];

// ──────────────────────────────────────────────── 10. 고정 배치 — 반마다 창체(수요일 4교시)

const assignments: WorkAssignment[] = tracks.map((t) => ({
    kind: 'work',
    id: `as-changje-${t.id}`,
    timetableId: timetableIdOfGrade(t.grade!),
    trackId: t.id,
    dayIndex: 2,
    slotIndex: PERIOD4_INDEX,
    activityId: 'act-changje',
    agentId: `a-hr-${t.grade}-${t.attr!.classNum}`,
    label: '창체',
    fixed: true,
}));

// ──────────────────────────────────────────────── 11. 완성

export function sampleDoc(): Doc {
    return {
        meta, agents, activities, resources, specs, tracks, timetables, demands, assignments,
        blackouts: [],
        weeklyBlocks,
        rules: [], // ⚠️ 화면이 defaultRules() 로 채운다 — 이 파일은 엔진에 안 기댄다
        boards: [],
    };
}

/**
 * 총 시수 합 (2026-09-24 계산, 껍데기 판):
 *   3·4학년 6반 × 13시간(영3+과3+체3+음2+미2)           = 78
 *   5·6학년 6반 × 15시간(위 13 + 실과2)                 = 90
 *   1·2학년 6반 × 2시간(체육, 스포츠강사 coteach)        = 12
 *   ────────────────────────────────────────────────
 *   합계 180시간 (Demand 72건) — 창체 고정 배치 18건은 별도(Demand 아님)
 *   교사별 최대 18시수(영·과·체 각 2명) · 체육 공간 2(체육관+운동장) — 2026-09-24 밀도 수정
 */
