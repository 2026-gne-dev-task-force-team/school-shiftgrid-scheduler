import crypto from 'node:crypto';
import express from 'express';
import argon2 from 'argon2';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { requireLogin } from '../guard.js';
import { passwordProblem } from '../passwords.js';
import { audit, killSessions } from '../audit.js';
import { ARGON } from '../accounts.js';

const MAX_FAILS = 10;
const LOCK_MINUTES = 15;
const SAME_FAIL = 'ID 또는 비밀번호가 맞지 않습니다'; // ID 없음 / 비밀번호 틀림을 같은 말로

const loginBody = z.object({
  orgId: z.coerce.number().int().positive().optional(), // 없으면 아이디·비번 먼저 — 소속이 여럿이면 로그인 뒤 고른다
  loginId: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
  remember: z.boolean().optional(),
});

let dummyHashPromise;
const dummyHash = () => (dummyHashPromise ??= argon2.hash(crypto.randomBytes(8).toString('hex'), ARGON));

export function authRouter(pool, opts = {}) {
  const r = express.Router();
  // 로그인 성공 때 세션 ID 새로 발급하고 사람·기관을 박는다
  const startSession = async (req, who, orgId, role) => {
    await new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));
    req.session.csrf = crypto.randomBytes(24).toString('hex');
    req.session.userId = who.id;
    req.session.name = who.name;
    req.session.orgId = orgId;
    req.session.role = role;
    req.session.mustChange = who.mustChange;
    req.session.cookie.maxAge = who.remember ? 30 * 24 * 3600 * 1000 : null; // 아니면 브라우저 닫으면 끝
    await new Promise((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));
  };
  const sessionBody = (req) => ({ user: { id: req.session.userId, name: req.session.name, orgId: req.session.orgId, role: req.session.role, mustChange: req.session.mustChange }, csrf: req.session.csrf });
  // 실패한 로그인만 센다 — 공유기 IP 하나인 학교에서 성공 로그인이 한도를 먹지 않게
  const loginLimit = rateLimit({ windowMs: 15 * 60_000, limit: opts.loginLimit ?? 30, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true });

  // 로그인 화면의 기관 고르기 목록 — 이름만(사용 중인 기관)
  r.get('/orgs', async (req, res, next) => {
    try {
      const { rows } = await pool.query(`SELECT id, name FROM org WHERE status = '사용' AND deleted_at IS NULL ORDER BY (kind = '교육청'), name`);
      res.json(rows);
    } catch (e) {
      next(e);
    }
  });

  // 지금 세션(+CSRF 토큰) — 화면이 처음 열릴 때
  r.get('/session', async (req, res, next) => {
    try {
      if (!req.session.userId) return res.json({ user: null, csrf: req.session.csrf });
      res.json({
        user: { id: req.session.userId, name: req.session.name, orgId: req.session.orgId, role: req.session.role, mustChange: !!req.session.mustChange },
        csrf: req.session.csrf,
      });
    } catch (e) {
      next(e);
    }
  });

  r.post('/login', loginLimit, async (req, res, next) => {
    try {
      const p = loginBody.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: '입력을 확인해 주세요' });
      const { orgId, loginId, password, remember } = p.data;

      const { rows } = await pool.query(
        `SELECT u.id, u.name, u.password_hash, u.must_change_password, u.status, u.failed_count, u.locked_until,
                m.role, m.org_id, o.name AS org_name, o.status AS org_status
           FROM app_user u
           JOIN membership m ON m.user_id = u.id AND ($1::bigint IS NULL OR m.org_id = $1) AND m.deleted_at IS NULL AND m.status = '사용'
           JOIN org o ON o.id = m.org_id AND o.deleted_at IS NULL
          WHERE lower(u.login_id) = lower($2) AND u.deleted_at IS NULL ORDER BY (o.kind = '교육청'), o.name`,
        [orgId ?? null, loginId],
      );
      const u = rows[0];
      const cands = rows.filter((x) => x.org_status === '사용');
      if (!u) {
        await argon2.verify(await dummyHash(), password).catch(() => {});
        return res.status(401).json({ error: SAME_FAIL });
      }
      const locked = u.status === '잠김' || (u.locked_until && new Date(u.locked_until) > new Date());
      const ok = await argon2.verify(u.password_hash, password).catch(() => false);
      if (locked || (orgId ? u.org_status !== '사용' : !cands.length)) return res.status(401).json({ error: SAME_FAIL });
      if (!ok) {
        await pool.query(
          `UPDATE app_user SET failed_count = failed_count + 1,
                  locked_until = CASE WHEN failed_count + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END
            WHERE id = $1`,
          [u.id, MAX_FAILS, LOCK_MINUTES],
        );
        return res.status(401).json({ error: SAME_FAIL });
      }
      await pool.query(`UPDATE app_user SET failed_count = 0, locked_until = NULL, last_login_at = now() WHERE id = $1`, [u.id]);

      const who = { id: Number(u.id), name: u.name, mustChange: u.must_change_password, remember };
      if (!orgId && cands.length > 1) {
        // 소속이 여럿 — 비밀번호는 맞았다. 세션엔 「고르는 중」만 두고 pick-org 로 마친다(userId 는 아직 안 박는다)
        await new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));
        req.session.csrf = crypto.randomBytes(24).toString('hex');
        req.session.pending = { ...who, orgs: cands.map((x) => ({ orgId: Number(x.org_id), name: x.org_name, role: x.role })) };
        await new Promise((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));
        return res.json({ choose: req.session.pending.orgs, csrf: req.session.csrf });
      }
      await startSession(req, who, orgId ? Number(orgId) : Number(cands[0].org_id), orgId ? u.role : cands[0].role);
      res.json(sessionBody(req));
    } catch (e) {
      next(e);
    }
  });

  // 로그인 뒤 소속 고르기 — 비밀번호가 맞은 세션(pending)만, 그 목록 안의 기관만
  r.post('/pick-org', async (req, res, next) => {
    try {
      const pend = req.session.pending;
      const p = z.object({ orgId: z.coerce.number().int().positive() }).safeParse(req.body);
      if (!pend || !p.success) return res.status(400).json({ error: '입력을 확인해 주세요' });
      const o = pend.orgs.find((x) => x.orgId === p.data.orgId);
      if (!o) return res.status(404).json({ error: '없습니다' });
      await startSession(req, pend, o.orgId, o.role);
      res.json(sessionBody(req));
    } catch (e) {
      next(e);
    }
  });

  // 내 소속 목록 — 겸임이면 둘 이상. 시스템 관리자 소속(교육청)도 내 소속이면 보인다.
  r.get('/memberships', requireLogin, async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT o.id AS "orgId", o.name, m.role FROM membership m JOIN org o ON o.id = m.org_id AND o.deleted_at IS NULL AND o.status = '사용'
          WHERE m.user_id = $1 AND m.deleted_at IS NULL AND m.status = '사용' ORDER BY (o.kind = '교육청'), o.name`,
        [req.session.userId],
      );
      res.json({ current: req.session.orgId, items: rows.map((x) => ({ ...x, orgId: Number(x.orgId) })) });
    } catch (e) {
      next(e);
    }
  });

  // 현재 기관 바꾸기 — 내 소속인 기관만(아니면 404, 남의 기관 존재를 안 알림). 세션 ID 는 로그인처럼 새로 발급.
  r.post('/switch-org', requireLogin, async (req, res, next) => {
    try {
      const p = z.object({ orgId: z.coerce.number().int().positive() }).safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: '입력을 확인해 주세요' });
      const { rows } = await pool.query(
        `SELECT m.role FROM membership m JOIN org o ON o.id = m.org_id AND o.deleted_at IS NULL AND o.status = '사용'
          WHERE m.user_id = $1 AND m.org_id = $2 AND m.deleted_at IS NULL AND m.status = '사용'`,
        [req.session.userId, p.data.orgId],
      );
      if (!rows[0]) return res.status(404).json({ error: '없습니다' });
      const keep = { userId: req.session.userId, name: req.session.name, mustChange: req.session.mustChange, maxAge: req.session.cookie.maxAge };
      await new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));
      req.session.csrf = crypto.randomBytes(24).toString('hex');
      req.session.userId = keep.userId;
      req.session.name = keep.name;
      req.session.orgId = p.data.orgId;
      req.session.role = rows[0].role;
      req.session.mustChange = keep.mustChange;
      req.session.cookie.maxAge = keep.maxAge;
      await new Promise((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));
      await audit(pool, { orgId: req.session.orgId, userId: req.session.userId, action: 'org.switch', table: 'membership', rowId: req.session.userId });
      res.json({ user: { id: req.session.userId, name: req.session.name, orgId: req.session.orgId, role: req.session.role, mustChange: !!req.session.mustChange }, csrf: req.session.csrf });
    } catch (e) {
      next(e);
    }
  });

  r.post('/logout', (req, res, next) => {
    req.session.destroy((e) => (e ? next(e) : res.clearCookie('sid').json({ ok: true })));
  });

  // 비밀번호 바꾸기 — 첫 로그인 강제 변경도 이 길. 성공하면 내 다른 세션은 전부 끊는다.
  const pwLimit = rateLimit({ skipSuccessfulRequests: true, windowMs: 15 * 60_000, limit: opts.loginLimit ?? 30, standardHeaders: true, legacyHeaders: false });
  r.post('/password', pwLimit, requireLogin, async (req, res, next) => {
    try {
      const p = z.object({ current: z.string().min(1).max(200), next: z.string().max(200) }).safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: '입력을 확인해 주세요' });
      const { rows } = await pool.query(`SELECT login_id, password_hash FROM app_user WHERE id = $1 AND deleted_at IS NULL AND status = '사용'`, [req.session.userId]);
      const u = rows[0];
      if (!u || !(await argon2.verify(u.password_hash, p.data.current).catch(() => false))) {
        return res.status(400).json({ error: '현재 비밀번호가 맞지 않습니다' });
      }
      if (p.data.next === p.data.current) return res.status(400).json({ error: '현재와 다른 비밀번호로 정해 주세요' });
      const problem = passwordProblem(p.data.next, u.login_id);
      if (problem) return res.status(400).json({ error: problem });
      await pool.query(`UPDATE app_user SET password_hash = $2, must_change_password = FALSE, failed_count = 0, locked_until = NULL WHERE id = $1`, [req.session.userId, await argon2.hash(p.data.next, ARGON)]);
      await killSessions(pool, req.session.userId, req.sessionID);
      req.session.mustChange = false;
      await audit(pool, { orgId: req.session.orgId, userId: req.session.userId, action: 'password.change', table: 'app_user', rowId: req.session.userId });
      res.json({ ok: true, user: { id: req.session.userId, name: req.session.name, orgId: req.session.orgId, role: req.session.role, mustChange: false } });
    } catch (e) {
      next(e);
    }
  });

  // 로그인된 다른 기기 끊기
  r.post('/logout-others', requireLogin, async (req, res, next) => {
    try {
      await killSessions(pool, req.session.userId, req.sessionID);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
