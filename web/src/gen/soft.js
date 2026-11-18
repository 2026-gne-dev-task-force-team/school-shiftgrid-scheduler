// 권장 규칙 17 — 순수 함수만(웹 워커에서 import 가능 · DOM·fetch 없음).
// 규칙은 점수가 아니라 「위반 목록」을 낸다. 점수는 묶음(거의필수 100 · 중요 20 · 선호 3) × 교사 티어 배수.
// 가중 숫자는 사용자에게 안 보이고 우선순위(묶음)로만 받는다. 기관 설정 JSON(org.soft_weights)이 DEFAULT_WEIGHTS 를 덮는다.
//
// state 꼴(생성기·검사기가 같은 모양으로 만든다)
//   classrooms: [{id, grade, class_no}]
//   teachers:   [{id, tier}]                      tier 1 보직 · 2 일반 전담 · 3 지원인력
//   cells:      [{classroom_id, weekday, period, subject_id, teacher_id, room_id}]
//   lunchAfter: {grade: n}                        n 교시 뒤가 점심(기본 4)
//   avoid:      {teacher_id: [{weekday, period}]}  회피 칸
//   options:    {roomClassSplit, oneSubjectDay: bool}  기본 끔인 둘
//   params:     {earlyTiers=[1,2], maxConsec=6, dailySubjectCap=6, amTolerance=3, teacherDayMode='분산'|'몰기', roundSubjects:[subject_id]}

export const BANDS = ['거의필수', '중요', '선호'];

export const DEFAULT_WEIGHTS = {
  bands: { 거의필수: 100, 중요: 20, 선호: 3 },
  // 규칙마다 묶음을 바꾸고 싶을 때 { code: '중요' }
  ruleBand: {},
  // 교사 티어 배수. avoidance 는 티어 차등이 세기를 맡는다(티어1 ×300 · 티어3 ×1) — 티어2 는 중간값(⚠️ 원문에 없어 클로드가 잡은 값)
  tierMult: { 1: 1, 2: 1, 3: 1 },
  avoidanceTierMult: { 1: 300, 2: 30, 3: 1 },
};

export const SOFT_RULES = {
  lunchBreak: { label: '교사 점심시간 확보', band: '거의필수' },
  roomClassSplit: { label: '하루 한 장소', band: '거의필수', optional: true },
  oneSubjectDay: { label: '하루 한 학년·과목', band: '거의필수', optional: true },
  consecutive: { label: '연속수업 제한', band: '중요' },
  compactDay: { label: '일과 압축(공강 없애기)', band: '중요' },
  prefConsec: { label: '연속수업 선호(토막 줄이기)', band: '중요' },
  roundSync: { label: '차시 순환(라운드로빈)', band: '중요' },
  classDailyCap: { label: '1일 과목 수 상한', band: '중요' },
  cycleSpread: { label: '차시 요일분산(하루 1회)', band: '중요' },
  subjAdjacent: { label: '같은 과목 붙이기', band: '중요' },
  gradeBlock: { label: '학년 묶기', band: '중요' },
  avoidance: { label: '회피 선호', band: '선호' },
  amBalance: { label: '오전·오후 균형', band: '선호' },
  sameDaySamePeriod: { label: '요일별 동일 교시', band: '선호' },
  teacherDayCompact: { label: '교사 요일 배치', band: '선호' },
  blockPref: { label: '쪼갠 연강 붙여두기', band: '선호' },
  priorityEarly: { label: '상위 교사 이른 시각 우선', band: '선호' },
};

