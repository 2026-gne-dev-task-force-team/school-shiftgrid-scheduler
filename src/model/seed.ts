/**
 * 시연용 씨앗 데이터 — schema.ts 타입 '그대로' 채운 예시 세계.
 * 화면에 보이는 폴더·칩·규칙이 곧 저장 모델임을 보여주기 위한 것이라,
 * 별도 프로토타입 타입을 만들지 않고 도메인 타입(Agent·Track·…)을 직접 쓴다.
 *
 * 색은 저장 모델이 강제하지 않는 표시용 정보라 자유 속성(attr.color)에 둔다.
 */
import type {
    Agent, Activity, Resource, Track, TimetableSpec, Timetable,
    Assignment, Blackout, Slot,
} from '../types/schema';

/** attr에 색 하나 넣는 짧은 도우미 */
const c = (color: string) => ({ color });

// ── 교사(Agent) ───────────────────────────────────────────────
export const AGENTS: Agent[] = [
    { kind: 'agent', id: 'a-kim', name: '김민준', attr: { subject: '수학', ...c('#4F7CFF') } },
    { kind: 'agent', id: 'a-lee', name: '이서연', attr: { subject: '국어', ...c('#FF6B6B') } },
    { kind: 'agent', id: 'a-park', name: '박지훈', attr: { subject: '과학', ...c('#2ECC71') } },
    { kind: 'agent', id: 'a-choi', name: '최유나', attr: { subject: '영어', ...c('#9B59B6') } },
    { kind: 'agent', id: 'a-jung', name: '정현우', attr: { subject: '체육', ...c('#F39C12') } },
    { kind: 'agent', id: 'a-kang', name: '강수아', attr: { subject: '음악', ...c('#E91E63') } },
    { kind: 'agent', id: 'a-yoon', name: '윤도현', attr: { subject: '미술', ...c('#00BCD4') } },
    { kind: 'agent', id: 'a-im', name: '임지원', attr: { subject: '사회', ...c('#795548') } },
];

// ── 교과(Activity) ───────────────────────────────────────────
export const ACTIVITIES: Activity[] = [
    { kind: 'activity', id: 'act-math', name: '수학', attr: c('#4F7CFF') },
    { kind: 'activity', id: 'act-kor', name: '국어', attr: c('#FF6B6B') },
    { kind: 'activity', id: 'act-sci', name: '과학', attr: c('#2ECC71') },
    { kind: 'activity', id: 'act-eng', name: '영어', attr: c('#9B59B6') },
    { kind: 'activity', id: 'act-pe', name: '체육', attr: c('#F39C12') },
    { kind: 'activity', id: 'act-music', name: '음악', attr: c('#E91E63') },
    { kind: 'activity', id: 'act-art', name: '미술', attr: c('#00BCD4') },
    { kind: 'activity', id: 'act-soc', name: '사회', attr: c('#795548') },
];

// ── 시설(Resource) ───────────────────────────────────────────
export const RESOURCES: Resource[] = [
    { kind: 'resource', id: 'r-sci', name: '과학실', attr: c('#2ECC71') },
    { kind: 'resource', id: 'r-gym', name: '체육관', attr: c('#F39C12') },
    { kind: 'resource', id: 'r-music', name: '음악실', attr: c('#E91E63') },
    { kind: 'resource', id: 'r-art', name: '미술실', attr: c('#00BCD4') },
    { kind: 'resource', id: 'r-com', name: '컴퓨터실', attr: c('#607D8B') },
];

// ── 시간표 규격(TimetableSpec) ───────────────────────────────
/** 하루를 N교시로 나눈 슬롯들을 만든다. (점심·쉬는시간 없이 교시만 — 데모 단순화) */
function periods(n: number, dayStart = '09:00'): Slot[] {
    const slots: Slot[] = [];
    let [h, m] = dayStart.split(':').map(Number);
    for (let i = 0; i < n; i++) {
        const start = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        m += 40;
        h += Math.floor(m / 60); m %= 60;
        const end = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        m += 10; h += Math.floor(m / 60); m %= 60; // 쉬는 시간 10분
        slots.push({ index: i, label: `${i + 1}교시`, start, end, assignable: true });
    }
    return slots;
}

export const SPECS: TimetableSpec[] = [
    {
        id: 'spec-low', name: '저학년 규격 (1·2학년)',
        cycleDays: 7, activeDays: [0, 1, 2, 3, 4], dayStart: '09:00', dayEnd: '12:10',
        slots: periods(5), attr: { note: '5교시까지 — 하교가 이르다' },
    },
    {
        id: 'spec-high', name: '고학년 규격 (3~6학년)',
        cycleDays: 7, activeDays: [0, 1, 2, 3, 4], dayStart: '09:00', dayEnd: '13:00',
        slots: periods(6), attr: { note: '6교시까지' },
    },
];

