import express from 'express';
import { z } from 'zod';
import { requireOrgAction } from '../guard.js';
import { applyLevels, getRuleLevels } from '../rules.js';
import { findOverlapsFor, periodTime } from '../violations.js';
import { appliedTimetable } from '../applied.js';
import { currentTerm } from './school.js';
import { CEIL, limitWarnings, loadConfig, periodsOf, withWarnings } from '../orgConfig.js';
import { expandMaster } from './loads.js';

// S-2 자동 생성 짝 — 생성 자체는 브라우저 웹 워커가 한다. 서버는 재료 내주기 · 시안 저장 · 복제 · 삭제 · 확정만.
// 규칙 위반은 거부하지 않고 목록으로 저장한다. 거부는 권한·기관 경계·형식뿐.
const id = z.coerce.number().int().positive();
const ref = z.union([z.null(), z.coerce.number().int().positive()]).optional();
const notFound = (res) => res.status(404).json({ error: '없습니다' });
const bad = (res) => res.status(400).json({ error: '입력을 확인해 주세요' });
const cellIn = z.object({
  classroom_id: z.coerce.number().int().positive(),
  weekday: z.number().int().min(1).max(7),
  period: z.number().int().min(1).max(CEIL.periods),
  subject_id: ref,
  membership_id: ref,
  special_room_id: ref,
});
const genIn = z.object({
  name: z.string().trim().min(1).max(60),
  cells: z.array(cellIn).max(CEIL.cells),
  gen_info: z.object({ rank: z.number().int().min(0).max(100), hard: z.number().int().min(0), rr: z.number().int().min(0), soft: z.number().optional(), unplaced: z.array(z.any()).max(2000).optional() }).partial().optional(),
});
const REF_TABLE = { classroom_id: 'classroom', subject_id: 'subject', membership_id: 'membership', special_room_id: 'special_room' };

// 겸임 교사의 다른 기관 「오늘 적용 확정본」 칸 → 이 기관 교사 금지 칸(막힌 칸만 · 다른 기관 교과·반 이름은 안 넘긴다).
// 시각이 양쪽에 있으면 시각이 겹치는 이 기관 교시를, 아니면 같은 교시 번호를 막는다.
export async function externalBlockPins(pool, orgId, periods, date) {
  const links = (await pool.query(
    `SELECT m.id AS mine, o.id AS other, o.org_id, og.period_config
       FROM membership m JOIN membership o ON o.user_id = m.user_id AND o.org_id <> m.org_id AND o.deleted_at IS NULL
       JOIN org og ON og.id = o.org_id AND og.deleted_at IS NULL
      WHERE m.org_id = $1 AND m.deleted_at IS NULL`, [orgId])).rows;
  const ttCache = new Map();
  const out = new Map();
  const grades = Object.keys(periods?.grades ?? {});
  for (const l of links) {
    if (!ttCache.has(l.org_id)) ttCache.set(l.org_id, await appliedTimetable(pool, l.org_id, date));
    const tt = ttCache.get(l.org_id);
    if (!tt) continue;
    const rows = (await pool.query(
      `SELECT c.weekday, c.period, cl.grade FROM cell c JOIN classroom cl ON cl.id = c.classroom_id
        WHERE c.org_id = $1 AND c.timetable_id = $2 AND c.membership_id = $3 AND c.deleted_at IS NULL`, [l.org_id, tt.id, l.other])).rows;
    for (const r of rows) {
      const t = periodTime(l.period_config ?? {}, r.grade, r.period);
      const ps = new Set();
      if (t) {
        for (const g of grades) {
          const n = periodsOf(periods, g, 8);
          for (let p = 1; p <= n; p++) { const m = periodTime(periods, g, p); if (m && m.start < t.end && t.start < m.end) ps.add(p); }
        }
      }
      if (!ps.size && !(t && grades.some((g) => periodTime(periods, g, 1)))) ps.add(r.period);
      for (const p of ps) out.set(`${l.mine}:${r.weekday}:${p}`, { target_kind: '교사', target_id: Number(l.mine), weekday: r.weekday, period: p, kind: '금지', subject_id: null, external: true });
    }
  }
  return [...out.values()];
}

