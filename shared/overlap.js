// 칸 겹침 규칙 — 서버(server/violations.js)와 화면(web/src/gen/overlap.js)이 같이 import 하는 한 파일(S-fix-16).
// 규칙을 고칠 곳은 여기뿐이다. 결과 항목에 겹친 칸 목록 cells 가 붙는다(칸 색칠용) — 서버는 응답에서 뺀다.
// cells: [{classroom_id, weekday, period, membership_id, special_room_id, subject_id?}]
// ctx: { periods: org.period_config, gradeOf: {classroom_id: grade}, combined: [[classroom_id...]], roomCap: {special_room_id: 정원}, studentOf: {classroom_id: 학생 수}, capCount: 'students'|'classes' }
const toMin = (s) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const clockOf = (lunchAfter, period) => (lunchAfter > 0 && period > lunchAfter ? period + 1 : period);
const gradeCfg = (periods, grade) => periods?.grades?.[grade] ?? periods?.grades?.[String(grade)] ?? {};

// 학년의 교시 → {start, end}(분) · 없으면 null. times 는 학년 칸이 먼저, 없으면 학교 공통(period_config.times).
export function periodTime(periods, grade, period) {
  const g = gradeCfg(periods, grade);
  const list = Array.isArray(g.times) ? g.times : Array.isArray(periods?.times) ? periods.times : null;
  const t = list?.[period - 1];
  if (!t) return null;
  const s = toMin(t.start ?? t[0]);
  const e = toMin(t.end ?? t[1]);
  return s != null && e != null && e > s ? { start: s, end: e } : null;
}
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function findOverlaps(cells, ctx = {}) {
  const { periods = null, gradeOf = {}, combined = [], roomCap = {}, studentOf = {}, capCount = 'students' } = ctx;
  const grade = (c) => gradeOf[c.classroom_id] ?? gradeOf[String(c.classroom_id)];
  const timeOf = (c) => (periods ? periodTime(periods, grade(c), c.period) : null);
  const slotOf = (c) => clockOf(periods ? Number(gradeCfg(periods, grade(c)).lunchAfter) || 0 : 0, c.period);
  // 복식 묶음(겹침 허용): 같은 묶음 반들이 같은 교과면 한 수업이다
  const groupOf = new Map();
  combined.forEach((ids, i) => { for (const id of ids) groupOf.set(String(id), i); });
  const isCombined = (list) => {
    if (!groupOf.size) return false;
    const g = new Set(list.map((c) => groupOf.get(String(c.classroom_id)) ?? `x${c.classroom_id}`));
    const s = new Set(list.map((c) => c.subject_id ?? null));
    return g.size === 1 && typeof [...g][0] === 'number' && s.size === 1;
  };

  const found = [];
  const scan = (key, rule, label) => {
    const by = new Map();
    for (const c of cells) {
      if (!c[key]) continue;
      const k = `${c[key]}:${c.weekday}`;
      (by.get(k) ?? by.set(k, []).get(k)).push(c);
    }
    for (const list of by.values()) {
      if (list.length < 2) continue;
      // 시각이 있는 칸끼리는 시각 구간으로, 시각이 없는 칸만 시각 칸(교시 번호)으로 따로 본다(단위가 달라 서로 섞어 재지 않는다)
      const times = list.map(timeOf);
      const timed = list.filter((_, i) => times[i]).map((c) => { const t = timeOf(c); return { c, s: t.start, e: t.end }; });
      const untimed = list.filter((_, i) => !times[i]).map((c) => ({ c, s: slotOf(c), e: slotOf(c) + 1 }));
      // 한쪽이라도 시각이 없는 짝은 교시 번호로 비교하고 「재확인」 수위로 낮춘다(시각 있는 칸 + 시각 없는 칸이 같이 있을 때만)
      // 시각 칸마다 따로 짝지어, 시각상 안 겹치는 시각 칸 둘이 같은 묶음에 적히지 않게 한다(S-fix-11)
      const mixed = untimed.length ? timed.map((t) => [t, ...untimed.filter((u) => u.c.period === t.c.period)].map(({ c }) => ({ c, s: c.period, e: c.period + 1 }))).filter((g) => g.length > 1) : [];
      for (const [items, byTime, isMixed] of [[timed, true, false], [untimed, false, false], ...mixed.map((g) => [g, false, true])]) {
      items.sort((a, b) => a.s - b.s || a.e - b.e);
      // 이어서 겹치는 덩어리로 묶는다
      let cur = [];
      let curEnd = -Infinity;
      const flush = () => {
        const classes = new Set(cur.map((x) => x.c.classroom_id));
        // 특별실 정원 합(S-fix-25): 같은 시각 같은 방 반들의 학생 수 합(capCount='classes' 면 반 수) > 정원. 복식 묶음·한 반만 쓸 때도 본다
        const cap = key === 'special_room_id' && !isMixed ? roomCap[cur[0].c[key]] : null;
        if (cap != null) {
          const n = capCount === 'classes' ? classes.size : [...classes].reduce((a, id) => a + (Number(studentOf[id]) || 0), 0);
          if (n > cap) found.push({ rule: 'room_capacity', cells: cur.map((x) => x.c), weekday: cur[0].c.weekday, period: Math.min(...cur.map((x) => x.c.period)), special_room_id: cur[0].c[key], classroom_ids: [...classes], detail: `특별실 정원 초과 — ${capCount === 'classes' ? `${n}개 반` : `학생 ${n}명`} > 정원 ${cap} (${cur[0].c.weekday}요일 ${[...new Set(cur.map((x) => x.c.period))].sort((a, b) => a - b).join('·')}교시)` });
        }
        if (classes.size < 2 || isCombined(cur.map((x) => x.c))) return;
        if (isMixed && !(cur.some((x) => timeOf(x.c)) && cur.some((x) => !timeOf(x.c)))) return;
        const first = cur[0].c;
        const when = byTime ? ` ${hhmm(cur[0].s)}~${hhmm(Math.max(...cur.map((x) => x.e)))}` : '';
        const ps = [...new Set(cur.map((x) => x.c.period))].sort((a, b) => a - b).join('·');
        found.push({ rule, cells: cur.map((x) => x.c), weekday: first.weekday, period: Math.min(...cur.map((x) => x.c.period)), [key]: first[key], classroom_ids: [...classes], detail: `${label} 겹침 (${first.weekday}요일 ${ps}교시${when})${isMixed ? ' — 교시 시각이 없어 교시 번호로 비교함' : ''}`, ...(isMixed ? { level: '재확인' } : {}) });
      };
      for (const it of items) {
        if (cur.length && it.s >= curEnd) { flush(); cur = []; curEnd = -Infinity; }
        cur.push(it);
        curEnd = Math.max(curEnd, it.e);
      }
      if (cur.length) flush();
      }
    }
  };
  scan('membership_id', 'teacher_overlap', '교사');
  scan('special_room_id', 'room_overlap', '특별실');

  return found;
}

// 소규모교 설정 → 겹침 허용 복식 묶음 [[classroom_id...]] (서버 overlapContext 와 같은 조건)
export const combinedOf = (small) => (small?.enabled && small.combined_mode !== 'separate' ? (small.combined ?? []).map((g) => g.classroom_ids ?? []) : []);
