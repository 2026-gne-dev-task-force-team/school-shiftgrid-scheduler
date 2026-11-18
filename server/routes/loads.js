import express from 'express';
import { z } from 'zod';
import { requireOrgAction } from '../guard.js';
import { applyLevels, getRuleLevels } from '../rules.js';
import { currentTerm } from './school.js';
import { CEIL, limitWarnings, loadConfig, withWarnings } from '../orgConfig.js';

// 시수표. 거부하지 않는다 — 덜 채운 줄(교사·교과·시수가 빈 줄)도 그대로 보관하고 목록으로 알린다.
// 반 칸이 비면(classroom_id NULL) 「전체 마스터」: 모든 반에 적용된다.
const id = z.coerce.number().int().positive();
// bigint 는 문자열로 오므로 숫자로 바꿔 받는다
const ref = z.union([z.null(), z.coerce.number().int().positive()]).optional();
const notFound = (res) => res.status(404).json({ error: '없습니다' });
const body = z.object({
  membership_id: ref,
  subject_id: ref,
  classroom_id: ref,
  special_room_id: ref,
  weekly_hours: z.number().int().min(0).max(CEIL.loadPerWeek).optional(),
  sync_progress: z.boolean().optional(),
  block: z.number().int().min(1).max(CEIL.block).optional(), // 연강: 한 번에 붙여 놓을 시수(1 낱개). 기관 limits.block(기본 3)을 넘으면 경고
});
const REFS = [
  ['membership_id', `SELECT 1 FROM membership WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`],
  ['subject_id', `SELECT 1 FROM subject WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`],
  ['classroom_id', `SELECT 1 FROM classroom WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`],
  ['special_room_id', `SELECT 1 FROM special_room WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`],
];
const COLS = 'id, term_id, membership_id, subject_id, classroom_id, special_room_id, weekly_hours, sync_progress, block';

// 순수 함수: 시수표 줄 → 덜 채운 줄 표시
export const isIncomplete = (l) => !l.membership_id || !l.subject_id || !(l.weekly_hours > 0);

// 순수 함수: 「전체」 마스터를 반마다 펼친다. 같은 교사·교과로 그 반에 직접 적은 줄이 있으면 그쪽이 이긴다.
export function expandMaster(lines, classrooms) {
  const out = lines.filter((l) => l.classroom_id);
  for (const m of lines.filter((l) => !l.classroom_id)) {
    for (const c of classrooms) {
      const own = out.some((l) => l.classroom_id === c.id && l.membership_id === m.membership_id && l.subject_id === m.subject_id);
      if (!own) out.push({ ...m, classroom_id: c.id, from_master: m.id });
    }
  }
  return out;
}

// 순수 함수: 빠진 교사 — 명단에 있는 담임/전담 교사가 시수표에 한 줄도 없다
export function missingTeachers(teachers, lines) {
  const have = new Set(lines.map((l) => l.membership_id).filter(Boolean));
  return teachers.filter((t) => !have.has(t.membership_id)).map((t) => ({ rule: 'load_missing_teacher', detail: { membership_id: t.membership_id, name: t.name } }));
}

export function loadsRouter(pool) {
  const r = express.Router({ mergeParams: true });
  const view = requireOrgAction('timetable.view');
  const edit = requireOrgAction('timetable.edit');

  async function check(req, data) {
    for (const [k, sql] of REFS) {
      if (data[k]) {
        const { rows } = await pool.query(sql, [data[k], req.orgId]);
        if (!rows[0]) return false;
      }
    }
    return true;
  }
  const loadWarn = async (req, d) => limitWarnings(await loadConfig(pool, req.orgId), { loadPerWeek: d.weekly_hours ?? 0, block: d.block ?? 0 });
  async function snapshot(req) {
    const t = await currentTerm(pool, req.orgId);
    const lines = (await pool.query(`SELECT ${COLS} FROM teaching_load WHERE org_id = $1 AND term_id = $2 AND deleted_at IS NULL ORDER BY id`, [req.orgId, t.id])).rows;
    const teachers = (await pool.query(
      `SELECT m.id AS membership_id, u.name FROM membership m JOIN app_user u ON u.id = m.user_id WHERE m.org_id = $1 AND m.deleted_at IS NULL AND m.status = '사용' AND m.duty IS NOT NULL`,
      [req.orgId],
    )).rows;
    const levels = await getRuleLevels(pool, req.orgId);
    const alerts = applyLevels(levels, missingTeachers(teachers, lines));
    return { term: t, lines: lines.map((l) => ({ ...l, incomplete: isIncomplete(l) })), alerts };
  }

  r.get('/loads', view, async (req, res, next) => {
    try { res.json(await snapshot(req)); } catch (e) { next(e); }
  });

  // 반마다 펼친 모습(마스터 적용). 이후 격자·자동 생성이 읽는다.
  r.get('/loads/effective', view, async (req, res, next) => {
    try {
      const s = await snapshot(req);
      const cls = (await pool.query(`SELECT id, grade, class_no FROM classroom WHERE org_id = $1 AND term_id = $2 AND deleted_at IS NULL ORDER BY grade, class_no`, [req.orgId, s.term.id])).rows;
      res.json({ term: s.term, lines: expandMaster(s.lines, cls) });
    } catch (e) { next(e); }
  });

  r.post('/loads', edit, async (req, res, next) => {
    try {
      const p = body.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: '입력을 확인해 주세요' });
      if (!(await check(req, p.data))) return notFound(res);
      const t = await currentTerm(pool, req.orgId);
      const d = p.data;
      const { rows } = await pool.query(
        `INSERT INTO teaching_load (org_id, term_id, membership_id, subject_id, classroom_id, special_room_id, weekly_hours, sync_progress, block) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${COLS}`,
        [req.orgId, t.id, d.membership_id ?? null, d.subject_id ?? null, d.classroom_id ?? null, d.special_room_id ?? null, d.weekly_hours ?? 0, d.sync_progress ?? false, d.block ?? 1],
      );
      res.status(201).json(withWarnings({ ...rows[0], incomplete: isIncomplete(rows[0]) }, await loadWarn(req, d)));
    } catch (e) { next(e); }
  });

  r.patch('/loads/:id', edit, async (req, res, next) => {
    try {
      const lid = id.safeParse(req.params.id);
      const p = body.safeParse(req.body);
      if (!lid.success || !p.success) return notFound(res);
      if (!(await check(req, p.data))) return notFound(res);
      const sets = [];
      const vals = [lid.data, req.orgId];
      for (const k of Object.keys(body.shape)) {
        if (k in p.data) { vals.push(p.data[k]); sets.push(`${k} = $${vals.length}`); }
      }
      if (!sets.length) return res.status(400).json({ error: '입력을 확인해 주세요' });
      const { rows } = await pool.query(`UPDATE teaching_load SET ${sets.join(', ')} WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL RETURNING ${COLS}`, vals);
      rows[0] ? res.json(withWarnings({ ...rows[0], incomplete: isIncomplete(rows[0]) }, await loadWarn(req, p.data))) : notFound(res);
    } catch (e) { next(e); }
  });

  r.delete('/loads/:id', edit, async (req, res, next) => {
    try {
      const lid = id.safeParse(req.params.id);
      if (!lid.success) return notFound(res);
      const { rowCount } = await pool.query(`UPDATE teaching_load SET deleted_at = now() WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`, [lid.data, req.orgId]);
      rowCount ? res.json({ ok: true }) : notFound(res);
    } catch (e) { next(e); }
  });
  return r;
}
