import express from 'express';
import { z } from 'zod';
import { requireOrgAction } from '../guard.js';
import { can } from '../permissions.js';
import { applyLevels, getRuleLevels } from '../rules.js';
import { audit } from '../audit.js';
import { seal, unseal } from '../seal.js';
import { currentTerm } from './school.js';
import { loadConfig } from '../orgConfig.js';

// 보조인력 근태. 업무 규칙(허용 교과 밖·마감된 달)은 거부하지 않는다 — 수위에 따라 알리거나, 「재확인」이면 한 번 되묻고(409 needConfirm) 저장한다.
// 거부는 보안(권한·기관 경계·형식)뿐이다. 메모는 암호화 칸에 둔다.
const notFound = (res) => res.status(404).json({ error: '없습니다' });
const bad = (res) => res.status(400).json({ error: '입력을 확인해 주세요' });
const ym = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const idP = z.coerce.number().int().positive();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(s)));
const body = z.object({
  membership_id: z.coerce.number().int().positive().optional(),
  on_date: day,
  hours: z.number().min(0).max(24),
  allowed_subject: z.string().max(50).nullable().optional(),
  memo: z.string().max(500).nullable().optional(),
  confirm: z.boolean().optional(),
});
const patchBody = body.partial();
const COLS = `a.id, a.membership_id, to_char(a.on_date,'YYYY-MM-DD') AS on_date, a.hours::float8 AS hours, a.allowed_subject, a.memo_enc`;

// 순수 함수: 근태 줄 → 사람별 월 근무시간 집계 [{membership_id, total_hours, days}]
export function monthSummary(rows) {
  const m = new Map();
  for (const r of rows) {
    const e = m.get(r.membership_id) || { membership_id: r.membership_id, total_hours: 0, days: 0 };
    e.total_hours = Math.round((e.total_hours + Number(r.hours)) * 10) / 10;
    if (Number(r.hours) > 0) e.days += 1;
    m.set(r.membership_id, e);
  }
  return [...m.values()];
}

const outRow = (r) => ({ id: r.id, membership_id: r.membership_id, on_date: r.on_date, hours: r.hours, allowed_subject: r.allowed_subject, memo: unseal(r.memo_enc) });

