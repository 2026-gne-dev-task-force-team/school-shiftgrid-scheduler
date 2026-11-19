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
import { loadConfig } from './orgConfig.js';

import { periodTime, combinedOf, findOverlaps as sharedOverlaps } from '../shared/overlap.js';

export { periodTime };

// 시각 계산·판정 핵심은 shared/overlap.js(화면과 공용). 여기선 응답용(cells 뺌) + 요일 범위 + 겸임만 얹는다.
export function findOverlaps(cells, ctx = {}) {
  const { periods = null, gradeOf = {}, external = [], weekdays = null } = ctx;
  const grade = (c) => gradeOf[c.classroom_id] ?? gradeOf[String(c.classroom_id)];
  const timeOf = (c) => (periods ? periodTime(periods, grade(c), c.period) : null);
  const found = [];

  // 기관 요일 수(기관 설정 weekdays)보다 큰 요일 번호 — 거부 아님, 수위(weekday_range)만 붙는다
  if (weekdays) {
    const out = new Map();
    for (const c of cells) if (c.weekday > weekdays) (out.get(c.weekday) ?? out.set(c.weekday, []).get(c.weekday)).push(c);
    for (const [wd, list] of out) found.push({ rule: 'weekday_range', weekday: wd, period: Math.min(...list.map((c) => c.period)), classroom_ids: [...new Set(list.map((c) => c.classroom_id))], detail: `요일 ${wd} — 기관 요일(${weekdays}일) 밖 칸 ${list.length}개` });
  }
  for (const { cells: _cells, ...f } of sharedOverlaps(cells, ctx)) found.push(f);

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
  const combined = combinedOf(small);

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
  const cfg = await loadConfig(pool, orgId);
  const roomCap = {};
  for (const r of (await pool.query(`SELECT id, capacity FROM special_room WHERE org_id = $1 AND deleted_at IS NULL AND capacity IS NOT NULL`, [orgId])).rows) roomCap[r.id] = r.capacity;
  const studentOf = {};
  if (clsIds.length) for (const r of (await pool.query(`SELECT id, student_count FROM classroom WHERE org_id = $1 AND id = ANY($2::bigint[]) AND student_count IS NOT NULL`, [orgId, clsIds])).rows) studentOf[r.id] = r.student_count;
  return { periods, gradeOf, combined, external, weekdays: cfg.weekdays.length, roomCap, studentOf, capCount: cfg.roomCapacity.count };
}

// 칸 목록 → 겹침(재료를 DB 에서 모아서)
export async function findOverlapsFor(pool, orgId, cells, opts) {
  return findOverlaps(cells, await overlapContext(pool, orgId, cells, opts));
}
