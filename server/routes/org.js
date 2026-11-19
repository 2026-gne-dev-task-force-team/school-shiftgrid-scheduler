import express from 'express';
import { z } from 'zod';
import { requireOrgAction } from '../guard.js';
import { loadConfig, mergeConfig } from '../orgConfig.js';

// 기관 안 경로의 본보기. 이후 판은 이 꼴을 따른다:
//  1) requireOrgAction(동작) 으로 「세션 기관 = URL 기관 · 역할 허용」을 거른다(틀리면 404)
//  2) 모든 쿼리에 org_id = req.orgId 와 deleted_at IS NULL 을 넣는다(매개변수 쿼리만)
//  3) 없거나 남의 기관이면 똑같이 404
const idParam = z.coerce.number().int().positive();
// 기관 설정 입력 — 꼴만 넓게 본다(값의 적당함은 앱이 경고로 말한다).
const lim = z.number().int().min(1).max(1_000_000);
const configIn = z.object({
  weekdays: z.array(z.string().trim().min(1).max(10)).min(1).max(7),
  semesterStarts: z.array(z.number().int().min(1).max(12)).min(1).max(12),
  limits: z.object({ periods: lim, grades: lim, classNo: lim, students: lim, capacity: lim, loadPerWeek: lim, block: lim, cells: lim, rosterRows: lim }).partial(),
  substitute: z.object({
    order: z.array(z.enum(['A', 'B', 'C', 'D'])).min(1).max(4),
    assistants: z.enum(['exclude', 'warn']),
    lunchDuty: z.enum(['exclude', 'warn']),
  }).partial(),
  duties: z.array(z.string().trim().min(1).max(20)).max(30),
  roleLabels: z.record(z.string().max(30), z.string().trim().max(30)),
  attendanceMonthlyCap: z.number().min(0).max(744).nullable(),
  softParams: z.object({
    maxConsec: z.number().int().min(1).max(12), dailySubjectCap: z.number().int().min(1).max(12), amTolerance: z.number().int().min(0).max(40), maxPerDay: z.number().int().min(1).max(12),
    teacherDayMode: z.enum(['분산', '몰기']), earlyTiers: z.array(z.number().int().min(1).max(3)).max(3), lunchAfter: z.number().int().min(1).max(12),
  }).partial(),
}).partial();

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

  // 기관 설정(상한·학기·보결·담당 구분·근태 월 상한). 비운 값은 기본값 — 저장 뒤 병합본을 돌려준다.
  const guard = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };
  r.get('/org/config', requireOrgAction('timetable.view'), guard(async (req, res) => res.json(await loadConfig(pool, req.orgId))));
  r.put('/org/config', requireOrgAction('timetable.edit'), guard(async (req, res) => {
    const p = configIn.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: '입력을 확인해 주세요' });
    await pool.query(`UPDATE org SET config = $2 WHERE id = $1`, [req.orgId, JSON.stringify(p.data)]);
    res.json(mergeConfig(p.data));
  }));

  return r;
}