export function generateRouter(pool) {
  const r = express.Router({ mergeParams: true });
  const view = requireOrgAction('timetable.view');
  const edit = requireOrgAction('timetable.edit');
  const getTt = async (req) => {
    const tid = id.safeParse(req.params.tid);
    if (!tid.success) return null;
    return (await pool.query(`SELECT id, term_id, name, status, starts_on FROM timetable WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`, [tid.data, req.orgId])).rows[0] ?? null;
  };
  const myMembership = async (req) => (await pool.query(`SELECT id FROM membership WHERE org_id = $1 AND user_id = $2 AND deleted_at IS NULL`, [req.orgId, req.session.userId])).rows[0];
  // 칸들이 가리키는 id 가 전부 이 기관 것인가(하나라도 남의 것이면 404)
  async function refsOk(orgId, cells) {
    for (const [col, table] of Object.entries(REF_TABLE)) {
      const ids = [...new Set(cells.map((c) => c[col]).filter(Boolean).map(Number))];
      if (!ids.length) continue;
      const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE id = ANY($1::bigint[]) AND org_id = $2 AND deleted_at IS NULL`, [ids, orgId]);
      if (rows[0].n !== ids.length) return false;
    }
    return true;
  }
  async function insertCells(client, orgId, ttId, cells) {
    if (!cells.length) return;
    const col = (k) => cells.map((c) => c[k] ?? null);
    await client.query(
      `INSERT INTO cell (org_id, timetable_id, classroom_id, weekday, period, subject_id, membership_id, special_room_id)
       SELECT $1, $2, * FROM unnest($3::bigint[], $4::int[], $5::int[], $6::bigint[], $7::bigint[], $8::bigint[])`,
      [orgId, ttId, col('classroom_id'), col('weekday'), col('period'), col('subject_id'), col('membership_id'), col('special_room_id')],
    );
  }
  async function newTimetable(req, client, name, cells, genInfo) {
    const t = await currentTerm(pool, req.orgId);
    const me = await myMembership(req);
    const { rows } = await client.query(
      `INSERT INTO timetable (org_id, term_id, name, created_by, gen_info, violations) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, status`,
      [req.orgId, t.id, name, me?.id ?? null, genInfo ? JSON.stringify(genInfo) : null, JSON.stringify(await findOverlapsFor(pool, req.orgId, cells))],
    );
    await insertCells(client, req.orgId, rows[0].id, cells);
    return rows[0];
  }
  const tx = async (fn) => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const out = await fn(c);
      await c.query('COMMIT');
      return out;
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      throw e;
    } finally { c.release(); }
  };
  const dupOr = (res, next) => (e) => (e.code === '23505' ? res.status(409).json({ error: '이미 같은 것이 있습니다' }) : next(e));

  // 생성 재료 한 번에: 반 · 교시 · 시수표 펼침 · 고정/금지 · 교과 · 교사 · 특별실 · 규칙 수위
  r.get('/gen/input', edit, async (req, res, next) => {
    try {
      const o = req.orgId;
      const t = await currentTerm(pool, o);
      const q = async (sql, p = [o]) => (await pool.query(sql, p)).rows;
      const classrooms = await q(`SELECT id, grade, class_no, homeroom_membership_id FROM classroom WHERE org_id = $1 AND term_id = $2 AND deleted_at IS NULL ORDER BY grade, class_no`, [o, t.id]);
      const lines = await q(`SELECT id, membership_id, subject_id, classroom_id, special_room_id, weekly_hours, sync_progress, block FROM teaching_load WHERE org_id = $1 AND term_id = $2 AND deleted_at IS NULL ORDER BY id`, [o, t.id]);
      const org = (await q(`SELECT soft_weights, small_school FROM org WHERE id = $1`))[0] ?? {};
      const periodCfg = (await q(`SELECT period_config FROM org WHERE id = $1`))[0]?.period_config ?? {};
      const tierRows = await q(`SELECT id, tier FROM membership WHERE org_id = $1 AND deleted_at IS NULL AND tier IS NOT NULL`);
      res.json({
        term: t,
        weights: org.soft_weights ?? {}, // 권장 17 가중(바꾼 것만 · 비면 soft.js 기본값)
        // 권장 17 재료: 회피 칸·선택 규칙·숫자 값. 숫자 기본은 org.config.softParams, 기관 저장값(soft_weights.params)이 덮는다
        avoid: org.soft_weights?.avoid ?? {},
        options: org.soft_weights?.options ?? {},
        params: { ...(await loadConfig(pool, o)).softParams, ...(org.soft_weights?.params ?? {}) },
        tiers: Object.fromEntries(tierRows.map((r) => [Number(r.id), r.tier])),
        small: org.small_school ?? {}, // 소규모교 설정
        classrooms,
        lines: expandMaster(lines, classrooms),
        pins: [...await q(`SELECT target_kind, target_id, weekday, period, kind, subject_id FROM pin WHERE org_id = $1 AND term_id = $2 AND deleted_at IS NULL`, [o, t.id]), ...await externalBlockPins(pool, o, periodCfg, req.query.date)],
        periods: periodCfg,
        subjects: await q(`SELECT id, name, short_name FROM subject WHERE org_id = $1 AND deleted_at IS NULL ORDER BY is_default DESC, id`),
        teachers: await q(`SELECT m.id, u.name FROM membership m JOIN app_user u ON u.id = m.user_id WHERE m.org_id = $1 AND m.deleted_at IS NULL AND m.status = '사용' AND m.role <> '시스템관리자' ORDER BY u.name`),
        rooms: await q(`SELECT id, name FROM special_room WHERE org_id = $1 AND deleted_at IS NULL ORDER BY id`),
        levels: await getRuleLevels(pool, o),
      });
    } catch (e) { next(e); }
  });

  // 생성 결과를 새 시안으로 저장(칸 통째)
  r.post('/timetables/generated', edit, async (req, res, next) => {
    const p = genIn.safeParse(req.body);
    if (!p.success) return bad(res);
    try {
      const keys = new Set(p.data.cells.map((c) => `${c.classroom_id}:${c.weekday}:${c.period}`));
      if (keys.size !== p.data.cells.length) return res.status(409).json({ error: '같은 칸이 둘 있습니다' });
      if (!(await refsOk(req.orgId, p.data.cells))) return notFound(res);
      const tt = await tx((c) => newTimetable(req, c, p.data.name, p.data.cells, p.data.gen_info ?? null));
      const levels = await getRuleLevels(pool, req.orgId);
      const w = limitWarnings(await loadConfig(pool, req.orgId), { cells: p.data.cells.length, periods: Math.max(0, ...p.data.cells.map((c) => c.period)) });
      res.status(201).json(withWarnings({ ...tt, violations: applyLevels(levels, await findOverlapsFor(pool, req.orgId, p.data.cells)) }, w));
    } catch (e) { dupOr(res, next)(e); }
  });

  // 시안 복제 — 확정본을 복제해도 새것은 시안
  r.post('/timetables/:tid/copy', edit, async (req, res, next) => {
    try {
      const tt = await getTt(req);
      if (!tt) return notFound(res);
      const p = z.object({ name: z.string().trim().min(1).max(60) }).safeParse(req.body);
      if (!p.success) return bad(res);
      const cells = (await pool.query(`SELECT classroom_id, weekday, period, subject_id, membership_id, special_room_id FROM cell WHERE org_id = $1 AND timetable_id = $2 AND deleted_at IS NULL`, [req.orgId, tt.id])).rows;
      const info = (await pool.query(`SELECT gen_info FROM timetable WHERE id = $1`, [tt.id])).rows[0]?.gen_info;
      res.status(201).json(await tx((c) => newTimetable(req, c, p.data.name, cells, info ? { ...info, copied_from: tt.id } : { copied_from: tt.id })));
    } catch (e) { dupOr(res, next)(e); }
  });

  // 시안 지우기(표시만 지움 · 칸도 같이)
  r.delete('/timetables/:tid', edit, async (req, res, next) => {
    try {
      const tt = await getTt(req);
      if (!tt) return notFound(res);
      await tx(async (c) => {
        await c.query(`UPDATE cell SET deleted_at = now() WHERE org_id = $1 AND timetable_id = $2 AND deleted_at IS NULL`, [req.orgId, tt.id]);
        await c.query(`UPDATE timetable SET deleted_at = now() WHERE id = $1 AND org_id = $2`, [tt.id, req.orgId]);
      });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // 확정 — 적용 시작일과 함께. 확정은 여럿이어도 된다. 같은 시작일 확정본이 있으면 알림만 붙인다.
  r.post('/timetables/:tid/confirm', edit, async (req, res, next) => {
    try {
      const tt = await getTt(req);
      if (!tt) return notFound(res);
      const p = z.object({ starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(req.body);
      if (!p.success) return bad(res);
      const { rows } = await pool.query(
        `UPDATE timetable SET status = '확정', starts_on = $3, confirmed_at = now() WHERE id = $1 AND org_id = $2 RETURNING id, name, status, starts_on`,
        [tt.id, req.orgId, p.data.starts_on],
      );
      const same = (await pool.query(
        `SELECT id, name FROM timetable WHERE org_id = $1 AND term_id = $2 AND status = '확정' AND starts_on = $3 AND id <> $4 AND deleted_at IS NULL`,
        [req.orgId, tt.term_id, p.data.starts_on, tt.id],
      )).rows;
      const notes = same.map((s) => ({ level: '알림', color: 'yellow', detail: `같은 날 시작하는 확정본이 있습니다: ${s.name}` }));
      res.json({ ...rows[0], notes });
    } catch (e) { next(e); }
  });

  // 확정 풀기(다시 시안으로)
  r.post('/timetables/:tid/unconfirm', edit, async (req, res, next) => {
    try {
      const tt = await getTt(req);
      if (!tt) return notFound(res);
      const { rows } = await pool.query(`UPDATE timetable SET status = '시안', confirmed_at = NULL WHERE id = $1 AND org_id = $2 RETURNING id, name, status, starts_on`, [tt.id, req.orgId]);
      res.json(rows[0]);
    } catch (e) { next(e); }
  });

  // 이름 바꾸기
  r.patch('/timetables/:tid', edit, async (req, res, next) => {
    try {
      const tt = await getTt(req);
      if (!tt) return notFound(res);
      const p = z.object({ name: z.string().trim().min(1).max(60) }).safeParse(req.body);
      if (!p.success) return bad(res);
      const { rows } = await pool.query(`UPDATE timetable SET name = $3 WHERE id = $1 AND org_id = $2 RETURNING id, name, status, starts_on`, [tt.id, req.orgId, p.data.name]);
      res.json(rows[0]);
    } catch (e) { dupOr(res, next)(e); }
  });

  // 생성 정보(순위·못 놓은 시수 등) 읽기
  r.get('/timetables/:tid/gen-info', view, async (req, res, next) => {
    try {
      const tt = await getTt(req);
      if (!tt) return notFound(res);
      res.json((await pool.query(`SELECT gen_info FROM timetable WHERE id = $1`, [tt.id])).rows[0]?.gen_info ?? null);
    } catch (e) { next(e); }
  });
  return r;
}