// ── 학반(Track) — 데모에선 attr.specId로 어느 규격 폴더에 속하는지 표시 ──
// (schema의 Track엔 specId가 없다. '규격→학반' 그룹핑은 화면 편의를 위한 데모용 연결.)
const CLASS_NAMES = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2', '5-1', '5-2', '6-1', '6-2'];

const specOfClass = (cls: string) => (Number(cls.split('-')[0]) <= 2 ? 'spec-low' : 'spec-high');

export const TRACKS: Track[] = CLASS_NAMES.map((cls) => ({
    kind: 'track', id: `t-${cls}`, name: `${cls}반`, attr: { specId: specOfClass(cls) },
}));

// ── 시간표 적용(Timetable) — 기본표 + 특별표(우선순위) ───────
export const TIMETABLES: Timetable[] = [
    { id: 'tt-low', name: '저학년 기본표', specId: 'spec-low', startDate: '2026-03-02', endDate: '2026-07-20', priority: 0 },
    { id: 'tt-high', name: '고학년 기본표', specId: 'spec-high', startDate: '2026-03-02', endDate: '2026-07-20', priority: 0 },
    {
        id: 'tt-sports', name: '운동회 주간표', specId: 'spec-high',
        startDate: '2026-05-11', endDate: '2026-05-15', priority: 10,
        attr: { note: '기간이 좁고 우선순위가 높다 → 이 주엔 기본표 대신 이 표가 이긴다' },
    },
];

/** 학반이 쓰는 기본표 id */
export const baseTimetableOf = (track: Track): string =>
    (track.attr?.specId === 'spec-low' ? 'tt-low' : 'tt-high');

// ── 배치(Assignment) — 그럴듯한 한 주 시간표를 실제 도메인 타입으로 ──
const TEACHER_BY_SUBJECT = Object.fromEntries(AGENTS.map((a) => [a.attr!.subject, a.id]));
const ACTIVITY_BY_SUBJECT = Object.fromEntries(ACTIVITIES.map((a) => [a.name, a.id]));
const ROOM_BY_SUBJECT: Record<string, string | undefined> = {
    과학: 'r-sci', 체육: 'r-gym', 음악: 'r-music', 미술: 'r-art',
};

// 교시(행) × 요일(열) 과목 틀. 반마다 요일을 밀어 겹쳐 보이지 않게 한다.
const WEEK: string[][] = [
    ['국어', '국어', '국어', '국어', '국어'],
    ['수학', '수학', '수학', '수학', '수학'],
    ['영어', '과학', '영어', '사회', '영어'],
    ['사회', '체육', '과학', '체육', '사회'],
    ['체육', '음악', '미술', '과학', '음악'],
    ['미술', '사회', '음악', '미술', '체육'],
];

export function buildSeedAssignments(): Assignment[] {
    const out: Assignment[] = [];
    TRACKS.forEach((track, classIdx) => {
        const grade = Number(track.name.split('-')[0]);
        const lastPeriod = grade <= 2 ? 5 : 6;
        const shift = classIdx % 5;
        const timetableId = baseTimetableOf(track);

        for (let slotIndex = 0; slotIndex < lastPeriod; slotIndex++) {
            for (let dayIndex = 0; dayIndex < 5; dayIndex++) {
                const subject = WEEK[slotIndex][(dayIndex + shift) % 5];
                out.push({
                    kind: 'work',
                    id: `w-${track.id}-${dayIndex}-${slotIndex}`,
                    timetableId, trackId: track.id, dayIndex, slotIndex,
                    activityId: ACTIVITY_BY_SUBJECT[subject],
                    agentId: TEACHER_BY_SUBJECT[subject],
                    resourceId: ROOM_BY_SUBJECT[subject],
                });
            }
        }
    });
    return out;
}

// ── 가용성 차단(Blackout) — 휴일·교사 복무·시설 수리를 한 타입으로 ──
export const BLACKOUTS: Blackout[] = [
    {
        id: 'bo-holiday', name: '개교기념일', startDate: '2026-05-01', endDate: '2026-05-01',
        targets: [], mode: 'all-except', attr: { category: '학사일정' },
    },
    {
        id: 'bo-kim-leave', name: '김민준 연가', startDate: '2026-05-07', endDate: '2026-05-07',
        targets: [{ kind: 'agent', id: 'a-kim' }], mode: 'only', attr: { category: '교사 복무' },
    },
    {
        id: 'bo-sci-fix', name: '과학실 수리', startDate: '2026-05-04', endDate: '2026-05-08',
        targets: [{ kind: 'resource', id: 'r-sci' }], mode: 'only', attr: { category: '시설' },
    },
];
