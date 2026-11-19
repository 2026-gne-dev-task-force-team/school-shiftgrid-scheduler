import { readFileSync } from 'node:fs';
import express from 'express';
import { z } from 'zod';
import { requireOrgAction } from '../guard.js';
import { audit } from '../audit.js';
import { CEIL, dutyWarnings, limitWarnings, loadConfig, semesterOf, withWarnings } from '../orgConfig.js';

// 학교 기본: 학기 · 반 · 학년별 교시·점심 · 기본 교과 14 · 특별실 · 전담·비교과
const id = z.coerce.number().int().positive();
// 기본 교과는 코드가 아니라 server/presets/subjects.json 에 있다(읽을 때마다 파일에서 — 고치면 바로 반영)
const PRESET_FILE = new URL('../presets/subjects.json', import.meta.url);
export function loadSubjectPreset() {
  const j = JSON.parse(readFileSync(PRESET_FILE, 'utf8'));
  // [이름, 줄임말, 열쇠] — 열쇠(preset_key)가 없으면 이름이 열쇠다. 기관이 이름을 바꿔도 열쇠로 같은 교과임을 안다.
  return (j.subjects || []).filter((x) => Array.isArray(x) && typeof x[0] === 'string' && x[0].trim())
    .map(([n, s, k, old]) => [n.trim(), s ?? null, typeof k === 'string' && k.trim() ? k.trim() : n.trim(), Array.isArray(old) ? old.filter((x) => typeof x === 'string').map((x) => x.trim()) : []]);
}

const notFound = (res) => res.status(404).json({ error: '없습니다' });
const bad = (res) => res.status(400).json({ error: '입력을 확인해 주세요' });
const dup = (res) => res.status(409).json({ error: '이미 같은 것이 있습니다' });
const guard = (fn) => async (req, res, next) => {
  try { await fn(req, res); } catch (e) { e.code === '23505' ? dup(res) : next(e); }
};

// 지금 학기(없으면 만든다). 기관 경계: 항상 org_id 로만.
export async function currentTerm(pool, orgId) {
  const { rows } = await pool.query(`SELECT id, year, semester FROM term WHERE org_id = $1 AND status = '진행' AND deleted_at IS NULL ORDER BY year DESC, semester DESC LIMIT 1`, [orgId]);
  if (rows[0]) return rows[0];
  const now = new Date();
  const year = now.getFullYear();
  const semester = semesterOf(await loadConfig(pool, orgId), now.getMonth() + 1); // 학기 시작 달은 기관 설정(기본 3·9월)
  const ins = await pool.query(
    `INSERT INTO term (org_id, year, semester) VALUES ($1, $2, $3) ON CONFLICT (org_id, year, semester) WHERE deleted_at IS NULL DO UPDATE SET year = EXCLUDED.year RETURNING id, year, semester`,
    [orgId, year, semester],
  );
  return ins.rows[0];
}

// 프리셋 교과 — 기관에 교과가 (숨긴 것까지 센) 하나도 없을 때 한 번 넣는다
export async function ensureDefaultSubjects(pool, orgId) {
  const { rows } = await pool.query(`SELECT 1 FROM subject WHERE org_id = $1 LIMIT 1`, [orgId]);
  if (rows[0]) return;
  for (const [name, short, key] of loadSubjectPreset()) {
    await pool.query(`INSERT INTO subject (org_id, name, short_name, is_default, preset_key) VALUES ($1, $2, $3, TRUE, $4) ON CONFLICT DO NOTHING`, [orgId, name, short, key]);
  }
}

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
// 교시별 시작·끝 시각(겹침 검사가 시각으로 본다) — [{start:'09:00', end:'09:40'}, ...] 1교시부터 차례로
const periodTimes = z.array(z.object({ start: HHMM, end: HHMM }).refine((t) => t.start < t.end).nullable()).max(CEIL.periods);
const periodConfig = z.object({
  grades: z.record(
    z.string().regex(/^([1-9]|1\d|20)$/), // 학년 키: 천장 20
    z.object({
      periods: z.number().int().min(1).max(CEIL.periods),
      lunch: HHMM.nullable().optional(), // 점심 시작 시각 HH:MM
      lunchAfter: z.number().int().min(0).max(CEIL.periods).optional(), // 몇 교시 뒤
      times: periodTimes.optional(), // 이 학년만 다른 교시 시각
    }),
  ),
  times: periodTimes.optional(), // 학교 공통 교시 시각(학년 칸이 없으면 이것)
});
const classroomIn = z.object({ grade: z.number().int().min(1).max(CEIL.grades), class_no: z.number().int().min(1).max(CEIL.classNo), student_count: z.number().int().min(0).max(CEIL.students).nullable().optional() });
const subjectIn = z.object({ name: z.string().trim().min(1).max(40), short_name: z.string().trim().max(10).nullable().optional(), color: z.string().max(20).nullable().optional() });
const roomIn = z.object({ name: z.string().trim().min(1).max(40), purpose: z.enum(['수업용', '예약용']).optional(), capacity: z.number().int().min(0).max(CEIL.capacity).nullable().optional() });

