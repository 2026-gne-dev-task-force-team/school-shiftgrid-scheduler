import express from 'express';
import { z } from 'zod';
import { requireOrgAction } from '../guard.js';
import { can } from '../permissions.js';
import { audit } from '../audit.js';
import { seal, unseal } from '../seal.js';
import { rankCandidates, fairness, REASONS } from '../candidates.js';
import { currentTerm } from './school.js';
import { CEIL, limitWarnings, loadConfig, withWarnings } from '../orgConfig.js';
import { appliedTimetable } from '../applied.js';

// 보결: 올리기 · 후보(A~D·제외 사유) · 맡기(먼저 누른 한 명) · 형평성 · 관리자 강제 지정·해제.
// 후보 밖 사람이 맡아도 거부하지 않고 경고 목록으로 돌려준다(업무 규칙은 알림·경고).
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const idz = z.coerce.number().int().positive();
const notFound = (res) => res.status(404).json({ error: '없습니다' });
const bad = (res) => res.status(400).json({ error: '입력을 확인해 주세요' });
const weekdayOf = (d) => ((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

const createIn = z.object({
  on_date: DATE,
  absent_membership_id: idz.optional(), // 관리자만 — 없으면 본인
  all_day: z.boolean().optional(),
  items: z.array(z.object({ period: z.number().int().min(1).max(CEIL.periods), classroom_id: idz.nullable().optional() })).max(CEIL.periods).optional(),
  reason_kind: z.string().trim().max(20).nullable().optional(),
  reason: z.string().trim().max(500).nullable().optional(),
});
const assignIn = z.object({ membership_id: idz.optional(), outside_name: z.string().trim().min(1).max(40).optional() })
  .refine((v) => !!v.membership_id !== !!v.outside_name);

export function substituteRouter(pool, opts = {}) {
  const r = express.Router({ mergeParams: true });
  const own = requireOrgAction('substitute.own');

  const me = async (req) =>
    (await pool.query(`SELECT id FROM membership WHERE org_id = $1 AND user_id = $2 AND deleted_at IS NULL`, [req.orgId, req.session.userId])).rows[0];
  const isAdmin = (req) => can(req.session.role, 'substitute.force');

  const SEL = `SELECT s.id, to_char(s.on_date,'YYYY-MM-DD') AS on_date, s.period, s.classroom_id, c.grade, c.class_no, s.reason_kind, s.reason_enc,
      s.status, s.all_day, s.grade_ab, s.absent_membership_id, au.name AS absent_name, s.taken_membership_id, tu.name AS taken_name, s.taken_outside_name
    FROM substitute s
    LEFT JOIN classroom c ON c.id = s.classroom_id
    JOIN membership am ON am.id = s.absent_membership_id JOIN app_user au ON au.id = am.user_id
    LEFT JOIN membership tm ON tm.id = s.taken_membership_id LEFT JOIN app_user tu ON tu.id = tm.user_id`;
  // 사유 글은 관리자와 본인만 푼다 — 나머지에게는 열쇠 자체를 안 준다
  const present = (row, admin, myId) => {
    const { reason_enc, ...rest } = row;
    const may = admin || String(row.absent_membership_id) === String(myId);
    return { ...rest, mine: String(row.absent_membership_id) === String(myId), taken_by_me: row.taken_membership_id != null && String(row.taken_membership_id) === String(myId), reason: may ? unseal(reason_enc) : undefined, has_reason: !!reason_enc };
  };
  const getOne = async (req) => {
    const sid = idz.safeParse(req.params.sid);
    if (!sid.success) return null;
    return (await pool.query(`${SEL} WHERE s.id = $1 AND s.org_id = $2 AND s.deleted_at IS NULL`, [sid.data, req.orgId])).rows[0] ?? null;
  };
  const refOk = async (sql, id, orgId) => !id || !!(await pool.query(sql, [id, orgId])).rows[0];
  const MEM = `SELECT 1 FROM membership WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL AND status = '사용'`;

  // 그 날 적용되는 확정 시간표
  async function activeTimetable(orgId, date) {
    return appliedTimetable(pool, orgId, date); // 규칙 한 곳: server/applied.js
  }

  async function candidatesFor(orgId, s) {
    const tt = await activeTimetable(orgId, s.on_date);
    const weekday = weekdayOf(s.on_date);
    const N = (v) => (v == null ? v : Number(v));
    const cells = tt ? (await pool.query(`SELECT classroom_id, weekday, period, subject_id, membership_id FROM cell WHERE org_id = $1 AND timetable_id = $2 AND deleted_at IS NULL`, [orgId, tt.id])).rows.map((c) => ({ ...c, classroom_id: N(c.classroom_id), membership_id: N(c.membership_id) })) : [];
    const members = (await pool.query(
      `SELECT m.id, u.name, m.duty, (SELECT json_build_object('id', c.id, 'grade', c.grade) FROM classroom c WHERE c.homeroom_membership_id = m.id AND c.deleted_at IS NULL LIMIT 1) AS homeroom
       FROM membership m JOIN app_user u ON u.id = m.user_id
       WHERE m.org_id = $1 AND m.deleted_at IS NULL AND m.status = '사용' AND m.role IN ('기관관리자','교직원')`, [orgId])).rows.map((m) => ({ ...m, id: N(m.id) }));
    const periodConfig = (await pool.query(`SELECT period_config FROM org WHERE id = $1`, [orgId])).rows[0]?.period_config ?? {};
    const day = (await pool.query(
      `SELECT absent_membership_id AS a, period, all_day, taken_membership_id AS t, status FROM substitute
       WHERE org_id = $1 AND on_date = $2::date AND deleted_at IS NULL AND status <> '취소'`, [orgId, s.on_date])).rows;
    const absentIds = new Set(day.filter((d) => d.all_day || d.period === s.period).map((d) => N(d.a)));
    const takenIds = new Set(day.filter((d) => d.status === '맡음' && d.period === s.period && d.t).map((d) => N(d.t)));
    const pins = (await pool.query(`SELECT target_id, weekday, period FROM pin WHERE org_id = $1 AND target_kind = '교사' AND kind = '금지' AND deleted_at IS NULL`, [orgId])).rows.map((p) => ({ ...p, target_id: Number(p.target_id) }));
    return {
      tt: !!tt,
      ...rankCandidates({ config: await loadConfig(pool, orgId), weekday, period: s.period, periodConfig, cells, members, absentIds, pins, takenIds, exclude: new Set([N(s.absent_membership_id)]) }),
    };
  }

  // 목록 — 기간으로 거른다
  r.get('/substitutes', own, async (req, res, next) => {
    try {
      const q = z.object({ from: DATE.optional(), to: DATE.optional(), status: z.enum(['열림', '맡음', '취소']).optional() }).safeParse(req.query);
      if (!q.success) return bad(res);
      const m = await me(req);
      const { rows } = await pool.query(
        `${SEL} WHERE s.org_id = $1 AND s.deleted_at IS NULL AND ($2::date IS NULL OR s.on_date >= $2::date) AND ($3::date IS NULL OR s.on_date <= $3::date) AND ($4::text IS NULL OR s.status = $4)
         ORDER BY s.on_date DESC, s.period, s.id LIMIT 500`, [req.orgId, q.data.from ?? null, q.data.to ?? null, q.data.status ?? null]);
      res.json({ me: m?.id ?? null, reasons: REASONS, rows: rows.map((x) => present(x, isAdmin(req), m?.id)) });
    } catch (e) { next(e); }
  });

  // 형평성 — 「안 간 사람」부터. 한 번도 안 간 사람도 0 으로
  r.get('/substitutes/fairness', own, async (req, res, next) => {
    try {
      const t = await currentTerm(pool, req.orgId);
      const members = (await pool.query(
        `SELECT m.id, u.name FROM membership m JOIN app_user u ON u.id = m.user_id
         WHERE m.org_id = $1 AND m.deleted_at IS NULL AND m.status = '사용' AND m.role IN ('기관관리자','교직원') AND m.duty IS NOT NULL`, [req.orgId])).rows;
      const takes = (await pool.query(
        `SELECT taken_membership_id AS membership_id, taken_outside_name AS outside_name, to_char(on_date,'YYYY-MM-DD') AS on_date FROM substitute
         WHERE org_id = $1 AND term_id = $2 AND status = '맡음' AND deleted_at IS NULL`, [req.orgId, t.id])).rows.map((x) => ({ ...x, membership_id: x.membership_id && Number(x.membership_id) }));
      res.json({ term_id: t.id, rows: fairness(members.map((x) => ({ ...x, id: Number(x.id) })), takes) });
    } catch (e) { next(e); }
  });

  // 올리기 — 본인 결강(관리자는 남의 것도). 종일이면 그 날 그 사람의 칸 전부
  r.post('/substitutes', own, async (req, res, next) => {
    try {
      const p = createIn.safeParse(req.body);
      if (!p.success) return bad(res);
      const d = p.data;
      const m = await me(req);
      if (!m) return notFound(res);
      let absent = m.id;
      if (d.absent_membership_id && Number(d.absent_membership_id) !== Number(m.id)) {
        if (!isAdmin(req)) return notFound(res);
        if (!(await refOk(MEM, d.absent_membership_id, req.orgId))) return notFound(res);
        absent = d.absent_membership_id;
      }
      const term = await currentTerm(pool, req.orgId);
      let items = d.items ?? [];
      if (d.all_day) {
        const tt = await activeTimetable(req.orgId, d.on_date);
        items = tt ? (await pool.query(
          `SELECT period, classroom_id FROM cell WHERE org_id = $1 AND timetable_id = $2 AND membership_id = $3 AND weekday = $4 AND deleted_at IS NULL ORDER BY period`,
          [req.orgId, tt.id, absent, weekdayOf(d.on_date)])).rows : [];
      }
      if (!items.length) return res.status(400).json({ error: '올릴 교시가 없습니다' });
      for (const it of items) {
        if (it.classroom_id && !(await refOk(`SELECT 1 FROM classroom WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`, it.classroom_id, req.orgId))) return notFound(res);
      }
      const enc = seal(d.reason);
      const made = [];
      const dup = [];
      for (const it of items) {
        const ins = await pool.query(
          `INSERT INTO substitute (org_id, term_id, absent_membership_id, on_date, period, classroom_id, reason_kind, reason_enc, all_day)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING RETURNING id`,
          [req.orgId, term.id, absent, d.on_date, it.period, it.classroom_id ?? null, d.reason_kind ?? null, enc, !!d.all_day]);
        if (ins.rows[0]) made.push(ins.rows[0].id); else dup.push(it.period);
      }
      await audit(pool, { orgId: req.orgId, userId: req.session.userId, action: 'substitute.create', table: 'substitute', rowId: made[0] ?? null, after: { on_date: d.on_date, ids: made } });
      res.status(made.length ? 201 : 409).json(withWarnings({ ids: made, duplicate_periods: dup, ...(made.length ? {} : { error: '이미 같은 것이 있습니다' }) }, limitWarnings(await loadConfig(pool, req.orgId), { periods: Math.max(0, ...items.map((i) => i.period)) })));
    } catch (e) { next(e); }
  });

  r.get('/substitutes/:sid/candidates', own, async (req, res, next) => {
    try {
      const s = await getOne(req);
      if (!s) return notFound(res);
      res.json({ substitute: present(s, isAdmin(req), (await me(req))?.id), ...(await candidatesFor(req.orgId, s)) });
    } catch (e) { next(e); }
  });

  // 맡기 — 승인 없이 바로 확정. 한 조각짜리 조건부 UPDATE 라 동시에 눌러도 먼저 든 한 명만 성공한다
  async function claim(req, res, next, { membershipId, outsideName, allowReassign }) {
    try {
      const s = await getOne(req);
      if (!s) return notFound(res);
      let grade = null;
      let warnings = [];
      if (membershipId) {
        const c = await candidatesFor(req.orgId, s);
        grade = c.candidates.find((x) => x.membership_id === membershipId)?.grade ?? null;
        const ex = c.excluded.find((x) => x.membership_id === membershipId);
        if (ex) warnings.push({ code: ex.code, detail: ex.reason });
        const cand = c.candidates.find((x) => x.membership_id === membershipId);
        if (cand?.warn) warnings.push({ code: cand.warn.code, detail: cand.warn.detail });
        if (c.candidates.find((x) => x.membership_id === membershipId)?.taken) warnings.push({ code: 'taken', detail: '같은 시간에 이미 다른 보결을 맡았습니다' });
        if (!c.tt) warnings.push({ code: 'no_timetable', detail: '그 날 적용되는 확정 시간표가 없어 등급을 못 냈습니다' });
      }
      const up = await pool.query(
        `UPDATE substitute SET status = '맡음', taken_membership_id = $3, taken_outside_name = $4, grade_ab = $5
         WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL AND status = ANY($6)
         RETURNING id`,
        [s.id, req.orgId, membershipId ?? null, outsideName ?? null, grade, allowReassign ? ['열림', '맡음'] : ['열림']]);
      if (!up.rowCount) return res.status(409).json({ error: '이미 다른 분이 맡았거나 취소된 건입니다' });
      await audit(pool, { orgId: req.orgId, userId: req.session.userId, action: allowReassign ? 'substitute.assign' : 'substitute.take', table: 'substitute', rowId: s.id, before: { status: s.status, taken: s.taken_membership_id ?? s.taken_outside_name }, after: { taken: membershipId ?? outsideName, grade } });
      res.json({ ok: true, grade, warnings });
    } catch (e) { next(e); }
  }

  r.post('/substitutes/:sid/take', own, async (req, res, next) => {
    const m = await me(req);
    if (!m) return notFound(res);
    return claim(req, res, next, { membershipId: Number(m.id) });
  });

  // 관리자 강제 지정(명단 사람 또는 명단 밖 이름 · 이미 맡은 건도 바꾼다)
  r.post('/substitutes/:sid/assign', requireOrgAction('substitute.force'), async (req, res, next) => {
    try {
      const p = assignIn.safeParse(req.body);
      if (!p.success) return bad(res);
      if (p.data.membership_id && !(await refOk(MEM, p.data.membership_id, req.orgId))) return notFound(res);
      return claim(req, res, next, { membershipId: p.data.membership_id, outsideName: p.data.outside_name, allowReassign: true });
    } catch (e) { next(e); }
  });

  // 해제 — 관리자 또는 맡은 본인
  r.post('/substitutes/:sid/release', own, async (req, res, next) => {
    try {
      const s = await getOne(req);
      if (!s) return notFound(res);
      const m = await me(req);
      if (!isAdmin(req) && !(m && s.taken_membership_id === m.id)) return notFound(res);
      const up = await pool.query(
        `UPDATE substitute SET status = '열림', taken_membership_id = NULL, taken_outside_name = NULL, grade_ab = NULL WHERE id = $1 AND org_id = $2 AND status = '맡음' AND deleted_at IS NULL`, [s.id, req.orgId]);
      if (!up.rowCount) return res.status(409).json({ error: '맡은 건이 아닙니다' });
      await audit(pool, { orgId: req.orgId, userId: req.session.userId, action: 'substitute.release', table: 'substitute', rowId: s.id });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // 취소 — 올린 본인 또는 관리자
  r.post('/substitutes/:sid/cancel', own, async (req, res, next) => {
    try {
      const s = await getOne(req);
      if (!s) return notFound(res);
      const m = await me(req);
      if (!isAdmin(req) && !(m && Number(s.absent_membership_id) === Number(m.id))) return notFound(res);
      await pool.query(`UPDATE substitute SET status = '취소' WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`, [s.id, req.orgId]);
      await audit(pool, { orgId: req.orgId, userId: req.session.userId, action: 'substitute.cancel', table: 'substitute', rowId: s.id });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  return r;
}
