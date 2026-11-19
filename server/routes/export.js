import express from 'express';
import { z } from 'zod';
import { requireOrgAction } from '../guard.js';
import { currentTerm } from './school.js';
import { CEIL, limitWarnings, loadConfig, withWarnings } from '../orgConfig.js';
import { buildSheets, classSheet, loadSheetData, sheetsTitle } from '../export/data.js';
import { loadSettings, mergeSettings } from '../export/settings.js';
import { lunchShifts } from '../export/lunch.js';
import { makePdf } from '../export/pdf.js';
import { makeXlsx } from '../export/xlsx.js';
import { makeHwpx } from '../export/hwpx.js';
import { makeTemplate, parseRows, readTable } from '../export/import.js';

// S-4b 출력 · 급식 벽시계 · 반 비교 · 담임 과목 취합본 올리기. 기관 경계는 다른 경로와 같다(세션 기관·역할·404).
const id = z.coerce.number().int().positive();
const notFound = (res) => res.status(404).json({ error: '없습니다' });
const FORMATS = {
  pdf: { make: makePdf, type: 'application/pdf' },
  xlsx: { make: makeXlsx, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  hwpx: { make: makeHwpx, type: 'application/hwp+zip' },
};
const settingsIn = z.object({
  changcheColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  specialistColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  shadeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  changcheNames: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  shadeRoomKeywords: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  lunchMinutes: z.number().int().min(10).max(120).optional(),
});

// 내려받기 파일 이름: 경로·따옴표·제어·방향 글자는 '_'로, 앞의 점은 뗀다. RFC 5987 에서 못 쓰는 ' ( ) * ! 까지 %로 바꾼다(S-sec2).
const safeName = (s) => encodeURIComponent(String(s).replace(/[\\/:*?"<>|\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '_').replace(/^\.+/, '_') || 'timetable')
  .replace(/['()*!]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export function exportRouter(pool) {
  const r = express.Router({ mergeParams: true });
  const view = requireOrgAction('timetable.view');
  const edit = requireOrgAction('timetable.edit');
  const guard = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };

  // 내려받을 시간표 고르기 — 확정본(적용 시작일 순) 먼저, 시안은 그 뒤
  r.get('/export/targets', view, guard(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, name, status, starts_on FROM timetable WHERE org_id = $1 AND deleted_at IS NULL
        ORDER BY (status = '확정') DESC, starts_on DESC NULLS LAST, id DESC`, [req.orgId]);
    res.json(rows);
  }));

  // 출력 설정(색 등) — 기관이 바꿀 수 있다. 비운 값은 기본값.
  r.get('/export/settings', view, guard(async (req, res) => res.json(await loadSettings(pool, req.orgId))));
  r.put('/export/settings', edit, guard(async (req, res) => {
    const p = settingsIn.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: '입력을 확인해 주세요' });
    await pool.query(`UPDATE org SET export_settings = $2 WHERE id = $1`, [req.orgId, JSON.stringify(p.data)]);
    res.json(mergeSettings(p.data));
  }));

  // 시간표 내려받기: /timetables/:tid/export.pdf|xlsx|hwpx ?view=class|teacher &id=반·교사 하나만
  r.get('/timetables/:tid/export.:fmt', view, guard(async (req, res) => {
    const f = FORMATS[req.params.fmt];
    const tid = id.safeParse(req.params.tid);
    if (!f || !tid.success) return notFound(res);
    const d = await loadSheetData(pool, req.orgId, tid.data);
    if (!d) return notFound(res);
    const st = await loadSettings(pool, req.orgId);
    const v = req.query.view === 'teacher' ? 'teacher' : 'class';
    const one = req.query.id ? id.safeParse(req.query.id) : null;
    if (one && !one.success) return res.status(400).json({ error: '입력을 확인해 주세요' });
    const title = sheetsTitle(d);
    const buf = await f.make(buildSheets(d, st, { view: v, id: one?.data ?? null }), st, title, (await loadConfig(pool, req.orgId)).duties);
    res.set('Content-Type', f.type);
    res.set('Content-Disposition', `attachment; filename="timetable.${req.params.fmt}"; filename*=UTF-8''${safeName(title)}.${req.params.fmt}`);
    res.send(buf);
  }));

  // 급식 3교대 벽시계 — 학년별 점심 시각(학교 기본)을 교대로 묶어 돌려준다
  r.get('/lunch-clock', view, guard(async (req, res) => {
    const { rows } = await pool.query(`SELECT period_config FROM org WHERE id = $1 AND deleted_at IS NULL`, [req.orgId]);
    res.json(lunchShifts(rows[0]?.period_config, (await loadSettings(pool, req.orgId)).lunchMinutes));
  }));

  // 반 비교(두 반 나란히): ?a=반id&b=반id
  r.get('/timetables/:tid/compare', view, guard(async (req, res) => {
    const tid = id.safeParse(req.params.tid);
    const a = id.safeParse(req.query.a); const b = id.safeParse(req.query.b);
    if (!tid.success || !a.success || !b.success) return notFound(res);
    const d = await loadSheetData(pool, req.orgId, tid.data);
    if (!d) return notFound(res);
    const ca = d.classrooms.find((c) => Number(c.id) === a.data); const cb = d.classrooms.find((c) => Number(c.id) === b.data);
    if (!ca || !cb) return notFound(res);
    const st = await loadSettings(pool, req.orgId);
    res.json({ settings: st, sheets: [classSheet(d, st, ca), classSheet(d, st, cb)] });
  }));

  // 담임 과목 취합본 — 양식 · 미리보기(쓰지 않음) · 반영
  r.get('/homeroom-subjects/template', edit, guard(async (req, res) => {
    res.set('Content-Type', FORMATS.xlsx.type);
    res.set('Content-Disposition', `attachment; filename="homeroom-template.xlsx"`);
    res.send(await makeTemplate());
  }));
  const raw = express.raw({ type: 'application/octet-stream', limit: '5mb' });
  r.post('/homeroom-subjects/preview', edit, raw, guard(async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: '파일을 확인해 주세요' });
    let table;
    try { table = await readTable(req.body); } catch (e) {
      return res.status(e.status === 400 ? 400 : 400).json({ error: e.status === 400 ? e.message : '파일을 읽지 못했습니다. 한글에서 hwpx·엑셀로 다른 이름 저장 해 주세요' });
    }
    const t = await currentTerm(pool, req.orgId);
    const classrooms = (await pool.query(`SELECT id, grade, class_no FROM classroom WHERE org_id = $1 AND term_id = $2 AND deleted_at IS NULL`, [req.orgId, t.id])).rows;
    const subjects = (await pool.query(`SELECT id, name, short_name FROM subject WHERE org_id = $1 AND deleted_at IS NULL`, [req.orgId])).rows;
    const rows = parseRows(table, { classrooms, subjects });
    res.json({ rows, ok: rows.filter((x) => x.ok).length, unread: rows.filter((x) => !x.ok).length });
  }));
  // 미리보기에서 읽힌 줄만 시수표에 넣는다(담임 = 반의 담임). 못 읽은 줄은 건너뛰고 개수를 알린다.
  r.post('/homeroom-subjects/apply', edit, guard(async (req, res) => {
    const p = z.object({ rows: z.array(z.object({ classroom_id: id, subject_id: id, hours: z.number().int().min(1).max(CEIL.loadPerWeek) })).max(500) }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: '입력을 확인해 주세요' });
    const t = await currentTerm(pool, req.orgId);
    let done = 0; let skipped = 0;
    for (const x of p.data.rows) {
      const cl = (await pool.query(`SELECT homeroom_membership_id FROM classroom WHERE id = $1 AND org_id = $2 AND term_id = $3 AND deleted_at IS NULL`, [x.classroom_id, req.orgId, t.id])).rows[0];
      const sb = (await pool.query(`SELECT 1 FROM subject WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`, [x.subject_id, req.orgId])).rows[0];
      if (!cl || !sb) { skipped++; continue; }
      const mem = cl.homeroom_membership_id ?? null;
      const up = await pool.query(
        `UPDATE teaching_load SET weekly_hours = $6 WHERE org_id = $1 AND term_id = $2 AND classroom_id = $3 AND subject_id = $4 AND membership_id IS NOT DISTINCT FROM $5::bigint AND deleted_at IS NULL`,
        [req.orgId, t.id, x.classroom_id, x.subject_id, mem, x.hours]);
      if (!up.rowCount) {
        await pool.query(`INSERT INTO teaching_load (org_id, term_id, membership_id, subject_id, classroom_id, weekly_hours) VALUES ($1,$2,$3,$4,$5,$6)`, [req.orgId, t.id, mem, x.subject_id, x.classroom_id, x.hours]);
      }
      done++;
    }
    res.json(withWarnings({ applied: done, skipped }, limitWarnings(await loadConfig(pool, req.orgId), { loadPerWeek: Math.max(0, ...p.data.rows.map((x) => x.hours)) })));
  }));
  return r;
}
