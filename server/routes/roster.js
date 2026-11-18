import express from 'express';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import { requireOrgAction } from '../guard.js';
import { createAccount, resetPassword, ID_RE } from '../accounts.js';
import { audit, killSessions } from '../audit.js';
import { CEIL, dutyWarnings, limitWarnings, loadConfig, withWarnings } from '../orgConfig.js';

// 명단 탭 — 줄 = 계정. 관리자만(school.manage). 모든 쿼리에 membership.org_id = req.orgId.
// 시스템관리자 줄은 명단에 안 나오고 못 건드린다.
const idParam = z.coerce.number().int().positive();
const ROLES = ['기관관리자', '교직원', '보기만'];
const dutyIn = z.string().trim().min(1).max(20); // 목록 밖이면 거부 대신 경고(기관 설정 duties)
const personBody = z.object({
  name: z.string().trim().min(1).max(50),
  loginId: z.string().trim().regex(ID_RE),
  role: z.enum(ROLES).default('교직원'),
  duty: dutyIn.nullable().optional(),
});
const patchBody = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  loginId: z.string().trim().regex(ID_RE).optional(),
  role: z.enum(ROLES).optional(),
  duty: dutyIn.nullable().optional(),
  hidden: z.boolean().optional(), // 숨김(표시 삭제)
});

const MAX_ROWS = CEIL.rosterRows; // 안전 천장. 기관 limits.rosterRows 를 넘으면 경고
const MAX_COLS = 20;