// ── 도우미 ──
const P = (state, k, d) => state.params?.[k] ?? d;
const lunchOf = (state, grade) => state.lunchAfter?.[grade] ?? 4;
const gradeMap = (state) => new Map((state.classrooms || []).map((c) => [c.id, c.grade]));
const cellsOf = (state) => (state.cells || []).filter((c) => c.teacher_id != null || c.subject_id != null);
function groupBy(list, keyFn) {
  const m = new Map();
  for (const x of list) {
    const k = keyFn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}
// 교사 기준 규칙이 보는 칸 — 복식으로 묶여 한 수업인 칸(dup)은 한 번만 센다
const taughtCells = (state) => (state.cells || []).filter((c) => c.teacher_id != null && !c.dup);
// 교사·요일별 교시 오름차순 칸
function teacherDays(state) {
  const taught = taughtCells(state);
  const out = [];
  for (const [k, list] of groupBy(taught, (c) => `${c.teacher_id}|${c.weekday}`)) {
    const [t, d] = k.split('|');
    out.push({ teacher_id: Number(t), weekday: Number(d), cells: list.slice().sort((a, b) => a.period - b.period) });
  }
  return out;
}
// 교시 목록 → 이어진 덩어리 길이들
function runs(periods) {
  const ps = [...new Set(periods)].sort((a, b) => a - b);
  const out = [];
  let len = 0;
  ps.forEach((p, i) => {
    len = i > 0 && p === ps[i - 1] + 1 ? len + 1 : 1;
    if (i === ps.length - 1 || ps[i + 1] !== p + 1) out.push(len);
  });
  return out;
}

// ── 규칙 17개 — 각자 위반 배열 [{teacher_id?, classroom_id?, weekday?, n?}] (n = 같은 위반 몇 번 · 기본 1) ──
export const rules = {
  // 교사가 자기 학년 점심 앞뒤 교시를 연달아 가르침(식사 칸이 없음)
  lunchBreak(state) {
    const g = gradeMap(state);
    const out = [];
    for (const td of teacherDays(state)) {
      const ps = new Set(td.cells.map((c) => c.period));
      for (const c of td.cells) {
        if (c.period === lunchOf(state, g.get(c.classroom_id)) && ps.has(c.period + 1)) { out.push({ teacher_id: td.teacher_id, weekday: td.weekday }); break; }
      }
    }
    return out;
  },
  // 같은 반이 같은 날 장소(특별실)를 둘 이상 옮겨 다님
  roomClassSplit(state) {
    const out = [];
    for (const [, list] of groupBy(cellsOf(state), (c) => `${c.classroom_id}|${c.weekday}`)) {
      const n = new Set(list.map((c) => c.room_id).filter((x) => x != null)).size;
      if (n > 1) out.push({ classroom_id: list[0].classroom_id, weekday: list[0].weekday, n: n - 1 });
    }
    return out;
  },
  // 교사가 하루에 여러 학년·교과를 가르침
  oneSubjectDay(state) {
    const g = gradeMap(state);
    const out = [];
    for (const td of teacherDays(state)) {
      const n = new Set(td.cells.map((c) => `${g.get(c.classroom_id)}|${c.subject_id}`)).size;
      if (n > 1) out.push({ teacher_id: td.teacher_id, weekday: td.weekday, n: n - 1 });
    }
    return out;
  },
  // 연속 maxConsec 교시 넘김 — 넘은 교시 수만큼
  consecutive(state) {
    const max = P(state, 'maxConsec', 6);
    const out = [];
    for (const td of teacherDays(state)) {
      for (const len of runs(td.cells.map((c) => c.period))) if (len > max) out.push({ teacher_id: td.teacher_id, weekday: td.weekday, n: len - max });
    }
    return out;
  },
  // 교사 하루 첫~마지막 사이 빈 교시(점심은 교시 사이 틈이라 칸이 아니므로 안 센다). 학급엔 안 건다
  compactDay(state) {
    const out = [];
    for (const td of teacherDays(state)) {
      const ps = [...new Set(td.cells.map((c) => c.period))];
      const gaps = Math.max(...ps) - Math.min(...ps) + 1 - ps.length;
      if (gaps > 0) out.push({ teacher_id: td.teacher_id, weekday: td.weekday, n: gaps });
    }
    return out;
  },
  // 하루에 덩어리가 둘 이상이면 외톨이(1교시짜리) 덩어리마다
  prefConsec(state) {
    const out = [];
    for (const td of teacherDays(state)) {
      const rs = runs(td.cells.map((c) => c.period));
      const singles = rs.length > 1 ? rs.filter((l) => l === 1).length : 0;
      if (singles) out.push({ teacher_id: td.teacher_id, weekday: td.weekday, n: singles });
    }
    return out;
  },
  // roundSubjects 의 교과: 같은 학년 반들이 반 번호 순서대로 (요일, 교시) 가 늦어지는 순환이어야 한다 — 순서가 뒤집힌 이웃 쌍마다
  roundSync(state) {
    const subs = new Set(P(state, 'roundSubjects', []));
    if (!subs.size) return [];
    const cls = new Map((state.classrooms || []).map((c) => [c.id, c]));
    const out = [];
    const picked = (state.cells || []).filter((c) => subs.has(c.subject_id) && cls.has(c.classroom_id));
    for (const [, list] of groupBy(picked, (c) => `${cls.get(c.classroom_id).grade}|${c.subject_id}`)) {
      const first = new Map();
      for (const c of list) {
        const k = c.weekday * 100 + c.period;
        if (!first.has(c.classroom_id) || k < first.get(c.classroom_id)) first.set(c.classroom_id, k);
      }
      const order = [...first.entries()].sort((a, b) => cls.get(a[0]).class_no - cls.get(b[0]).class_no).map((e) => e[1]);
      for (let i = 1; i < order.length; i++) if (order[i] < order[i - 1]) out.push({ classroom_id: [...first.keys()][i] });
    }
    return out;
  },
  // 반의 하루 과목 수가 상한 초과
  classDailyCap(state) {
    const cap = P(state, 'dailySubjectCap', 6);
    const out = [];
    for (const [, list] of groupBy(cellsOf(state), (c) => `${c.classroom_id}|${c.weekday}`)) {
      const n = new Set(list.map((c) => c.subject_id).filter((x) => x != null)).size;
      if (n > cap) out.push({ classroom_id: list[0].classroom_id, weekday: list[0].weekday, n: n - cap });
    }
    return out;
  },
  // 같은 반·교과가 같은 날 두 번 이상(요일 분산 위반) — 초과분만큼
  cycleSpread(state) {
    const out = [];
    for (const [, list] of groupBy(cellsOf(state).filter((c) => c.subject_id != null), (c) => `${c.classroom_id}|${c.subject_id}|${c.weekday}`)) {
      if (list.length > 1) out.push({ classroom_id: list[0].classroom_id, weekday: list[0].weekday, n: list.length - 1 });
    }
    return out;
  },
  // 같은 반·교과가 같은 날 두 번 이상이면 붙어 있어야 하고 점심을 넘지 않아야 한다
  subjAdjacent(state) {
    const g = gradeMap(state);
    const out = [];
    for (const [, list] of groupBy(cellsOf(state).filter((c) => c.subject_id != null), (c) => `${c.classroom_id}|${c.subject_id}|${c.weekday}`)) {
      if (list.length < 2) continue;
      const ps = list.map((c) => c.period);
      const lo = Math.min(...ps);
      const hi = Math.max(...ps);
      const split = hi - lo + 1 > ps.length || (lo <= lunchOf(state, g.get(list[0].classroom_id)) && hi > lunchOf(state, g.get(list[0].classroom_id)));
      if (split) out.push({ classroom_id: list[0].classroom_id, weekday: list[0].weekday });
    }
    return out;
  },
  // 교사 하루 안에서 학년이 바뀌는 횟수
  gradeBlock(state) {
    const g = gradeMap(state);
    const out = [];
    for (const td of teacherDays(state)) {
      let n = 0;
      for (let i = 1; i < td.cells.length; i++) if (g.get(td.cells[i].classroom_id) !== g.get(td.cells[i - 1].classroom_id)) n++;
      if (n) out.push({ teacher_id: td.teacher_id, weekday: td.weekday, n });
    }
    return out;
  },
  // 회피 칸에 수업이 들어감 — 세기는 교사 티어가 맡는다
  avoidance(state) {
    const out = [];
    for (const c of taughtCells(state)) {
      const av = state.avoid?.[c.teacher_id];
      if (av && av.some((a) => a.weekday === c.weekday && a.period === c.period)) out.push({ teacher_id: c.teacher_id, weekday: c.weekday });
    }
    return out;
  },
  // 교사 한 주의 오전·오후 차이가 amTolerance 초과 — 넘은 만큼
  amBalance(state) {
    const g = gradeMap(state);
    const tol = P(state, 'amTolerance', 3);
    const out = [];
    for (const [t, list] of groupBy(taughtCells(state), (c) => c.teacher_id)) {
      let am = 0;
      let pm = 0;
      for (const c of list) (c.period <= lunchOf(state, g.get(c.classroom_id)) ? am++ : pm++);
      if (Math.abs(am - pm) > tol) out.push({ teacher_id: t, n: Math.abs(am - pm) - tol });
    }
    return out;
  },
  // 같은 반·교과가 요일마다 다른 교시에 있으면 (서로 다른 교시 수 − 1)
  sameDaySamePeriod(state) {
    const out = [];
    for (const [, list] of groupBy(cellsOf(state).filter((c) => c.subject_id != null), (c) => `${c.classroom_id}|${c.subject_id}`)) {
      const n = new Set(list.map((c) => c.period)).size;
      if (n > 1 && new Set(list.map((c) => c.weekday)).size > 1) out.push({ classroom_id: list[0].classroom_id, n: n - 1 });
    }
    return out;
  },
  // 교사 요일 배치 — '몰기': 가능한 최소 요일 수보다 더 쓴 날 / '분산': 한 날에 몰린 만큼
  teacherDayCompact(state) {
    const mode = P(state, 'teacherDayMode', '분산');
    const out = [];
    for (const [t, list] of groupBy(taughtCells(state), (c) => c.teacher_id)) {
      const perDay = [...groupBy(list, (c) => c.weekday).values()].map((x) => x.length);
      const days = perDay.length;
      const per = P(state, 'maxPerDay', 6);
      if (mode === '몰기') {
        const extra = days - Math.ceil(list.length / per);
        if (extra > 0) out.push({ teacher_id: t, n: extra });
      } else {
        const extra = Math.min(5, list.length) - days;
        if (extra > 0) out.push({ teacher_id: t, n: extra });
      }
    }
    return out;
  },
  // 쪼갠 연강: 같은 반·교과가 어떤 날은 연속 2시간 이상인데 다른 날 1시간짜리 조각이 남았으면 조각마다
  blockPref(state) {
    const out = [];
    for (const [, list] of groupBy(cellsOf(state).filter((c) => c.subject_id != null), (c) => `${c.classroom_id}|${c.subject_id}`)) {
      const counts = [...groupBy(list, (c) => c.weekday).values()].map((x) => x.length);
      if (counts.some((n) => n >= 2)) {
        const singles = counts.filter((n) => n === 1).length;
        if (singles) out.push({ classroom_id: list[0].classroom_id, n: singles });
      }
    }
    return out;
  },
  // 티어 1·2 교사 수업이 점심 뒤로 밀린 칸마다 (티어 3 은 안 센다)
  priorityEarly(state) {
    const g = gradeMap(state);
    const tier = new Map((state.teachers || []).map((t) => [t.id, t.tier]));
    const out = [];
    for (const c of taughtCells(state)) {
      const tr = tier.get(c.teacher_id);
      if (P(state, 'earlyTiers', [1, 2]).includes(tr) && c.period > lunchOf(state, g.get(c.classroom_id))) out.push({ teacher_id: c.teacher_id, weekday: c.weekday });
    }
    return out;
  },
};

// ── 가중 ──
// 기관 설정 JSON → 안전한 가중. 모르는 키·숫자 아닌 값은 기본값으로 돌린다.
export function resolveWeights(stored) {
  const s = stored && typeof stored === 'object' ? stored : {};
  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100000 ? v : d);
  const mapNum = (src, dflt) => Object.fromEntries(Object.keys(dflt).map((k) => [k, num(src?.[k], dflt[k])]));
  const ruleBand = {};
  for (const [k, v] of Object.entries(s.ruleBand || {})) if (SOFT_RULES[k] && BANDS.includes(v)) ruleBand[k] = v;
  return {
    bands: mapNum(s.bands, DEFAULT_WEIGHTS.bands),
    ruleBand,
    tierMult: mapNum(s.tierMult, DEFAULT_WEIGHTS.tierMult),
    avoidanceTierMult: mapNum(s.avoidanceTierMult, DEFAULT_WEIGHTS.avoidanceTierMult),
  };
}

