// 칸 목록에서 겹침을 찾는다 — 거부 없이 목록만 낸다. 수위는 rules.js 가 붙인다.
// cells: [{classroom_id, weekday, period, membership_id, special_room_id, subject_id?}]
// ctx(없어도 됨): { periods: org.period_config, gradeOf: {classroom_id: grade}, combined: [[classroom_id...]], external: [...] }
//
// 겹침은 교시가 아니라 시각으로 본다(학년마다 점심 자리가 달라 같은 「N교시」가 다른 시각이다).
//   1) 학교 기본에 그 학년 교시의 시작·끝 시각(times)이 있으면 → 시각 구간이 겹치는가
//   2) 시각이 없으면 → 점심 자리(lunchAfter)로 민 시각 칸(생성기·수정 모드와 같은 셈)
//   3) 점심 자리도 없으면 → 교시 번호 그대로
// 겸임 교사: ctx.external 에 다른 기관의 「오늘 적용 중인 확정본」 수업을 넣으면 같이 본다(둘 다 시각이 있으면 시각, 아니면 교시 번호).
import { appliedTimetable } from './applied.js';

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
  const { periods = null, gradeOf = {}, combined = [], external = [] } = ctx;
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
        found.push({ rule, weekday: first.weekday, period: Math.min(...cur.map((x) => x.c.period)), [key]: first[key], classroom_ids: [...classes], detail: `${label} 겹침 (${first.weekday}요일 ${ps}교시${when})${isMixed ? ' — 교시 시각이 없어 교시 번호로 비교함' : ''}`, ...(isMixed ? { level: '재확인' } : {}) });
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

  // 겸임: 다른 기관 수업 [{membership_id(이 기관 소속 id), weekday, period, start?, end?}]
  if (external.length) {
    const seen = new Set();
    for (const c of cells) {
      if (!c.membership_id) continue;
      const mine = timeOf(c);
      for (const x of external) {
        if (String(x.membership_id) !== String(c.membership_id) || x.weekday !== c.weekday) continue;
        const hit = mine && x.start != null && x.end != null ? mine.start < x.end && x.start < mine.end : x.period === c.period;
        if (!hit) continue;
        const k = `${c.classroom_id}:${c.weekday}:${c.period}`;
        if (seen.has(k)) continue;
        seen.add(k);
        found.push({ rule: 'teacher_overlap', other_org: true, weekday: c.weekday, period: c.period, membership_id: c.membership_id, classroom_ids: [c.classroom_id], detail: `교사 겹침 — 다른 기관 수업과 (${c.weekday}요일 ${c.period}교시)` });
      }
    }
  }
  return found;
}

// DB 에서 겹침 검사 재료를 모은다: 이 기관 교시 설정 · 반 학년 · 복식 묶음 · 겸임 교사의 다른 기관 수업(그 기관의 오늘 적용 확정본)
export async function overlapContext(pool, orgId, cells, { date } = {}) {
  const org = (await pool.query(`SELECT period_config, small_school FROM org WHERE id = $1`, [orgId])).rows[0] ?? {};
  const periods = org.period_config ?? {};
  const clsIds = [...new Set(cells.map((c) => Number(c.classroom_id)).filter(Boolean))];
  const gradeOf = {};
  if (clsIds.length) {
    for (const r of (await pool.query(`SELECT id, grade FROM classroom WHERE org_id = $1 AND id = ANY($2::bigint[])`, [orgId, clsIds])).rows) gradeOf[r.id] = r.grade;
  }
  const small = org.small_school ?? {};
  const combined = small.enabled && small.combined_mode !== 'separate' ? (small.combined ?? []).map((g) => g.classroom_ids ?? []) : [];

  const external = [];
  const mIds = [...new Set(cells.map((c) => Number(c.membership_id)).filter(Boolean))];
  if (mIds.length) {
    const links = (await pool.query(
      `SELECT m.id AS mine, o.id AS other, o.org_id, og.period_config
         FROM membership m JOIN membership o ON o.user_id = m.user_id AND o.org_id <> m.org_id AND o.deleted_at IS NULL
         JOIN org og ON og.id = o.org_id AND og.deleted_at IS NULL
        WHERE m.org_id = $1 AND m.id = ANY($2::bigint[]) AND m.deleted_at IS NULL`, [orgId, mIds])).rows;
    const ttCache = new Map();
    for (const l of links) {
      if (!ttCache.has(l.org_id)) ttCache.set(l.org_id, await appliedTimetable(pool, l.org_id, date));
      const tt = ttCache.get(l.org_id);
      if (!tt) continue;
      const rows = (await pool.query(
        `SELECT c.weekday, c.period, cl.grade FROM cell c JOIN classroom cl ON cl.id = c.classroom_id
          WHERE c.org_id = $1 AND c.timetable_id = $2 AND c.membership_id = $3 AND c.deleted_at IS NULL`, [l.org_id, tt.id, l.other])).rows;
      for (const r of rows) {
        const t = periodTime(l.period_config ?? {}, r.grade, r.period);
        external.push({ membership_id: Number(l.mine), weekday: r.weekday, period: r.period, start: t?.start ?? null, end: t?.end ?? null });
      }
    }
  }
  return { periods, gradeOf, combined, external };
}

// 칸 목록 → 겹침(재료를 DB 에서 모아서)
export async function findOverlapsFor(pool, orgId, cells, opts) {
  return findOverlaps(cells, await overlapContext(pool, orgId, cells, opts));
}
