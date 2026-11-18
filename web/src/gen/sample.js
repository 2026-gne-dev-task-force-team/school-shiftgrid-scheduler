// 벤치·시험용 가짜 학교 — 지어낸 이름만. 51반(1~6학년 8·8·8·9·9·9) · 전담 11 · 학년마다 점심 자리 다름.
const GRADES = { 1: 8, 2: 8, 3: 8, 4: 9, 5: 9, 6: 9 };
const PERIODS = { 1: { periods: 5, lunchAfter: 4 }, 2: { periods: 5, lunchAfter: 4 }, 3: { periods: 6, lunchAfter: 3 }, 4: { periods: 6, lunchAfter: 3 }, 5: { periods: 6, lunchAfter: 5 }, 6: { periods: 6, lunchAfter: 5 } };
const DEMAND = { 1: 23, 2: 23, 3: 26, 4: 26, 5: 29, 6: 29 };
// 교과 id: 1 국 2 수 3 사 4 과 5 도 6 체 7 음 8 미 9 영 10 실 11 창
// 전담 11: [이름, 교과, 학년들, 반당 시수, 특별실 id | null, 진도 맞춤]
const SPECIALISTS = [
  ['영어가', 9, [3], 2, null, true], ['영어나', 9, [4], 2, null, true],
  ['영어다', 9, [5], 3, null, true], ['영어라', 9, [6], 3, null, true],
  ['과학가', 4, [5], 2, 501, true], ['과학나', 4, [6], 2, 502, true],
  ['체육가', 6, [5], 2, 503, false], ['체육나', 6, [6], 2, null, false],
  ['음악가', 7, [5, 6], 1, 504, false], ['도덕가', 5, [5, 6], 1, null, false],
  ['실과가', 10, [5], 2, null, false],
];
const HOMEROOM_SUBJECTS = [1, 2, 3, 4, 8, 11, 6, 7, 5];

export function sampleSchool() {
  const classrooms = [];
  let cid = 1000;
  for (const [g, n] of Object.entries(GRADES)) for (let i = 1; i <= n; i++) classrooms.push({ id: ++cid, grade: Number(g), class_no: i });
  const lines = [];
  const used = new Map(); // 반 → 전담이 가져간 시수
  const subjOf = new Map(); // 반 → 전담 교과들
  SPECIALISTS.forEach(([, s, gs, h, room, sync], i) => {
    for (const c of classrooms.filter((x) => gs.includes(x.grade))) {
      lines.push({ classroom_id: c.id, membership_id: 900 + i, subject_id: s, special_room_id: room, weekly_hours: h, sync_progress: sync });
      used.set(c.id, (used.get(c.id) || 0) + h);
      if (!subjOf.has(c.id)) subjOf.set(c.id, new Set());
      subjOf.get(c.id).add(s);
    }
  });
  // 담임: 남은 시수를 담임 교과들에 나눈다
  for (const c of classrooms) {
    let left = DEMAND[c.grade] - (used.get(c.id) || 0);
    const subs = HOMEROOM_SUBJECTS.filter((s) => !subjOf.get(c.id)?.has(s));
    const per = Math.floor(left / subs.length);
    subs.forEach((s, i) => {
      const h = i === 0 ? left - per * (subs.length - 1) : per;
      if (h > 0) lines.push({ classroom_id: c.id, membership_id: 100 + c.id, subject_id: s, special_room_id: null, weekly_hours: h, sync_progress: false });
    });
    left = 0;
  }
  // 고정·금지 몇 개: 3·4학년 금 5교시 창체 고정 · 전담 둘 불가 시간 · 과학실 하나 불가
  const pins = [];
  for (const c of classrooms.filter((x) => x.grade === 3 || x.grade === 4)) pins.push({ target_kind: '반', target_id: c.id, weekday: 5, period: 5, kind: '고정', subject_id: 11 });
  pins.push({ target_kind: '교사', target_id: 900, weekday: 1, period: 1, kind: '금지' });
  pins.push({ target_kind: '교사', target_id: 906, weekday: 3, period: 6, kind: '금지' });
  pins.push({ target_kind: '특별실', target_id: 501, weekday: 2, period: 1, kind: '금지' });
  return { classrooms, periods: { grades: PERIODS }, lines, pins };
}