export function schoolRouter(pool) {
  const r = express.Router({ mergeParams: true });
  const view = requireOrgAction('timetable.view');
  const manage = requireOrgAction('school.manage');

  // ── 학기 ──
  r.get('/term', view, guard(async (req, res) => res.json(await currentTerm(pool, req.orgId))));

  // 학기 목록(보관 포함) · 보관 학기 개요(읽기 전용) — 기관 경계는 org_id 로만
  r.get('/terms', view, guard(async (req, res) => {
    res.json((await pool.query(`SELECT id, year, semester, status FROM term WHERE org_id = $1 AND deleted_at IS NULL ORDER BY year DESC, semester DESC`, [req.orgId])).rows);
  }));
  r.get('/terms/:termId/overview', view, guard(async (req, res) => {
    const tid = id.safeParse(req.params.termId);
    if (!tid.success) return notFound(res);
    const t = (await pool.query(`SELECT id, year, semester, status FROM term WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`, [tid.data, req.orgId])).rows[0];
    if (!t) return notFound(res);
    const q = (sql) => pool.query(sql, [req.orgId, t.id]).then((x) => x.rows);
    res.json({
      term: t,
      classrooms: await q(`SELECT id, grade, class_no FROM classroom WHERE org_id = $1 AND term_id = $2 AND deleted_at IS NULL ORDER BY grade, class_no`),
      timetables: await q(`SELECT id, name, status FROM timetable WHERE org_id = $1 AND term_id = $2 AND deleted_at IS NULL ORDER BY id`),
      loadCount: (await q(`SELECT count(*)::int AS n FROM teaching_load WHERE org_id = $1 AND term_id = $2 AND deleted_at IS NULL`))[0].n,
    });
  }));
  // 새 학기 시작: 지난 학기는 '보관'(읽기 전용), 새 학기는 반·시수표·시간표가 빈 채로. 명단(계정·소속)은 학기와 무관해 그대로.
  // 되돌릴 수 없어 confirm 없이는 409 로 되묻는다. 다음 학기 값(연·학기)은 body 로 바꿀 수 있다.
  r.post('/terms/new-semester', manage, guard(async (req, res) => {
    const p = z.object({ confirm: z.boolean().optional(), year: z.number().int().min(2000).max(2200).optional(), semester: z.number().int().min(1).max(2).optional() }).safeParse(req.body ?? {});
    if (!p.success) return bad(res);
    const cur = await currentTerm(pool, req.orgId);
    const next = p.data.year && p.data.semester ? { year: p.data.year, semester: p.data.semester } : cur.semester === 1 ? { year: cur.year, semester: 2 } : { year: cur.year + 1, semester: 1 };
    if (!p.data.confirm) {
      return res.status(409).json({ needConfirm: true, error: `${cur.year}년 ${cur.semester}학기를 보관(읽기 전용)하고 ${next.year}년 ${next.semester}학기를 시작합니다. 시간표·시수표·담임 반은 새 학기에서 비어 시작하고 명단은 그대로입니다. 되돌릴 수 없습니다.`, current: cur, next });
    }
    const c = await pool.connect();
    let made;
    try {
      await c.query('BEGIN');
      await c.query(`UPDATE term SET status = '보관' WHERE org_id = $1 AND status = '진행' AND deleted_at IS NULL`, [req.orgId]);
      made = (await c.query(`INSERT INTO term (org_id, year, semester) VALUES ($1,$2,$3) RETURNING id, year, semester, status`, [req.orgId, next.year, next.semester])).rows[0];
      await c.query('COMMIT');
    } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
    await audit(pool, { orgId: req.orgId, userId: req.session.userId, action: 'term.new_semester', table: 'term', rowId: made.id, before: cur, after: made });
    res.json({ archived: cur, term: made });
  }));

  // ── 학년별 교시·점심 ──
  r.get('/school/periods', view, guard(async (req, res) => {
    const { rows } = await pool.query(`SELECT period_config FROM org WHERE id = $1 AND deleted_at IS NULL`, [req.orgId]);
    res.json(rows[0]?.period_config ?? {});
  }));
  r.put('/school/periods', manage, guard(async (req, res) => {
    const p = periodConfig.safeParse(req.body);
    if (!p.success) return bad(res);
    await pool.query(`UPDATE org SET period_config = $2 WHERE id = $1`, [req.orgId, JSON.stringify(p.data)]);
    const cfg = await loadConfig(pool, req.orgId);
    const gs = Object.keys(p.data.grades);
    const w = limitWarnings(cfg, { periods: Math.max(0, ...Object.values(p.data.grades).map((g) => g.periods)), grades: Math.max(0, ...gs.map(Number)) });
    res.json(withWarnings(p.data, w));
  }));

  // ── 반 ──
  r.post('/classrooms', manage, guard(async (req, res) => {
    const p = classroomIn.safeParse(req.body);
    if (!p.success) return bad(res);
    const t = await currentTerm(pool, req.orgId);
    const { rows } = await pool.query(
      `INSERT INTO classroom (org_id, term_id, grade, class_no, student_count) VALUES ($1,$2,$3,$4,$5) RETURNING id, term_id, grade, class_no, student_count`,
      [req.orgId, t.id, p.data.grade, p.data.class_no, p.data.student_count ?? null],
    );
    const cfg = await loadConfig(pool, req.orgId);
    res.status(201).json(withWarnings(rows[0], limitWarnings(cfg, { grades: p.data.grade, classNo: p.data.class_no, students: p.data.student_count ?? 0 })));
  }));
  // 한 학년 반을 한꺼번에: {grade, count}  (이미 있는 반은 건너뜀)
  r.post('/classrooms/bulk', manage, guard(async (req, res) => {
    const p = z.object({ grade: z.number().int().min(1).max(CEIL.grades), count: z.number().int().min(1).max(CEIL.classNo) }).safeParse(req.body);
    if (!p.success) return bad(res);
    const t = await currentTerm(pool, req.orgId);
    for (let n = 1; n <= p.data.count; n++) {
      await pool.query(`INSERT INTO classroom (org_id, term_id, grade, class_no) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [req.orgId, t.id, p.data.grade, n]);
    }
    const { rows } = await pool.query(`SELECT id, grade, class_no FROM classroom WHERE org_id = $1 AND term_id = $2 AND grade = $3 AND deleted_at IS NULL ORDER BY class_no`, [req.orgId, t.id, p.data.grade]);
    // 응답은 배열 그대로 — 경고는 머리 X-Warnings(JSON 을 URI 인코딩)로 싣는다
    const w = limitWarnings(await loadConfig(pool, req.orgId), { grades: p.data.grade, classNo: p.data.count });
    if (w.length) res.set('X-Warnings', encodeURIComponent(JSON.stringify(w)));
    res.status(201).json(rows);
  }));
  r.patch('/classrooms/:id', manage, guard(async (req, res) => {
    const cid = id.safeParse(req.params.id);
    const p = z.object({ student_count: z.number().int().min(0).max(CEIL.students).nullable().optional(), homeroom_membership_id: z.union([z.null(), z.coerce.number().int().positive()]).optional() }).safeParse(req.body);
    if (!cid.success || !p.success) return notFound(res);
    if (p.data.homeroom_membership_id) {
      const m = await pool.query(`SELECT 1 FROM membership WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`, [p.data.homeroom_membership_id, req.orgId]);
      if (!m.rows[0]) return notFound(res);
    }
    const sets = [];
    const vals = [cid.data, req.orgId];
    for (const k of ['student_count', 'homeroom_membership_id']) {
      if (k in p.data) { vals.push(p.data[k]); sets.push(`${k} = $${vals.length}`); }
    }
    if (!sets.length) return bad(res);
    const { rows } = await pool.query(`UPDATE classroom SET ${sets.join(', ')} WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL RETURNING id, grade, class_no, student_count, homeroom_membership_id`, vals);
    rows[0] ? res.json(withWarnings(rows[0], limitWarnings(await loadConfig(pool, req.orgId), { students: p.data.student_count ?? 0 }))) : notFound(res);
  }));
  r.delete('/classrooms/:id', manage, guard(async (req, res) => {
    const cid = id.safeParse(req.params.id);
    if (!cid.success) return notFound(res);
    const { rowCount } = await pool.query(`UPDATE classroom SET deleted_at = now() WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`, [cid.data, req.orgId]);
    rowCount ? res.json({ ok: true }) : notFound(res);
  }));

  // ── 교과 ──
  r.get('/subjects', view, guard(async (req, res) => {
    await ensureDefaultSubjects(pool, req.orgId);
    // ?hidden=1 이면 숨긴 교과(hidden: true)까지 — 관리 화면용
    const all = req.query.hidden === '1';
    const { rows } = await pool.query(`SELECT id, name, short_name, color, is_default, (deleted_at IS NOT NULL) AS hidden FROM subject WHERE org_id = $1 AND ($2::boolean OR deleted_at IS NULL) ORDER BY (deleted_at IS NOT NULL), is_default DESC, id`, [req.orgId, all]);
    res.json(rows);
  }));
  // 프리셋 다시 불러오기 — 열쇠(preset_key)로 맞춘다. 이 기관에 그 열쇠가 없을 때만 더한다
  // (숨긴 것·이름 바꾼 것은 열쇠가 남아 있어 건드리지 않는다). 열쇠 없는 옛 줄은 같은 이름이면 열쇠를 달아 준다.
  r.post('/subjects/preset-reload', manage, guard(async (req, res) => {
    const rows = (await pool.query(`SELECT id, name, preset_key, is_default, deleted_at IS NULL AS live FROM subject WHERE org_id = $1 ORDER BY id`, [req.orgId])).rows;
    const keys = new Set(rows.map((x) => x.preset_key).filter(Boolean));
    const preset = loadSubjectPreset();
    // 열쇠 없는 기본 교과: 이름 → 프리셋 옛 이름 → 기본 교과 순서(프리셋 n번째 = 기본 교과 n번째) 로 맞춘다
    const defaults = rows.filter((x) => x.is_default);
    const added = [];
    const linked = [];
    const needsCheck = [];
    const link = async (row, key, name) => {
      await pool.query(`UPDATE subject SET preset_key = $3 WHERE id = $1 AND org_id = $2 AND preset_key IS NULL`, [row.id, req.orgId, key]);
      row.preset_key = key;
      keys.add(key);
      linked.push(name);
    };
    for (const [i, [name, short, key, old]] of preset.entries()) {
      if (keys.has(key)) continue;
      const names = [name, ...old];
      const same = rows.find((x) => names.includes(x.name) && (!x.preset_key || !preset.some((p) => p[2] === x.preset_key)));
      if (same && !same.preset_key) { await link(same, key, name); continue; }
      if (same) { keys.add(key); continue; } // 같은 이름 자리가 다른 열쇠로 막혀 더하지 않는다
      const byOrder = defaults[i];
      if (byOrder && !byOrder.preset_key) { await link(byOrder, key, name); continue; }
      // 열쇠 없는 기본 교과가 남아 있는데 맞는 것을 못 찾음 — 새로 만들지 않고 돌려준다
      if (defaults.some((x) => !x.preset_key)) { needsCheck.push(name); continue; }
      await pool.query(`INSERT INTO subject (org_id, name, short_name, is_default, preset_key) VALUES ($1,$2,$3,TRUE,$4)`, [req.orgId, name, short, key]);
      rows.push({ name, preset_key: key, live: true });
      keys.add(key);
      added.push(name);
    }
    res.json({ added, linked, needs_check: needsCheck });
  }));
  r.post('/subjects', manage, guard(async (req, res) => {
    const p = subjectIn.safeParse(req.body);
    if (!p.success) return bad(res);
    await ensureDefaultSubjects(pool, req.orgId);
    const { rows } = await pool.query(`INSERT INTO subject (org_id, name, short_name, color) VALUES ($1,$2,$3,$4) RETURNING id, name, short_name, color, is_default`, [req.orgId, p.data.name, p.data.short_name ?? null, p.data.color ?? null]);
    res.status(201).json(rows[0]);
  }));
  r.patch('/subjects/:id', manage, guard(async (req, res) => {
    const sid = id.safeParse(req.params.id);
    const p = subjectIn.partial().extend({ hidden: z.boolean().optional() }).safeParse(req.body);
    if (!sid.success || !p.success) return notFound(res);
    // hidden: true 숨김 · false 되살림(숨긴 줄도 이름·줄임말은 고칠 수 있다)
    const h = p.data.hidden;
    const { rows } = await pool.query(
      `UPDATE subject SET name = COALESCE($3, name), short_name = CASE WHEN $6::boolean THEN $4 ELSE short_name END, color = COALESCE($5, color),
              deleted_at = CASE WHEN $7::boolean IS NULL THEN deleted_at WHEN $7::boolean THEN COALESCE(deleted_at, now()) ELSE NULL END
        WHERE id = $1 AND org_id = $2 AND (deleted_at IS NULL OR $7::boolean IS NOT NULL)
        RETURNING id, name, short_name, color, is_default, (deleted_at IS NOT NULL) AS hidden`,
      [sid.data, req.orgId, p.data.name ?? null, p.data.short_name || null, p.data.color ?? null, 'short_name' in p.data, h ?? null],
    );
    rows[0] ? res.json(rows[0]) : notFound(res);
  }));
  r.delete('/subjects/:id', manage, guard(async (req, res) => {
    const sid = id.safeParse(req.params.id);
    if (!sid.success) return notFound(res);
    const { rowCount } = await pool.query(`UPDATE subject SET deleted_at = now() WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`, [sid.data, req.orgId]);
    rowCount ? res.json({ ok: true }) : notFound(res);
  }));

  // ── 특별실(수업용/예약용) ──
  r.get('/special-rooms', view, guard(async (req, res) => {
    const { rows } = await pool.query(`SELECT id, name, purpose, capacity FROM special_room WHERE org_id = $1 AND deleted_at IS NULL ORDER BY id`, [req.orgId]);
    res.json(rows);
  }));
  r.post('/special-rooms', manage, guard(async (req, res) => {
    const p = roomIn.safeParse(req.body);
    if (!p.success) return bad(res);
    const { rows } = await pool.query(`INSERT INTO special_room (org_id, name, purpose, capacity) VALUES ($1,$2,$3,$4) RETURNING id, name, purpose, capacity`, [req.orgId, p.data.name, p.data.purpose ?? '수업용', p.data.capacity ?? null]);
    res.status(201).json(withWarnings(rows[0], limitWarnings(await loadConfig(pool, req.orgId), { capacity: p.data.capacity ?? 0 })));
  }));
  r.patch('/special-rooms/:id', manage, guard(async (req, res) => {
    const rid = id.safeParse(req.params.id);
    const p = roomIn.partial().safeParse(req.body);
    if (!rid.success || !p.success) return notFound(res);
    const { rows } = await pool.query(
      `UPDATE special_room SET name = COALESCE($3, name), purpose = COALESCE($4, purpose), capacity = COALESCE($5, capacity) WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL RETURNING id, name, purpose, capacity`,
      [rid.data, req.orgId, p.data.name ?? null, p.data.purpose ?? null, p.data.capacity ?? null],
    );
    rows[0] ? res.json(withWarnings(rows[0], limitWarnings(await loadConfig(pool, req.orgId), { capacity: p.data.capacity ?? 0 }))) : notFound(res);
  }));
  r.delete('/special-rooms/:id', manage, guard(async (req, res) => {
    const rid = id.safeParse(req.params.id);
    if (!rid.success) return notFound(res);
    const { rowCount } = await pool.query(`UPDATE special_room SET deleted_at = now() WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`, [rid.data, req.orgId]);
    rowCount ? res.json({ ok: true }) : notFound(res);
  }));

  // ── 「전담·비교과」 탭: 담당 구분이 전담·비교과인 소속 ──
  r.get('/specialists', view, guard(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT m.id AS membership_id, u.name, m.duty FROM membership m JOIN app_user u ON u.id = m.user_id
       WHERE m.org_id = $1 AND m.deleted_at IS NULL AND m.status = '사용' AND m.role IN ('기관관리자','교직원') ORDER BY (m.duty IS NOT NULL AND m.duty <> '담임') DESC, u.name`,
      [req.orgId],
    );
    res.json(rows);
  }));
  r.patch('/specialists/:mid', manage, guard(async (req, res) => {
    const mid = id.safeParse(req.params.mid);
    const p = z.object({ duty: z.string().trim().min(1).max(20).nullable() }).safeParse(req.body);
    if (!mid.success || !p.success) return notFound(res);
    const { rows } = await pool.query(`UPDATE membership SET duty = $3 WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL RETURNING id AS membership_id, duty`, [mid.data, req.orgId, p.data.duty]);
    rows[0] ? res.json(withWarnings(rows[0], dutyWarnings(await loadConfig(pool, req.orgId), p.data.duty))) : notFound(res);
  }));

  return r;
}
