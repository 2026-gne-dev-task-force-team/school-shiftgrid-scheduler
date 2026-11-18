import express from 'express';
import { z } from 'zod';
import { requireOrgAction } from '../guard.js';

// 기관 안 경로의 본보기. 이후 판은 이 꼴을 따른다:
//  1) requireOrgAction(동작) 으로 「세션 기관 = URL 기관 · 역할 허용」을 거른다(틀리면 404)
//  2) 모든 쿼리에 org_id = req.orgId 와 deleted_at IS NULL 을 넣는다(매개변수 쿼리만)
//  3) 없거나 남의 기관이면 똑같이 404
const idParam = z.coerce.number().int().positive();

export function orgRouter(pool) {
  const r = express.Router({ mergeParams: true });

  r.get('/classrooms', requireOrgAction('timetable.view'), async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, term_id, grade, class_no, student_count FROM classroom WHERE org_id = $1 AND deleted_at IS NULL ORDER BY grade, class_no`,
        [req.orgId],
      );
      res.json(rows);
    } catch (e) {
      next(e);
    }
  });

  r.get('/classrooms/:id', requireOrgAction('timetable.view'), async (req, res, next) => {
    try {
      const id = idParam.safeParse(req.params.id);
      if (!id.success) return res.status(404).json({ error: '없습니다' });
      const { rows } = await pool.query(
        `SELECT id, term_id, grade, class_no, student_count FROM classroom WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
        [id.data, req.orgId],
      );
      if (!rows[0]) return res.status(404).json({ error: '없습니다' });
      res.json(rows[0]);
    } catch (e) {
      next(e);
    }
  });

  return r;
}
