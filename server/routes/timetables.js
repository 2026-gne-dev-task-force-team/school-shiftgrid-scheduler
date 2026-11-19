import express from 'express';
import { z } from 'zod';
import { requireOrgAction } from '../guard.js';
import { applyLevels, getRuleLevels } from '../rules.js';
import { findOverlapsFor } from '../violations.js';
import { appliedTimetable } from '../applied.js';
import { currentTerm, scopeTermId, ensureDefaultSubjects } from './school.js';
import { CEIL, limitWarnings, loadConfig, withWarnings } from '../orgConfig.js';
import { audit } from '../audit.js';
import { generateRouter } from './generate.js';

// 시간표(시안) 만들기 · 칸 저장 · 내 시간표. 겹침은 거부하지 않고 목록으로 저장한다.
const id = z.coerce.number().int().positive();
const ref = z.union([z.null(), z.coerce.number().int().positive()]).optional();
const notFound = (res) => res.status(404).json({ error: '없습니다' });
const cellIn = z.object({
  classroom_id: z.coerce.number().int().positive(),
  weekday: z.number().int().min(1).max(7),
  period: z.number().int().min(1).max(CEIL.periods),
  subject_id: ref,
  membership_id: ref,
  special_room_id: ref,
});
// 칸 하나 저장 — 세 값이 모두 비면 칸을 비운다. db 는 pool 이거나 트랜잭션 중인 client.
async function saveCell(db, orgId, ttId, d) {
  const empty = !d.subject_id && !d.membership_id && !d.special_room_id;
  const where = `org_id = $1 AND timetable_id = $2 AND classroom_id = $3 AND weekday = $4 AND period = $5 AND deleted_at IS NULL`;
  const key = [orgId, ttId, d.classroom_id, d.weekday, d.period];
  if (empty) {
    await db.query(`UPDATE cell SET deleted_at = now() WHERE ${where}`, key);
    return;
  }
  const v = [d.subject_id ?? null, d.membership_id ?? null, d.special_room_id ?? null];
  const up = await db.query(`UPDATE cell SET subject_id = $6, membership_id = $7, special_room_id = $8 WHERE ${where}`, [...key, ...v]);
  if (!up.rowCount) {
    await db.query(
      `INSERT INTO cell (org_id, timetable_id, classroom_id, weekday, period, subject_id, membership_id, special_room_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [...key, ...v],
    );
  }
}
const slotIn = z.object({ classroom_id: z.coerce.number().int().positive(), weekday: z.number().int().min(1).max(7), period: z.number().int().min(1).max(CEIL.periods) });
const swapIn = z.object({ from: slotIn, to: slotIn });
const CELL_COLS = 'classroom_id, weekday, period, subject_id, membership_id, special_room_id';
const REFS = {
  classroom_id: `SELECT 1 FROM classroom WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
  subject_id: `SELECT 1 FROM subject WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
  membership_id: `SELECT 1 FROM membership WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
  special_room_id: `SELECT 1 FROM special_room WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
};

export function timetablesRouter(pool) {
  const r = express.Router({ mergeParams: true });
  const view = requireOrgAction('timetable.view');
  const edit = requireOrgAction('timetable.edit');
  // S-2: 생성 재료 · 생성 시안 저장 · 복제 · 삭제 · 확정 (/:tid 보다 먼저 — /timetables/generated 를 잡게)
  r.use(generateRouter(pool));

  const myMembership = async (req) =>
    (await pool.query(`SELECT id, guide_done FROM membership WHERE org_id = $1 AND user_id = $2 AND deleted_at IS NULL`, [req.orgId, req.session.userId])).rows[0];
  const getTt = async (req) => {
    const tid = id.safeParse(req.params.tid);
    if (!tid.success) return null;
    return (await pool.query(`SELECT id, term_id, name, status FROM timetable WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`, [tid.data, req.orgId])).rows[0] ?? null;
  };
  const cellsOf = async (orgId, ttId) =>
    (await pool.query(`SELECT ${CELL_COLS} FROM cell WHERE org_id = $1 AND timetable_id = $2 AND deleted_at IS NULL`, [orgId, ttId])).rows;
  async function mineOf(req, tt) {
    const me = await myMembership(req);
    return (await pool.query(
      `SELECT c.weekday, c.period, c.classroom_id, cl.grade, cl.class_no, s.name AS subject, sr.name AS room
         FROM cell c JOIN classroom cl ON cl.id = c.classroom_id
         LEFT JOIN subject s ON s.id = c.subject_id LEFT JOIN special_room sr ON sr.id = c.special_room_id
        WHERE c.org_id = $1 AND c.timetable_id = $2 AND c.membership_id = $3 AND c.deleted_at IS NULL ORDER BY c.weekday, c.period`,
      [req.orgId, tt.id, me?.id ?? -1],
    )).rows;
  }
  // 위반을 다시 세어 저장하고, 수위를 붙여 돌려준다
  async function recheck(orgId, tt) {
    const raw = await findOverlapsFor(pool, orgId, await cellsOf(orgId, tt.id));
    await pool.query(`UPDATE timetable SET violations = $3 WHERE id = $1 AND org_id = $2`, [tt.id, orgId, JSON.stringify(raw)]);
    const levels = await getRuleLevels(pool, orgId);
    const extra = tt.status === '확정' ? [{ rule: 'edit_confirmed', detail: '확정된 시간표를 고쳤습니다' }] : [];
    return { levels, violations: applyLevels(levels, [...raw, ...extra]) };
  }

  r.get('/timetables', view, async (req, res, next) => {
    try {
      const { rows } = await pool.query(`SELECT id, name, status, starts_on, created_at FROM timetable WHERE org_id = $1 AND term_id = $2 AND deleted_at IS NULL ORDER BY id DESC`, [req.orgId, await scopeTermId(pool, req)]);
      res.json(rows);
    } catch (e) { next(e); }
  });

  r.post('/timetables', edit, async (req, res, next) => {
    try {
      const p = z.object({ name: z.string().trim().min(1).max(60) }).safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: '입력을 확인해 주세요' });
      const t = await currentTerm(pool, req.orgId);
      const me = await myMembership(req);
      const { rows } = await pool.query(
        `INSERT INTO timetable (org_id, term_id, name, created_by) VALUES ($1,$2,$3,$4) RETURNING id, name, status`,
        [req.orgId, t.id, p.data.name, me?.id ?? null],
      );
      res.status(201).json(rows[0]);
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: '이미 같은 것이 있습니다' });
      next(e);
    }
  });

  // 오늘(또는 ?date=) 적용 중인 확정본 — 규칙은 server/applied.js 한 곳(/:tid 보다 먼저)
  const dateQ = (req) => (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date ?? '')) ? req.query.date : undefined);
  r.get('/timetables/applied', view, async (req, res, next) => {
    try { res.json({ timetable: await appliedTimetable(pool, req.orgId, dateQ(req)) }); } catch (e) { next(e); }
  });
  // 내 시간표(적용 중인 확정본 기준) — 확정본이 없으면 timetable: null · 칸 없음
  r.get('/timetables/applied/mine', view, async (req, res, next) => {
    try {
      const tt = await appliedTimetable(pool, req.orgId, dateQ(req));
      if (!tt) return res.json({ timetable: null, cells: [] });
      res.json({ timetable: tt, cells: await mineOf(req, tt) });
    } catch (e) { next(e); }
  });

  // 격자에 필요한 것 한 번에: 시간표 · 칸 · 반 · 교과 · 교사 · 특별실 · 교시 · 위반
  r.get('/timetables/:tid', view, async (req, res, next) => {
    try {
      const tt = await getTt(req);
      if (!tt) return notFound(res);
      const o = req.orgId;
      const q = async (sql, p = [o]) => (await pool.query(sql, p)).rows;
      await ensureDefaultSubjects(pool, o); // 교과 탭을 안 거쳐도 격자 목록에 기본 교과가 있게
      const levels = await getRuleLevels(pool, o);
      const raw = await findOverlapsFor(pool, o, await cellsOf(o, tt.id));
      res.json({
        timetable: tt,
        cells: await cellsOf(o, tt.id),
        classrooms: await q(`SELECT id, grade, class_no, student_count FROM classroom WHERE org_id = $1 AND term_id = ${Number(tt.term_id)} AND deleted_at IS NULL ORDER BY grade, class_no`),
        subjects: await q(`SELECT id, name, short_name FROM subject WHERE org_id = $1 AND deleted_at IS NULL ORDER BY is_default DESC, id`),
        teachers: await q(`SELECT m.id, u.name FROM membership m JOIN app_user u ON u.id = m.user_id WHERE m.org_id = $1 AND m.deleted_at IS NULL AND m.status = '사용' AND m.role <> '시스템관리자' ORDER BY u.name`),
        rooms: await q(`SELECT id, name, capacity FROM special_room WHERE org_id = $1 AND deleted_at IS NULL ORDER BY id`),
        periods: (await q(`SELECT period_config FROM org WHERE id = $1`))[0]?.period_config ?? {},
        levels,
        violations: applyLevels(levels, raw),
      });
    } catch (e) { next(e); }
  });

  // 칸 하나 저장 — 세 값이 모두 비면 칸을 비운다(되돌리기도 이 경로). 겹쳐도 저장한다.
  r.put('/timetables/:tid/cells', edit, async (req, res, next) => {
    try {
      const tt = await getTt(req);
      if (!tt) return notFound(res);
      const p = cellIn.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: '입력을 확인해 주세요' });
      const d = p.data;
      for (const k of Object.keys(REFS)) {
        if (d[k] && !(await pool.query(REFS[k], [d[k], req.orgId])).rows[0]) return notFound(res);
      }
      await saveCell(pool, req.orgId, tt.id, d);
      if (tt.status === '확정') await audit(pool, { orgId: req.orgId, userId: req.session.userId, action: 'timetable.edit_confirmed', table: 'timetable', rowId: tt.id, after: { name: tt.name, classroom_id: d.classroom_id, weekday: d.weekday, period: d.period } });
      const w = limitWarnings(await loadConfig(pool, req.orgId), { periods: d.period });
      res.json(withWarnings({ ok: true, ...(await recheck(req.orgId, tt)) }, w));
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: '이미 같은 것이 있습니다' });
      next(e);
    }
  });

  // 두 칸 맞바꾸기 — 트랜잭션 한 번(중간에 끊겨도 한 칸만 옮겨지지 않는다)
  r.post('/timetables/:tid/cells/swap', edit, async (req, res, next) => {
    try {
      const tt = await getTt(req);
      if (!tt) return notFound(res);
      const p = swapIn.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: '입력을 확인해 주세요' });
      const { from, to } = p.data;
      for (const x of [from, to]) {
        if (!(await pool.query(REFS.classroom_id, [x.classroom_id, req.orgId])).rows[0]) return notFound(res);
      }
      const db = await pool.connect();
      try {
        await db.query('BEGIN');
        const read = async (x) =>
          (await db.query(
            `SELECT subject_id, membership_id, special_room_id FROM cell
              WHERE org_id = $1 AND timetable_id = $2 AND classroom_id = $3 AND weekday = $4 AND period = $5 AND deleted_at IS NULL FOR UPDATE`,
            [req.orgId, tt.id, x.classroom_id, x.weekday, x.period],
          )).rows[0] ?? {};
        const a = await read(from);
        const b = await read(to);
        await saveCell(db, req.orgId, tt.id, { ...to, subject_id: a.subject_id, membership_id: a.membership_id, special_room_id: a.special_room_id });
        await saveCell(db, req.orgId, tt.id, { ...from, subject_id: b.subject_id, membership_id: b.membership_id, special_room_id: b.special_room_id });
        await db.query('COMMIT');
      } catch (e) {
        await db.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        db.release();
      }
      if (tt.status === '확정') await audit(pool, { orgId: req.orgId, userId: req.session.userId, action: 'timetable.edit_confirmed', table: 'timetable', rowId: tt.id, after: { name: tt.name, swap: true } });
      const w = limitWarnings(await loadConfig(pool, req.orgId), { periods: Math.max(from.period, to.period) });
      res.json(withWarnings({ ok: true, ...(await recheck(req.orgId, tt)) }, w));
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: '이미 같은 것이 있습니다' });
      next(e);
    }
  });

  // 내 시간표 — 내 칸만(교직원)
  r.get('/timetables/:tid/mine', view, async (req, res, next) => {
    try {
      const tt = await getTt(req);
      if (!tt) return notFound(res);
      res.json({ timetable: tt, cells: await mineOf(req, tt) });
    } catch (e) { next(e); }
  });

  // 처음 안내 — 닫았는지 읽고 쓰기(본인 것만)
  r.get('/me/guide', view, async (req, res, next) => {
    try { res.json({ done: !!(await myMembership(req))?.guide_done }); } catch (e) { next(e); }
  });
  r.put('/me/guide', view, async (req, res, next) => {
    try {
      const done = req.body?.done !== false;
      await pool.query(`UPDATE membership SET guide_done = $3 WHERE org_id = $1 AND user_id = $2 AND deleted_at IS NULL`, [req.orgId, req.session.userId, done]);
      res.json({ done });
    } catch (e) { next(e); }
  });
  return r;
}
