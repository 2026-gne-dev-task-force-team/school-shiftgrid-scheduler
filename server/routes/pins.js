import express from 'express';
import { z } from 'zod';
import { requireOrgAction } from '../guard.js';
import { currentTerm } from './school.js';
import { CEIL, limitWarnings, loadConfig, withWarnings } from '../orgConfig.js';

// 고정·금지 — 탭 셋(교사/반/특별실). 같은 칸에 같은 종류가 둘이면 409(같은 것이 둘), 그 밖엔 거부하지 않는다.
const id = z.coerce.number().int().positive();
const ref = z.union([z.null(), z.coerce.number().int().positive()]).optional();
const notFound = (res) => res.status(404).json({ error: '없습니다' });
const TARGET_SQL = {
  교사: `SELECT 1 FROM membership WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
  반: `SELECT 1 FROM classroom WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
  특별실: `SELECT 1 FROM special_room WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
};
const body = z.object({
  target_kind: z.enum(['교사', '반', '특별실']),
  target_id: z.coerce.number().int().positive(),
  weekday: z.number().int().min(1).max(7),
  period: z.number().int().min(1).max(CEIL.periods),
  kind: z.enum(['고정', '금지']),
  subject_id: ref,
});
const COLS = 'id, term_id, target_kind, target_id, weekday, period, kind, subject_id';

export function pinsRouter(pool) {
  const r = express.Router({ mergeParams: true });

  r.get('/pins', requireOrgAction('timetable.view'), async (req, res, next) => {
    try {
      const t = await currentTerm(pool, req.orgId);
      const kind = ['교사', '반', '특별실'].includes(req.query.target_kind) ? req.query.target_kind : null;
      const { rows } = await pool.query(
        `SELECT ${COLS} FROM pin WHERE org_id = $1 AND term_id = $2 AND deleted_at IS NULL AND ($3::text IS NULL OR target_kind = $3) ORDER BY target_kind, target_id, weekday, period`,
        [req.orgId, t.id, kind],
      );
      res.json(rows);
    } catch (e) { next(e); }
  });

  r.post('/pins', requireOrgAction('timetable.edit'), async (req, res, next) => {
    try {
      const p = body.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: '입력을 확인해 주세요' });
      const d = p.data;
      if (!(await pool.query(TARGET_SQL[d.target_kind], [d.target_id, req.orgId])).rows[0]) return notFound(res);
      if (d.subject_id && !(await pool.query(`SELECT 1 FROM subject WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`, [d.subject_id, req.orgId])).rows[0]) return notFound(res);
      const t = await currentTerm(pool, req.orgId);
      const { rows } = await pool.query(
        `INSERT INTO pin (org_id, term_id, target_kind, target_id, weekday, period, kind, subject_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${COLS}`,
        [req.orgId, t.id, d.target_kind, d.target_id, d.weekday, d.period, d.kind, d.subject_id ?? null],
      );
      res.status(201).json(withWarnings(rows[0], limitWarnings(await loadConfig(pool, req.orgId), { periods: d.period })));
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: '이미 같은 것이 있습니다' });
      next(e);
    }
  });

  r.delete('/pins/:id', requireOrgAction('timetable.edit'), async (req, res, next) => {
    try {
      const pid = id.safeParse(req.params.id);
      if (!pid.success) return notFound(res);
      const { rowCount } = await pool.query(`UPDATE pin SET deleted_at = now() WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`, [pid.data, req.orgId]);
      rowCount ? res.json({ ok: true }) : notFound(res);
    } catch (e) { next(e); }
  });
  return r;
}
