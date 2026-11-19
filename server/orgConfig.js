// 기관 설정 — 학교마다 다른 값의 기본값은 여기 한 곳. 기관이 org.config 로 덮는다(하드코딩 금지 원칙).
// 상한(limits)은 거부선이 아니라 「평소보다 큼」 경고선이다. 거부는 아래 CEIL(넓은 안전 천장)에서만 한다.
export const DEFAULTS = {
  weekdays: ['월', '화', '수', '목', '금'],
  semesterStarts: [3, 9],
  limits: { periods: 12, grades: 12, classNo: 60, students: 100, capacity: 500, loadPerWeek: 40, block: 3, cells: 5000, rosterRows: 1000 },
  substitute: { order: ['A', 'B', 'C', 'D'], assistants: 'warn', lunchDuty: 'warn' },
  duties: ['담임', '전담', '비교과'],
  roleLabels: {},
  attendanceMonthlyCap: null,
  // 권장 규칙 17 의 숫자 기본값 — 기관이 바꾸고 org.soft_weights.params 가 또 덮는다. lunchAfter 는 학교 기본에 점심 자리가 없는 학년의 값.
  softParams: { maxConsec: 6, dailySubjectCap: 6, amTolerance: 3, maxPerDay: 6, teacherDayMode: '분산', earlyTiers: [1, 2], lunchAfter: 4 },
  roomCapacity: { count: 'students' }, // 특별실 정원 합을 학생 수('students')로 볼지 반 수('classes')로 볼지. 수위는 rule_levels.room_capacity
};

// zod 가 거부하는 넓은 안전 천장(이 위는 입력 실수·남용). 기관 limits 는 이 밑에서 경고만 한다.
export const CEIL = { periods: 30, grades: 20, classNo: 200, students: 300, capacity: 5000, loadPerWeek: 100, block: 12, cells: 50000, rosterRows: 5000 };

const LABEL = { periods: '교시 수', grades: '학년', classNo: '반 번호', students: '학생 수', capacity: '정원', loadPerWeek: '주당 시수', block: '연강', cells: '칸 수', rosterRows: '명단 줄 수' };

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
// 깊은 병합 — 객체는 안으로 들어가 합치고 배열·값은 통째로 덮는다. undefined 는 건너뛴다.
export function deepMerge(base, over) {
  if (!isObj(base) || !isObj(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) continue;
    out[k] = isObj(out[k]) && isObj(v) ? deepMerge(out[k], v) : v;
  }
  return out;
}

export const mergeConfig = (stored) => deepMerge(DEFAULTS, isObj(stored) ? stored : {});

export async function loadConfig(pool, orgId) {
  const { rows } = await pool.query(`SELECT config FROM org WHERE id = $1 AND deleted_at IS NULL`, [orgId]);
  return mergeConfig(rows[0]?.config);
}

// 「평소보다 큼」 경고. pairs: { periods: 14, classNo: 70 } → [{key, msg}] (한도 이하는 빠진다)
export function limitWarnings(cfg, pairs) {
  const out = [];
  for (const [key, v] of Object.entries(pairs)) {
    const lim = cfg.limits?.[key];
    if (typeof v === 'number' && typeof lim === 'number' && v > lim) out.push({ key, msg: `${LABEL[key] ?? key} ${v} — 평소보다 큽니다(기관 기준 ${lim}) — 맞는지 확인해 주세요` });
  }
  return out;
}

// 응답 본문에 경고를 붙인다(없으면 본문 그대로).
export const withWarnings = (body, warnings) => (warnings.length ? { ...body, warnings } : body);

// 담당 구분이 기관 목록 안인가. '담임' 은 후보 등급이 쓰는 값이라 늘 아는 값이다.
export const dutyKnown = (cfg, duty) => !duty || duty === '담임' || cfg.duties.includes(duty);
// 명단 올리기 글 → 담당 구분. 목록 글 그대로 > 담임 > 전담 > 비교과(옛 말 '전담·비교과' 는 전담). 그 밖 글은 그대로 두고(undefined = 너무 김) 알림 몫.
export const dutyFromText = (cfg, t) => (t === '' ? null : cfg.duties.includes(t) ? t : t.includes('담임') ? '담임' : t.includes('전담') ? '전담' : t.includes('비교과') ? '비교과' : t.length <= 20 ? t : undefined);
export const dutyWarnings = (cfg, duty) => (dutyKnown(cfg, duty) ? [] : [{ key: 'duty', msg: `담당 구분 「${duty}」 은 기관 목록(${cfg.duties.join('·')})에 없습니다 — 맞는지 확인해 주세요` }]);

// 학기: 시작 달 목록(길이 자유)에서 이번 달이 속한 구간의 번호(1부터). 첫 시작 달 앞은 마지막 학기(해 넘김).
export function semesterOf(cfg, month) {
  const s = [...new Set(cfg.semesterStarts)].sort((a, b) => a - b);
  let n = 0;
  for (let i = 0; i < s.length; i++) if (month >= s[i]) n = i + 1;
  return n || s.length || 1;
}

// 학년의 교시 수: 그 학년 칸 → 기관에 적힌 교시 수 중 가장 큰 값 → fallback. (따로 노는 기본값을 한 곳으로)
export function periodsOf(periodConfig, grade, fallback) {
  const g = periodConfig?.grades ?? {};
  const own = Number(g[String(grade)]?.periods);
  if (own > 0) return own;
  const all = Object.values(g).map((x) => Number(x?.periods)).filter((n) => n > 0);
  return all.length ? Math.max(...all) : fallback;
}