export function rosterRouter(pool) {
  const r = express.Router({ mergeParams: true });
  r.use(requireOrgAction('school.manage'));
  const nf = (res) => res.status(404).json({ error: '없습니다' });
  const me = (req) => ({ orgId: req.orgId, userId: req.session.userId });

  // 이 기관의 줄 하나(시스템관리자 줄 제외)
  const target = async (req, db = pool) =>
    (
      await db.query(
        `SELECT m.id, m.org_id, m.user_id, m.role, m.status AS m_status, u.login_id, u.name
           FROM membership m JOIN app_user u ON u.id = m.user_id AND u.deleted_at IS NULL
          WHERE m.id = $1 AND m.org_id = $2 AND m.deleted_at IS NULL AND m.role <> '시스템관리자'`,
        [req.params.mid, req.orgId],
      )
    ).rows[0];

  // 겸임(다른 기관에도 소속) 계정은 계정 전체에 닿는 일(비번·잠금·ID·이름)을 이 기관 관리자가 못 한다.
  // 막지 않으면 A 관리자가 비번을 초기화해 그 사람의 B 기관 권한(예: B 관리자)으로 로그인할 수 있다(S-sec).
  const SHARED = '다른 기관에도 소속된 계정입니다. 비밀번호·잠금·ID·이름은 시스템 관리자에게 부탁해 주세요';
  const sharedElsewhere = async (t) =>
    !!(await pool.query(`SELECT 1 FROM membership WHERE user_id = $1 AND org_id <> $2 AND deleted_at IS NULL LIMIT 1`, [t.user_id, t.org_id ?? 0])).rows[0];

  const activeAdmins = async (orgId) =>
    (await pool.query(`SELECT count(*)::int AS n FROM membership WHERE org_id = $1 AND role = '기관관리자' AND status = '사용' AND deleted_at IS NULL`, [orgId])).rows[0].n;

  r.get('/', async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT m.id, u.name, u.login_id AS "loginId", m.role, m.duty, m.status AS "listStatus",
                CASE WHEN u.status = '잠김' OR (u.locked_until IS NOT NULL AND u.locked_until > now()) THEN '잠김'
                     WHEN u.last_login_at IS NULL THEN '첫 로그인 전' ELSE '사용 중' END AS "state",
                (u.status = '잠김') AS "manualLock", u.last_login_at AS "lastLogin"
           FROM membership m JOIN app_user u ON u.id = m.user_id AND u.deleted_at IS NULL
          WHERE m.org_id = $1 AND m.deleted_at IS NULL AND m.role <> '시스템관리자'
          ORDER BY m.status, u.name, m.id`,
        [req.orgId],
      );
      res.json(rows);
    } catch (e) {
      next(e);
    }
  });

  r.post('/', async (req, res, next) => {
    try {
      const p = personBody.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: '입력을 확인해 주세요(ID 에는 공백·따옴표·슬래시를 쓸 수 없습니다)' });
      const a = await createAccount(pool, { orgId: req.orgId, ...p.data, duty: p.data.duty ?? null });
      if (a.error) return res.status(409).json({ error: a.error });
      await audit(pool, { ...me(req), action: 'roster.create', table: 'membership', rowId: a.membershipId, after: { loginId: p.data.loginId, role: p.data.role } });
      res.status(201).json(withWarnings({ id: a.membershipId, loginId: p.data.loginId, temp: a.temp }, dutyWarnings(await loadConfig(pool, req.orgId), p.data.duty)));
    } catch (e) {
      next(e);
    }
  });

  r.patch('/:mid', async (req, res, next) => {
    try {
      const p = patchBody.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: '입력을 확인해 주세요' });
      const t = await target(req);
      if (!t) return nf(res);
      const d = p.data;
      const losesAdmin = t.role === '기관관리자' && ((d.role && d.role !== '기관관리자') || d.hidden === true);
      const touchesAccount = (d.loginId && d.loginId !== t.login_id) || (d.name && d.name !== t.name);
      if (touchesAccount && (await sharedElsewhere(t))) return res.status(409).json({ error: SHARED });
      if (losesAdmin && (await activeAdmins(req.orgId)) <= 1) return res.status(409).json({ error: '마지막 관리자는 뗄 수 없습니다. 먼저 다른 관리자를 올려 주세요' });
      if (d.loginId && d.loginId.toLowerCase() !== t.login_id.toLowerCase()) {
        const dup = await pool.query(`SELECT 1 FROM app_user WHERE lower(login_id) = lower($1)`, [d.loginId]);
        if (dup.rows[0]) return res.status(409).json({ error: '이미 쓰고 있는 ID 입니다' });
      }
      if (d.name || d.loginId) await pool.query(`UPDATE app_user SET name = COALESCE($2, name), login_id = COALESCE($3, login_id) WHERE id = $1`, [t.user_id, d.name ?? null, d.loginId ?? null]);
      await pool.query(
        `UPDATE membership SET role = COALESCE($2, role), duty = CASE WHEN $3::boolean THEN $4 ELSE duty END, status = CASE WHEN $5::text IS NULL THEN status ELSE $5 END WHERE id = $1`,
        [t.id, d.role ?? null, 'duty' in d, d.duty ?? null, d.hidden === undefined ? null : d.hidden ? '숨김' : '사용'],
      );
      if (d.role && d.role !== t.role && ROLES.indexOf(d.role) > ROLES.indexOf(t.role)) await killSessions(pool, t.user_id); // 역할이 내려가면 세션 끊기
      if (d.hidden) await killSessions(pool, t.user_id);
      await audit(pool, { ...me(req), action: 'roster.update', table: 'membership', rowId: t.id, before: { role: t.role, loginId: t.login_id }, after: d });
      res.json(withWarnings({ ok: true }, 'duty' in d ? dutyWarnings(await loadConfig(pool, req.orgId), d.duty) : []));
    } catch (e) {
      next(e);
    }
  });

  // 수동 잠금(전출·퇴직) / 해제(실패 자동 잠금도 같이 풀린다)
  r.post('/:mid/lock', async (req, res, next) => {
    try {
      const t = await target(req);
      if (!t) return nf(res);
      if (t.user_id === req.session.userId) return res.status(409).json({ error: '내 계정은 잠글 수 없습니다' });
      if (await sharedElsewhere(t)) return res.status(409).json({ error: SHARED });
      if (t.role === '기관관리자' && (await activeAdmins(req.orgId)) <= 1) return res.status(409).json({ error: '마지막 관리자는 잠글 수 없습니다' });
      await pool.query(`UPDATE app_user SET status = '잠김' WHERE id = $1`, [t.user_id]);
      await killSessions(pool, t.user_id);
      await audit(pool, { ...me(req), action: 'roster.lock', table: 'app_user', rowId: t.user_id });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
  r.post('/:mid/unlock', async (req, res, next) => {
    try {
      const t = await target(req);
      if (!t) return nf(res);
      if (await sharedElsewhere(t)) return res.status(409).json({ error: SHARED });
      await pool.query(`UPDATE app_user SET status = '사용', failed_count = 0, locked_until = NULL WHERE id = $1`, [t.user_id]);
      await audit(pool, { ...me(req), action: 'roster.unlock', table: 'app_user', rowId: t.user_id });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  // 비밀번호 초기화 — 임시 비밀번호는 응답에 한 번만 나온다(저장 안 함)
  r.post('/:mid/reset-password', async (req, res, next) => {
    try {
      const t = await target(req);
      if (!t) return nf(res);
      if (t.user_id === req.session.userId) return res.status(409).json({ error: '내 비밀번호는 「내 정보」에서 바꿔 주세요' });
      if (await sharedElsewhere(t)) return res.status(409).json({ error: SHARED });
      const temp = await resetPassword(pool, t.user_id);
      await killSessions(pool, t.user_id);
      await audit(pool, { ...me(req), action: 'roster.reset-password', table: 'app_user', rowId: t.user_id });
      res.json({ loginId: t.login_id, temp });
    } catch (e) {
      next(e);
    }
  });

  // ── 엑셀 ─────────────────────────────────────────
  r.get('/template', async (req, res, next) => {
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('명단');
      ws.addRow(['이름', 'ID', '역할', '담임/전담']);
      ws.addRow(['홍길동', '홍길동', '교직원', '담임']);
      ws.addRow(['(예시 줄은 지우고 채우세요. 역할: 기관관리자·교직원·보기만 / 담임·전담·비교과는 비워도 됩니다. ID 를 비우면 이름이 ID 가 됩니다)']);
      ws.getRow(1).font = { bold: true };
      ws.columns.forEach((c, i) => (c.width = [14, 16, 14, 14][i]));
      res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('명단 양식.xlsx')}`);
      res.send(Buffer.from(await wb.xlsx.writeBuffer()));
    } catch (e) {
      next(e);
    }
  });

  // 올린 파일을 읽어 열 이름 + 줄만 돌려준다(저장 안 함). 열 맞추기는 화면이 하고 /import 로 보낸다.
  r.post('/import/preview', express.raw({ type: () => true, limit: '2mb' }), async (req, res, next) => {
    try {
      if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: '파일이 비어 있습니다' });
      const wb = new ExcelJS.Workbook();
      try {
        await wb.xlsx.load(req.body);
      } catch {
        return res.status(400).json({ error: '엑셀(.xlsx) 파일을 읽지 못했습니다' });
      }
      const ws = wb.worksheets[0];
      if (!ws) return res.status(400).json({ error: '시트가 없습니다' });
      const cell = (v) => {
        if (v == null) return '';
        if (typeof v === 'object') return String(v.text ?? v.result ?? (v.richText ? v.richText.map((x) => x.text).join('') : '')).trim();
        return String(v).trim();
      };
      const all = [];
      ws.eachRow({ includeEmpty: false }, (row) => {
        if (all.length > MAX_ROWS) return;
        const vals = [];
        for (let c = 1; c <= Math.min(MAX_COLS, ws.columnCount); c++) vals.push(cell(row.getCell(c).value));
        if (vals.some(Boolean)) all.push(vals);
      });
      if (all.length < 2) return res.status(400).json({ error: '머리 줄 아래에 사람 줄이 없습니다' });
      const headers = all[0];
      const guess = (names) => headers.findIndex((h) => names.some((n) => h.replace(/\s/g, '').includes(n)));
      res.json({
        headers,
        rows: all.slice(1, MAX_ROWS + 1),
        truncated: all.length > MAX_ROWS + 1,
        ...(limitWarnings(await loadConfig(pool, req.orgId), { rosterRows: all.length - 1 }).length ? { warnings: limitWarnings(await loadConfig(pool, req.orgId), { rosterRows: all.length - 1 }) } : {}),
        mapping: { name: guess(['이름', '성명']), loginId: guess(['ID', 'id', '아이디']), role: guess(['역할']), duty: guess(['담임', '전담']) },
      });
    } catch (e) {
      next(e);
    }
  });

  // 줄별로 만든다. 못 읽은 줄은 거부하지 않고 줄 번호와 이유를 돌려준다(나머지는 그대로 만든다).
  // 응답의 temp 는 한 번뿐 — 「ID·임시 비밀번호」 목록은 화면이 이 응답으로 내려받게 만든다.
  r.post('/import', async (req, res, next) => {
    try {
      const p = z.object({ rows: z.array(z.object({ name: z.string().max(200), loginId: z.string().max(200).optional(), role: z.string().max(50).optional(), duty: z.string().max(50).optional() })).max(MAX_ROWS) }).safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: '입력을 확인해 주세요' });
      const cfg = await loadConfig(pool, req.orgId);
      const warnings = limitWarnings(cfg, { rosterRows: p.data.rows.length });
      const results = [];
      for (const [i, raw] of p.data.rows.entries()) {
        const line = i + 1;
        const name = (raw.name || '').trim();
        const loginId = (raw.loginId || '').trim() || name;
        const role = (raw.role || '').trim() || '교직원';
        const dutyText = (raw.duty || '').trim();
        // 담임·전담/비교과는 옛 말 그대로 읽고, 그 밖의 글은 기관 목록에서 찾는다. 목록에 없어도 거부하지 않고 줄에 경고를 붙인다.
        const duty = dutyText === '' ? null : dutyText.includes('담임') ? '담임' : /전담|비교과/.test(dutyText) ? '전담·비교과' : cfg.duties.includes(dutyText) ? dutyText : dutyText.length <= 20 ? dutyText : undefined;
        const bad = !name ? '이름이 비었습니다' : !ID_RE.test(loginId) ? 'ID 에 쓸 수 없는 글자가 있습니다' : !ROLES.includes(role) ? `역할을 알 수 없습니다(${ROLES.join('·')})` : duty === undefined ? '담임/전담 칸을 알 수 없습니다' : null;
        if (bad) {
          results.push({ line, name, loginId, ok: false, error: bad });
          continue;
        }
        let a = await createAccount(pool, { orgId: req.orgId, name, loginId, role, duty });
        const dw = dutyWarnings(cfg, duty);
        results.push(a.error ? { line, name, loginId, ok: false, error: a.error } : { line, name, loginId, role, ok: true, temp: a.temp, ...(dw.length ? { warnings: dw } : {}) });
      }
      const made = results.filter((x) => x.ok).length;
      await audit(pool, { ...me(req), action: 'roster.import', table: 'membership', after: { made, failed: results.length - made } });
      res.json(withWarnings({ results, made, failed: results.length - made }, warnings));
    } catch (e) {
      next(e);
    }
  });

  return r;
}
