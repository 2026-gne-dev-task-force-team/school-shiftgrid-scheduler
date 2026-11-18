import express from 'express';
import { z } from 'zod';
import { requireOrgAction } from '../guard.js';
import { LEVELS, RULES, getRuleLevels, resolveLevels } from '../rules.js';

// 규칙 수위 설정 — 보는 건 기관 구성원, 바꾸는 건 관리자
export function rulesRouter(pool) {
  const r = express.Router({ mergeParams: true });
  const body = z.object({ levels: z.record(z.string(), z.enum(LEVELS)) });

  r.get('/rules', requireOrgAction('timetable.view'), async (req, res, next) => {
    try {
      res.json({ levels: await getRuleLevels(pool, req.orgId), rules: RULES, choices: LEVELS });
    } catch (e) { next(e); }
  });

  r.put('/rules', requireOrgAction('school.manage'), async (req, res, next) => {
    try {
      const p = body.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: '입력을 확인해 주세요' });
      const unknown = Object.keys(p.data.levels).filter((k) => !RULES[k]);
      if (unknown.length) return res.status(400).json({ error: '모르는 규칙이 있습니다' });
      const cur = await getRuleLevels(pool, req.orgId);
      const next_ = resolveLevels({ ...cur, ...p.data.levels });
      await pool.query(`UPDATE org SET rule_levels = $2 WHERE id = $1`, [req.orgId, JSON.stringify(next_)]);
      res.json({ levels: next_ });
    } catch (e) { next(e); }
  });
  return r;
}