export function attendanceRouter(pool) {
  const r = express.Router({ mergeParams: true });
  const own = requireOrgAction('attendance.own');
  const guard = (fn) => (req, res, next) => fn(req, res).catch(next);
  const isManager = (req) => can(req.session.role, 'attendance.manage');

  async function myMembership(req) {
    const { rows } = await pool.query(`SELECT id FROM membership WHERE user_id = $1 AND org_id = $2 AND deleted_at IS NULL`, [req.session.userId, req.orgId]);
    return rows[0]?.id ?? null;
  }
  // 대상 사람: 관리자는 누구든(같은 기관만) · 그 밖은 나만
  async function target(req, wanted) {
    const me = await myMembership(req);
    if (!wanted || String(wanted) === String(me)) return me;
    if (!isManager(req)) return null;
    const { rows } = await pool.query(`SELECT id FROM membership WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`, [wanted, req.orgId]);
    return rows[0]?.id ?? null;
  }
  const closedMonths = async (orgId, yms) => {
    const { rows } = await pool.query(`SELECT ym FROM month_close WHERE org_id = $1 AND ym = ANY($2) AND deleted_at IS NULL`, [orgId, yms]);
    return new Set(rows.map((x) => x.ym));
  };
  // 이 저장이 어긴 업무 규칙 목록(수위 적용 전)
  // proj: 이 저장 뒤의 그 달 합계를 보려는 값 { on_date, hours, excludeId? } — 같은 날 줄(덮어쓰기)과 고치는 줄은 합계에서 뺀다
  async function found(req, memId, subject, dates, proj) {
    const out = [];
    const closed = await closedMonths(req.orgId, [...new Set(dates.map((d) => d.slice(0, 7)))]);
    for (const ymv of closed) out.push({ rule: 'edit_closed_month', detail: { ym: ymv } });
    if (subject) {
      const { rows } = await pool.query(
        `SELECT s.name FROM attendance_allowed aa JOIN subject s ON s.id = aa.subject_id WHERE aa.org_id = $1 AND aa.membership_id = $2 AND aa.deleted_at IS NULL AND s.deleted_at IS NULL`,
        [req.orgId, memId],
      );
      if (rows.length && !rows.some((x) => x.name === subject)) out.push({ rule: 'attendance_subject', detail: { subject, allowed: rows.map((x) => x.name) } });
    }
    const cap = proj ? (await loadConfig(pool, req.orgId)).attendanceMonthlyCap : null;
    if (cap != null) {
      const { rows } = await pool.query(
        `SELECT COALESCE(sum(hours),0)::float8 AS h FROM attendance WHERE org_id = $1 AND membership_id = $2 AND deleted_at IS NULL AND to_char(on_date,'YYYY-MM') = $3 AND on_date <> $4::date AND ($5::bigint IS NULL OR id <> $5)`,
        [req.orgId, memId, proj.on_date.slice(0, 7), proj.on_date, proj.excludeId ?? null]);
      const total = Math.round((rows[0].h + Number(proj.hours)) * 10) / 10;
      if (total > cap) out.push({ rule: 'attendance_month_cap', detail: { ym: proj.on_date.slice(0, 7), total_hours: total, cap_hours: cap } });
    }
    return out;
  }
  // 재확인 수위가 걸렸는데 확인 안 받았으면 저장 없이 되묻는다(거부 아님)
  async function check(req, res, memId, subject, dates, confirm, proj) {
    const vios = applyLevels(await getRuleLevels(pool, req.orgId), await found(req, memId, subject, dates, proj));
    if (vios.some((v) => v.confirm) && !confirm) {
      res.status(409).json({ needConfirm: true, violations: vios });
      return null;
    }
    return vios;
  }

  r.get('/attendance', own, guard(async (req, res) => {
    const p = ym.safeParse(req.query.ym);
    if (!p.success) return bad(res);
    const me = await myMembership(req);
    const all = isManager(req);
    const { rows } = await pool.query(
      `SELECT ${COLS} FROM attendance a WHERE a.org_id = $1 AND a.deleted_at IS NULL AND to_char(a.on_date,'YYYY-MM') = $2 AND ($3::boolean OR a.membership_id = $4) ORDER BY a.on_date, a.id`,
      [req.orgId, p.data, all, me],
    );
    res.json({ ym: p.data, closed: (await closedMonths(req.orgId, [p.data])).has(p.data), rows: rows.map(outRow) });
  }));

  r.get('/attendance/summary', own, guard(async (req, res) => {
    const p = ym.safeParse(req.query.ym);
    if (!p.success) return bad(res);
    const me = await myMembership(req);
    const { rows } = await pool.query(
      `SELECT a.membership_id, a.hours::float8 AS hours, u.name FROM attendance a JOIN membership m ON m.id = a.membership_id JOIN app_user u ON u.id = m.user_id
        WHERE a.org_id = $1 AND a.deleted_at IS NULL AND to_char(a.on_date,'YYYY-MM') = $2 AND ($3::boolean OR a.membership_id = $4)`,
      [req.orgId, p.data, isManager(req), me],
    );
    const names = new Map(rows.map((x) => [x.membership_id, x.name]));
    res.json({ ym: p.data, closed: (await closedMonths(req.orgId, [p.data])).has(p.data), people: monthSummary(rows).map((x) => ({ ...x, name: names.get(x.membership_id) })) });
  }));

  r.post('/attendance', own, guard(async (req, res) => {
    const p = body.safeParse(req.body);
    if (!p.success) return bad(res);
    const memId = await target(req, p.data.membership_id);
    if (!memId) return notFound(res);
    const vios = await check(req, res, memId, p.data.allowed_subject, [p.data.on_date], p.data.confirm, { on_date: p.data.on_date, hours: p.data.hours });
    if (!vios) return;
    const term = await currentTerm(pool, req.orgId);
    // 같은 사람·같은 날은 한 줄 — 있으면 그 줄을 고친다(같은 것이 둘 방지)
    const { rows } = await pool.query(
      `INSERT INTO attendance (org_id, term_id, membership_id, on_date, hours, allowed_subject, memo_enc) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (org_id, membership_id, on_date) WHERE deleted_at IS NULL DO UPDATE SET hours = EXCLUDED.hours, allowed_subject = EXCLUDED.allowed_subject, memo_enc = EXCLUDED.memo_enc
       RETURNING id, membership_id, to_char(on_date,'YYYY-MM-DD') AS on_date, hours::float8 AS hours, allowed_subject, memo_enc`,
      [req.orgId, term.id, memId, p.data.on_date, p.data.hours, p.data.allowed_subject ?? null, seal(p.data.memo)],
    );
    await audit(pool, { orgId: req.orgId, userId: req.session.userId, action: 'attendance.save', table: 'attendance', rowId: rows[0].id, after: { on_date: rows[0].on_date, hours: rows[0].hours } });
    res.status(201).json({ row: outRow(rows[0]), violations: vios });
  }));

  async function loadRow(req, idv) {
    const { rows } = await pool.query(`SELECT ${COLS} FROM attendance a WHERE a.id = $1 AND a.org_id = $2 AND a.deleted_at IS NULL`, [idv, req.orgId]);
    const row = rows[0];
    if (!row) return null;
    if (!isManager(req) && Number(row.membership_id) !== Number(await myMembership(req))) return null; // 남의 줄은 없는 것처럼
    return row;
  }

  r.patch('/attendance/:id', own, guard(async (req, res) => {
    const idv = idP.safeParse(req.params.id);
    const p = patchBody.safeParse(req.body);
    if (!idv.success || !p.success) return bad(res);
    const row = await loadRow(req, idv.data);
    if (!row) return notFound(res);
    const next = {
      on_date: p.data.on_date ?? row.on_date,
      hours: p.data.hours ?? row.hours,
      allowed_subject: p.data.allowed_subject === undefined ? row.allowed_subject : p.data.allowed_subject,
      memo_enc: p.data.memo === undefined ? row.memo_enc : seal(p.data.memo),
    };
    const vios = await check(req, res, row.membership_id, next.allowed_subject, [row.on_date, next.on_date], p.data.confirm, { on_date: next.on_date, hours: next.hours, excludeId: row.id });
    if (!vios) return;
    const { rows } = await pool.query(
      `UPDATE attendance SET on_date = $3, hours = $4, allowed_subject = $5, memo_enc = $6 WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL
       RETURNING id, membership_id, to_char(on_date,'YYYY-MM-DD') AS on_date, hours::float8 AS hours, allowed_subject, memo_enc`,
      [idv.data, req.orgId, next.on_date, next.hours, next.allowed_subject, next.memo_enc],
    );
    await audit(pool, { orgId: req.orgId, userId: req.session.userId, action: 'attendance.edit', table: 'attendance', rowId: idv.data, before: { on_date: row.on_date, hours: row.hours }, after: { on_date: next.on_date, hours: next.hours } });
    res.json({ row: outRow(rows[0]), violations: vios });
  }));

  r.delete('/attendance/:id', own, guard(async (req, res) => {
    const idv = idP.safeParse(req.params.id);
    if (!idv.success) return bad(res);
    const row = await loadRow(req, idv.data);
    if (!row) return notFound(res);
    const vios = await check(req, res, row.membership_id, null, [row.on_date], req.body?.confirm === true);
    if (!vios) return;
    await pool.query(`UPDATE attendance SET deleted_at = now() WHERE id = $1 AND org_id = $2`, [idv.data, req.orgId]); // 지우지 않고 표시만
    await audit(pool, { orgId: req.orgId, userId: req.session.userId, action: 'attendance.delete', table: 'attendance', rowId: idv.data });
    res.json({ ok: true, violations: vios });
  }));

  // ── 월 마감 — 마감 뒤에도 고칠 수 있다(수위가 재확인이면 되묻기) ──
  const manage = requireOrgAction('attendance.manage');
  r.post('/attendance/close', manage, guard(async (req, res) => {
    const p = z.object({ ym }).safeParse(req.body);
    if (!p.success) return bad(res);
    const me = await myMembership(req);
    await pool.query(`INSERT INTO month_close (org_id, ym, closed_by) VALUES ($1,$2,$3) ON CONFLICT (org_id, ym) WHERE deleted_at IS NULL DO NOTHING`, [req.orgId, p.data.ym, me]);
    await audit(pool, { orgId: req.orgId, userId: req.session.userId, action: 'attendance.close', table: 'month_close', after: { ym: p.data.ym } });
    res.json({ ym: p.data.ym, closed: true });
  }));
  r.delete('/attendance/close/:ym', manage, guard(async (req, res) => {
    const p = ym.safeParse(req.params.ym);
    if (!p.success) return bad(res);
    await pool.query(`UPDATE month_close SET deleted_at = now() WHERE org_id = $1 AND ym = $2 AND deleted_at IS NULL`, [req.orgId, p.data]);
    await audit(pool, { orgId: req.orgId, userId: req.session.userId, action: 'attendance.reopen', table: 'month_close', after: { ym: p.data } });
    res.json({ ym: p.data, closed: false });
  }));

  // ── 허용 교과 ──
  r.get('/attendance/allowed', own, guard(async (req, res) => {
    const memId = await target(req, req.query.membership_id);
    if (!memId) return notFound(res);
    const { rows } = await pool.query(`SELECT subject_id FROM attendance_allowed WHERE org_id = $1 AND membership_id = $2 AND deleted_at IS NULL ORDER BY subject_id`, [req.orgId, memId]);
    res.json({ membership_id: memId, subject_ids: rows.map((x) => Number(x.subject_id)) });
  }));
  r.put('/attendance/allowed', manage, guard(async (req, res) => {
    const p = z.object({ membership_id: idP, subject_ids: z.array(idP).max(50) }).safeParse(req.body);
    if (!p.success) return bad(res);
    const memId = await target(req, p.data.membership_id);
    if (!memId) return notFound(res);
    const ids = [...new Set(p.data.subject_ids)];
    const ok = await pool.query(`SELECT id FROM subject WHERE org_id = $1 AND id = ANY($2) AND deleted_at IS NULL`, [req.orgId, ids]);
    if (ok.rows.length !== ids.length) return notFound(res); // 남의 기관 교과가 섞였다
    await pool.query(`UPDATE attendance_allowed SET deleted_at = now() WHERE org_id = $1 AND membership_id = $2 AND deleted_at IS NULL AND NOT (subject_id = ANY($3))`, [req.orgId, memId, ids]);
    for (const sid of ids) {
      await pool.query(`INSERT INTO attendance_allowed (org_id, membership_id, subject_id) VALUES ($1,$2,$3) ON CONFLICT (org_id, membership_id, subject_id) WHERE deleted_at IS NULL DO NOTHING`, [req.orgId, memId, sid]);
    }
    res.json({ membership_id: memId, subject_ids: ids });
  }));
  return r;
}
