import express from 'express';
import { z } from 'zod';
import { requireSystemAction } from '../guard.js';
import { createAccount, resetPassword, ID_RE } from '../accounts.js';
import { audit, killSessions, killOrgSessions } from '../audit.js';

// 시스템 관리자(교육청) — 기관 관리 넷뿐: 기관 등록 · 기관 상태 · 첫 관리자 만들기 · 관리자 비밀번호 초기화.
// 기관 안 데이터(시간표·보결·근태·명단)는 못 본다. 명단·시간표 경로는 하나도 없고,
// 관리자 목록도 「이름·ID·상태」만 낸다(이 기관 관리자 비밀번호 초기화를 고르는 데 필요한 만큼).
const idParam = z.coerce.number().int().positive();
const orgBody = z.object({
  name: z.string().trim().min(1).max(100),
  ilgoaName: z.string().trim().max(100).optional().nullable(),
  orgCode: z.string().trim().max(50).optional().nullable(),
  kind: z.enum(['초', '중']),
});
const firstAdminBody = z.object({ name: z.string().trim().min(1).max(50), loginId: z.string().trim().regex(ID_RE) });

const concurrentBody = z.object({ loginId: z.string().trim().regex(ID_RE), role: z.enum(['기관관리자', '교직원', '보기만']) });

