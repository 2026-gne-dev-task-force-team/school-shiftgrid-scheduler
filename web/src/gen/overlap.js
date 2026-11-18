// 칸 겹침 규칙 — 화면용 복사본. 서버 server/violations.js 의 findOverlaps(겸임 external 만 뺌)와 같은 규칙이다.
// 서버 이미지엔 web/src 가, 웹 빌드엔 server/ 가 없을 수 있어 import 하지 않고 복사한다 — 같은 시험 표(test/s-fix-5.test.js)로 맞춘다.
// 규칙을 고치면 두 곳을 같이 고친다. 서버 것과 다른 점: 결과 항목에 겹친 칸 목록 cells 가 더 붙는다(칸 색칠용).
// cells: [{classroom_id, weekday, period, membership_id, special_room_id, subject_id?}]
// ctx: { periods: org.period_config, gradeOf: {classroom_id: grade}, combined: [[classroom_id...]] }
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
  const { periods = null, gradeOf = {}, combined = [] } = ctx;
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
      const mixed = timed.length && untimed.length ? list.map((c) => ({ c, s: c.period, e: c.period + 1 })) : [];
      for (const [items, byTime, isMixed] of [[timed, true, false], [untimed, false, false], [mixed, false, true]]) {
      items.sort((a, b) => a.s - b.s || a.e - b.e);
      // 이어서 겹치는 덩어리로 묶는다
      let cur = [];
      let curEnd = -Infinity;
      const flush = () => {
        const classes = new Set(cur.map((x) => x.c.classroom_id));
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
