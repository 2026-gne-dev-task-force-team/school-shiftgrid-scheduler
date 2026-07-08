export type Category = 'teacher' | 'subject' | 'room';

export interface Resource {
  id: string;
  name: string;
  color: string;
  category: Category;
  sub?: string;
}

export const TEACHERS: Resource[] = [
  { id: 't1', name: '김민준', color: '#4F7CFF', category: 'teacher', sub: '수학' },
  { id: 't2', name: '이서연', color: '#FF6B6B', category: 'teacher', sub: '국어' },
  { id: 't3', name: '박지훈', color: '#2ECC71', category: 'teacher', sub: '과학' },
  { id: 't4', name: '최유나', color: '#9B59B6', category: 'teacher', sub: '영어' },
  { id: 't5', name: '정현우', color: '#F39C12', category: 'teacher', sub: '체육' },
  { id: 't6', name: '강수아', color: '#E91E63', category: 'teacher', sub: '음악' },
  { id: 't7', name: '윤도현', color: '#00BCD4', category: 'teacher', sub: '미술' },
  { id: 't8', name: '임지원', color: '#795548', category: 'teacher', sub: '사회' },
];

export const SUBJECTS: Resource[] = [
  { id: 's1', name: '수학', color: '#4F7CFF', category: 'subject' },
  { id: 's2', name: '국어', color: '#FF6B6B', category: 'subject' },
  { id: 's3', name: '과학', color: '#2ECC71', category: 'subject' },
  { id: 's4', name: '영어', color: '#9B59B6', category: 'subject' },
  { id: 's5', name: '체육', color: '#F39C12', category: 'subject' },
  { id: 's6', name: '음악', color: '#E91E63', category: 'subject' },
  { id: 's7', name: '미술', color: '#00BCD4', category: 'subject' },
  { id: 's8', name: '사회', color: '#795548', category: 'subject' },
];

export const ROOMS: Resource[] = [
  { id: 'r1', name: '과학실', color: '#2ECC71', category: 'room' },
  { id: 'r2', name: '체육관', color: '#F39C12', category: 'room' },
  { id: 'r3', name: '음악실', color: '#E91E63', category: 'room' },
  { id: 'r4', name: '미술실', color: '#00BCD4', category: 'room' },
  { id: 'r5', name: '컴퓨터실', color: '#607D8B', category: 'room' },
];

export const ALL_RESOURCES: Resource[] = [...TEACHERS, ...SUBJECTS, ...ROOMS];

export const DAYS = ['월', '화', '수', '목', '금'];
export const PERIODS = [1, 2, 3, 4, 5, 6];
export const CLASSES = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2', '5-1', '5-2', '6-1', '6-2'];

// ── 시연용 샘플 시간표 ────────────────────────────────────────
// 열자마자 '채워진 진짜 시간표'가 보이도록 한 주치를 만들어 둔다.
// (프로토타입 시연 전용 데이터 — 도메인 모델과는 무관하다.)

/** 과목 이름 → 그 과목을 맡는 교사 (교사의 sub 값으로 짝지음) */
const TEACHER_BY_SUBJECT: Record<string, Resource> = Object.fromEntries(
  SUBJECTS.map((s) => [s.name, TEACHERS.find((t) => t.sub === s.name)!]).filter(([, t]) => t),
) as Record<string, Resource>;

/** 과목 이름 → 그 과목이 쓰는 특별실 (없으면 교실에서 하므로 생략) */
const ROOM_BY_SUBJECT: Record<string, Resource | undefined> = {
  과학: ROOMS.find((r) => r.name === '과학실'),
  체육: ROOMS.find((r) => r.name === '체육관'),
  음악: ROOMS.find((r) => r.name === '음악실'),
  미술: ROOMS.find((r) => r.name === '미술실'),
};

// 교시(행) × 요일(열)로 짠 한 주 과목 배치 틀. 반마다 요일을 조금씩 돌려 변화를 준다.
// 국어·수학은 매일 1~2교시 고정, 예체능·특별실 과목은 오후로.
const WEEK_TEMPLATE: string[][] = [
  //  월      화      수      목      금
  ['국어', '국어', '국어', '국어', '국어'], // 1교시
  ['수학', '수학', '수학', '수학', '수학'], // 2교시
  ['영어', '과학', '영어', '사회', '영어'], // 3교시
  ['사회', '체육', '과학', '체육', '사회'], // 4교시
  ['체육', '음악', '미술', '과학', '음악'], // 5교시
  ['미술', '사회', '음악', '미술', '체육'], // 6교시 (3학년 이상만)
];

const cellKeyOf = (cls: string, day: string, period: number) => `${cls}-${day}-${period}`;

/**
 * buildSampleGrid — 모든 반을 그럴듯한 한 주 시간표로 채운 격자를 만든다.
 * 각 칸 = [과목 칩, 담당 교사 칩, (특별실 과목이면) 특별실 칩].
 * 반 순번마다 요일을 한 칸씩 밀어 반끼리 시간표가 겹쳐 보이지 않게 한다.
 * 저학년(1·2학년)은 5교시까지만 채워 하교가 이른 실제 모습을 반영한다.
 */
export function buildSampleGrid(): Record<string, { resource: Resource }[]> {
  const grid: Record<string, { resource: Resource }[]> = {};

  CLASSES.forEach((cls, classIdx) => {
    const grade = Number(cls.split('-')[0]);
    const lastPeriod = grade <= 2 ? 5 : 6; // 저학년은 5교시까지
    const dayShift = classIdx % DAYS.length; // 반마다 요일을 밀어 변화

    for (let p = 1; p <= lastPeriod; p++) {
      DAYS.forEach((day, dayIdx) => {
        const subjectName = WEEK_TEMPLATE[p - 1][(dayIdx + dayShift) % DAYS.length];
        const subject = SUBJECTS.find((s) => s.name === subjectName);
        if (!subject) return;

        const entries: { resource: Resource }[] = [{ resource: subject }];
        const teacher = TEACHER_BY_SUBJECT[subjectName];
        if (teacher) entries.push({ resource: teacher });
        const room = ROOM_BY_SUBJECT[subjectName];
        if (room) entries.push({ resource: room });

        grid[cellKeyOf(cls, day, p)] = entries;
      });
    }
  });

  return grid;
}