export function adminRouter(pool) {
  const r = express.Router();
  r.use(requireSystemAction('org.manage'));
  const who = (req) => ({ userId: req.session.userId, orgId: req.session.orgId });
  const nf = (res) => res.status(404).json({ error: '없습니다' });

  r.get('/orgs', async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT o.id, o.name, o.ilgoa_name AS "ilgoaName", o.org_code AS "orgCode", o.kind, o.status,
                (SELECT count(*) FROM membership m WHERE m.org_id = o.id AND m.role = '기관관리자' AND m.deleted_at IS NULL)::int AS admins,
                (SELECT count(*) FROM membership m WHERE m.org_id = o.id AND m.deleted_at IS NULL)::int AS users,
                (SELECT max(u.last_login_at) FROM membership m JOIN app_user u ON u.id = m.user_id WHERE m.org_id = o.id AND m.deleted_at IS NULL) AS "lastActive"
           FROM org o WHERE o.deleted_at IS NULL ORDER BY (o.kind = '교육청') DESC, o.id`,
      );
      res.json(rows);
    } catch (e) {
      next(e);
    }
  });

  // 기관 등록
  r.post('/orgs', async (req, res, next) => {
    try {
      const p = orgBody.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: '입력을 확인해 주세요' });
      const d = p.data;
      const dup = await pool.query(`SELECT 1 FROM org WHERE name = $1 AND deleted_at IS NULL`, [d.name]);
      if (dup.rows[0]) return res.status(409).json({ error: '같은 이름의 기관이 이미 있습니다' });
      const { rows } = await pool.query(`INSERT INTO org (name, ilgoa_name, org_code, kind) VALUES ($1,$2,$3,$4) RETURNING id, name, kind, status`, [d.name, d.ilgoaName || null, d.orgCode || null, d.kind]);
      await audit(pool, { ...who(req), action: 'org.create', table: 'org', rowId: rows[0].id, after: rows[0] });
      res.status(201).json(rows[0]);
    } catch (e) {
      next(e);
    }
  });

  // 기관 상태(사용/중지) · 이름·표기·코드 고치기. 교육청 자기 자신은 못 멈춘다.
  r.patch('/orgs/:id', async (req, res, next) => {
    try {
      const id = idParam.safeParse(req.params.id);
      const p = orgBody.partial().extend({ status: z.enum(['사용', '중지']).optional() }).safeParse(req.body);
      if (!id.success || !p.success) return res.status(400).json({ error: '입력을 확인해 주세요' });
      const org = (await pool.query(`SELECT id, kind, status FROM org WHERE id = $1 AND deleted_at IS NULL`, [id.data])).rows[0];
      if (!org) return nf(res);
      const d = p.data;
      if (org.kind === '교육청' && (d.status === '중지' || d.kind)) return res.status(400).json({ error: '교육청 자신은 멈추거나 종류를 바꿀 수 없습니다' });
      if (d.name) {
        const dup = await pool.query(`SELECT 1 FROM org WHERE name = $1 AND id <> $2 AND deleted_at IS NULL`, [d.name, id.data]);
        if (dup.rows[0]) return res.status(409).json({ error: '같은 이름의 기관이 이미 있습니다' });
      }
      await pool.query(
        `UPDATE org SET name = COALESCE($2, name), ilgoa_name = CASE WHEN $3::boolean THEN $4 ELSE ilgoa_name END,
                org_code = CASE WHEN $5::boolean THEN $6 ELSE org_code END, kind = COALESCE($7, kind), status = COALESCE($8, status)
          WHERE id = $1`,
        [id.data, d.name ?? null, 'ilgoaName' in d, d.ilgoaName || null, 'orgCode' in d, d.orgCode || null, d.kind ?? null, d.status ?? null],
      );
      if (d.status === '중지') await killOrgSessions(pool, id.data);
      await audit(pool, { ...who(req), action: 'org.update', table: 'org', rowId: id.data, before: { status: org.status }, after: d });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  // 기관 관리자 목록(이름·ID·상태만) — 비밀번호 초기화 대상을 고르는 용도
  r.get('/orgs/:id/admins', async (req, res, next) => {
    try {
      const id = idParam.safeParse(req.params.id);
      if (!id.success) return nf(res);
      const { rows } = await pool.query(
        `SELECT u.id AS "userId", u.name, u.login_id AS "loginId", u.status, u.must_change_password AS "mustChange"
           FROM membership m JOIN app_user u ON u.id = m.user_id AND u.deleted_at IS NULL
          WHERE m.org_id = $1 AND m.role = '기관관리자' AND m.deleted_at IS NULL ORDER BY u.id`,
        [id.data],
      );
      res.json(rows);
    } catch (e) {
      next(e);
    }
  });

  // 첫 관리자 만들기(이미 있는 ID 면 그 사람에게 소속만 더한다 — 겸임)
  r.post('/orgs/:id/first-admin', async (req, res, next) => {
    try {
      const id = idParam.safeParse(req.params.id);
      const p = firstAdminBody.safeParse(req.body);
      if (!id.success || !p.success) return res.status(400).json({ error: '입력을 확인해 주세요(ID 에는 공백·따옴표·슬래시를 쓸 수 없습니다)' });
      const org = (await pool.query(`SELECT id, kind FROM org WHERE id = $1 AND deleted_at IS NULL`, [id.data])).rows[0];
      if (!org || org.kind === '교육청') return nf(res);
      const a = await createAccount(pool, { orgId: id.data, name: p.data.name, loginId: p.data.loginId, role: '기관관리자', existing: 'add' });
      if (a.error) return res.status(409).json({ error: a.error });
      await audit(pool, { ...who(req), action: 'org.first-admin', table: 'membership', rowId: a.membershipId, after: { orgId: id.data, loginId: p.data.loginId } });
      res.status(201).json({ userId: a.userId, loginId: p.data.loginId, temp: a.temp, existing: a.temp === null });
    } catch (e) {
      next(e);
    }
  });

  // 겸임 소속 추가 — 이미 있는 계정(로그인 ID)에 이 기관 소속을 더한다. 역할을 고른다.
  // 계정 ID·기관·역할만 다룬다(이름·비밀번호는 안 낸다 — 기존 계정은 비밀번호 그대로).
  r.post('/orgs/:id/members', async (req, res, next) => {
    try {
      const id = idParam.safeParse(req.params.id);
      const p = concurrentBody.safeParse(req.body);
      if (!id.success || !p.success) return res.status(400).json({ error: '입력을 확인해 주세요' });
      const org = (await pool.query(`SELECT id, kind FROM org WHERE id = $1 AND deleted_at IS NULL`, [id.data])).rows[0];
      if (!org || org.kind === '교육청') return nf(res);
      const u = (await pool.query(`SELECT id, login_id FROM app_user WHERE lower(login_id) = lower($1) AND deleted_at IS NULL`, [p.data.loginId])).rows[0];
      if (!u) return res.status(404).json({ error: '그 ID 의 계정이 없습니다' });
      const a = await createAccount(pool, { orgId: id.data, name: '', loginId: u.login_id, role: p.data.role, existing: 'add' });
      if (a.error) return res.status(409).json({ error: a.error });
      await audit(pool, { ...who(req), action: 'org.concurrent-add', table: 'membership', rowId: a.membershipId, after: { orgId: id.data, loginId: u.login_id, role: p.data.role } });
      res.status(201).json({ userId: a.userId, loginId: u.login_id, role: p.data.role });
    } catch (e) {
      next(e);
    }
  });

  // 비밀번호 초기화(비상문, 겸임 계정 포함) — 임시 비밀번호가 한 번 보인다
  r.post('/orgs/:id/reset-password', async (req, res, next) => {
    try {
      const id = idParam.safeParse(req.params.id);
      const uid = idParam.safeParse(req.body?.userId);
      if (!id.success || !uid.success) return res.status(400).json({ error: '입력을 확인해 주세요' });
      // 겸임 계정도 푼다(시스템 관리자 비상문). 시스템 관리자 계정 자체는 제외 — 감사 기록에 겸임 여부를 남긴다.
      const m = (await pool.query(`SELECT 1 FROM membership WHERE org_id = $1 AND user_id = $2 AND role <> '시스템관리자' AND deleted_at IS NULL`, [id.data, uid.data])).rows[0];
      if (!m) return nf(res);
      if ((await pool.query(`SELECT 1 FROM membership WHERE user_id = $1 AND role = '시스템관리자' AND deleted_at IS NULL LIMIT 1`, [uid.data])).rows[0]) return nf(res);
      const shared = !!(await pool.query(`SELECT 1 FROM membership WHERE user_id = $1 AND org_id <> $2 AND deleted_at IS NULL LIMIT 1`, [uid.data, id.data])).rows[0];
      const temp = await resetPassword(pool, uid.data);
      await killSessions(pool, uid.data);
      await audit(pool, { ...who(req), action: 'admin.reset-password', table: 'app_user', rowId: uid.data, after: { orgId: id.data, shared } });
      res.json({ temp });
    } catch (e) {
      next(e);
    }
  });
  return r;
}