// 규칙 하나의 점수. levels[code] === '끔' 이면 0. 켜고 끄는 선택 규칙(roomClassSplit·oneSubjectDay)은 options 가 켜야 센다.
export function ruleScore(code, state, levels = {}, weights = DEFAULT_WEIGHTS) {
  const meta = SOFT_RULES[code];
  if (!meta || levels?.[code] === '끔') return { count: 0, score: 0, violations: [] };
  if (meta.optional && !state.options?.[code]) return { count: 0, score: 0, violations: [] };
  const w = resolveWeights(weights);
  const band = w.ruleBand[code] || meta.band;
  const tier = new Map((state.teachers || []).map((t) => [t.id, t.tier]));
  const violations = rules[code](state);
  let count = 0;
  let score = 0;
  for (const v of violations) {
    const n = v.n ?? 1;
    const tr = tier.get(v.teacher_id) ?? 2;
    const mult = code === 'avoidance' ? w.avoidanceTierMult[tr] ?? 1 : v.teacher_id != null ? w.tierMult[tr] ?? 1 : 1;
    count += n;
    score += n * w.bands[band] * mult;
  }
  return { count, score, violations };
}

// 전체 점수 — 낮을수록 좋다. { total, byRule: {code: {count, score}} }
export function softScore(state, levels = {}, weights = DEFAULT_WEIGHTS) {
  const byRule = {};
  let total = 0;
  for (const code of Object.keys(SOFT_RULES)) {
    const { count, score } = ruleScore(code, state, levels, weights);
    byRule[code] = { count, score };
    total += score;
  }
  return { total, byRule };
}
