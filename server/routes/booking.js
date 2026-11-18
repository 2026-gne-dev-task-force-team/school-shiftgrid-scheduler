import express from 'express';
import { z } from 'zod';
import { requireOrgAction } from '../guard.js';
import { can } from '../permissions.js';
import { audit } from '../audit.js';
import { applyLevels, getRuleLevels } from '../rules.js';
import { appliedTimetable } from '../applied.js';

// 특별실 예약 · 고정 칸 잠금 · 빈 교실 찾기. 겹쳐도 거부하지 않고 저장한다 — 경고 목록만 수위대로 붙인다.
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const idz = z.coerce.number().int().positive();
const notFound = (res) => res.status(404).json({ error: '없습니다' });
const bad = (res) => res.status(400).json({ error: '입력을 확인해 주세요' });
const weekdayOf = (d) => ((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

export function bookingRouter(pool) {
  const r = express.Router({ mergeParams: true });
  const own = requireOrgAction('booking.own');
  const manage = requireOrgAction('booking.manage');
  const me = async (req) =>
    (await pool.query(`SELECT id FROM membership WHERE org_id = $1 AND user_id = $2 AND deleted_at IS NULL`, [req.orgId, req.session.userId])).rows[0];

  // 그 날 그 교시에 그 특별실이 쓰이는 근거를 전부 모은다 (시간표 수업 · 고정 잠금 · 다른 예약)
  async function usage(orgId, date, period, roomId = null) {
    const wd = weekdayOf(date);
    const q = (sql, p) => pool.query(sql, p).then((x) => x.rows);
    const rid = roomId ?? null;
    const tt = await appliedTimetable(pool, orgId, date); // 규칙 한 곳: server/applied.js
    const lessons = tt ? await q(
      `SELECT c.special_room_id AS room, cl.grade, cl.class_no FROM cell c JOIN classroom cl ON cl.id = c.classroom_id
       WHERE c.org_id = $1 AND c.timetable_id = $2 AND c.weekday = $3 AND c.period = $4 AND c.deleted_at IS NULL AND c.special_room_id IS NOT NULL AND ($5::bigint IS NULL OR c.special_room_id = $5)`, [orgId, tt.id, wd, period, rid]) : [];
    const locks = await q(`SELECT special_room_id AS room, note FROM room_lock WHERE org_id = $1 AND weekday = $2 AND period = $3 AND deleted_at IS NULL AND ($4::bigint IS NULL OR special_room_id = $4)`, [orgId, wd, period, rid]);
    const books = await q(
      `SELECT b.id, b.special_room_id AS room, b.membership_id, u.name FROM booking b JOIN membership m ON m.id = b.membership_id JOIN app_user u ON u.id = m.user_id
       WHERE b.org_id = $1 AND b.on_date = $2::date AND b.period = $3 AND b.deleted_at IS NULL AND ($4::bigint IS NULL OR b.special_room_id = $4)`, [orgId, date, period, rid]);
    return { lessons, locks, books };
  }

  async function warningsFor(orgId, b, levels) {
    const u = await usage(orgId, b.on_date, b.period, b.special_room_id);
    const found = [];
    for (const l of u.lessons) found.push({ rule: 'room_overlap', detail: `그 시각에 ${l.grade}-${l.class_no} 수업이 잡혀 있습니다` });
    for (const l of u.locks) found.push({ rule: 'room_overlap', detail: `관리자가 잠근 고정 칸입니다${l.note ? ` (${l.note})` : ''}` });
    for (const o of u.books.filter((x) => String(x.id) !== String(b.id))) found.push({ rule: 'room_overlap', detail: `${o.name} 님이 같은 시각에 예약했습니다` });
    if (b.classroom_id) {
      const cap = (await pool.query(
        `SELECT c.student_count, s.capacity FROM classroom c, special_room s WHERE c.id = $1 AND s.id = $2 AND c.org_id = $3 AND s.org_id = $3`, [b.classroom_id, b.special_room_id, orgId])).rows[0];
      if (cap && cap.student_count != null && cap.capacity != null && cap.student_count > cap.capacity) found.push({ rule: 'room_capacity', detail: `학생 ${cap.student_count}명 > 정원 ${cap.capacity}명` });
    }
    return applyLevels(levels, found);
  }

  const BSEL = `SELECT b.id, to_char(b.on_date,'YYYY-MM-DD') AS on_date, b.period, b.special_room_id, s.name AS room_name, b.membership_id, u.name AS who, b.classroom_id, c.grade, c.class_no
    FROM booking b JOIN special_room s ON s.id = b.special_room_id JOIN membership m ON m.id = b.membership_id JOIN app_user u ON u.id = m.user_id LEFT JOIN classroom c ON c.id = b.classroom_id`;

  r.get('/bookings', own, async (req, res, next) => {
    try {
      const q = z.object({ from: DATE.optional(), to: DATE.optional() }).safeParse(req.query);
      if (!q.success) return bad(res);
      const m = await me(req);
      const { rows } = await pool.query(
        `${BSEL} WHERE b.org_id = $1 AND b.deleted_at IS NULL AND ($2::date IS NULL OR b.on_date >= $2::date) AND ($3::date IS NULL OR b.on_date <= $3::date) ORDER BY b.on_date, b.period, b.id LIMIT 500`,
        [req.orgId, q.data.from ?? null, q.data.to ?? null]);
      const levels = await getRuleLevels(pool, req.orgId);
      const out = [];
      for (const b of rows) out.push({ ...b, mine: String(b.membership_id) === String(m?.id), warnings: await warningsFor(req.orgId, b, levels) });
      res.json({ me: m?.id ?? null, rows: out });
    } catch (e) { next(e); }
  });

  r.post('/bookings', own, async (req, res, next) => {
    try {
      const p = z.object({ special_room_id: idz, on_date: DATE, period: z.number().int().min(1).max(12), classroom_id: idz.nullable().optional() }).safeParse(req.body);
      if (!p.success) return bad(res);
      const d = p.data;
      const m = await me(req);
      if (!m) return notFound(res);
      if (!(await pool.query(`SELECT 1 FROM special_room WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`, [d.special_room_id, req.orgId])).rows[0]) return notFound(res);
      if (d.classroom_id && !(await pool.query(`SELECT 1 FROM classroom WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`, [d.classroom_id, req.orgId])).rows[0]) return notFound(res);
      const ins = await pool.query(
        `INSERT INTO booking (org_id, special_room_id, on_date, period, membership_id, classroom_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [req.orgId, d.special_room_id, d.on_date, d.period, m.id, d.classroom_id ?? null]);
      const levels = await getRuleLevels(pool, req.orgId);
      const warnings = await warningsFor(req.orgId, { id: ins.rows[0].id, ...d }, levels);
      await audit(pool, { orgId: req.orgId, userId: req.session.userId, action: 'booking.create', table: 'booking', rowId: ins.rows[0].id, after: d });
      res.status(201).json({ id: ins.rows[0].id, warnings });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: '이미 같은 것이 있습니다' });
      next(e);
    }
  });

  // 취소 — 내 것은 내가, 남의 것은 관리자가
  r.delete('/bookings/:bid', own, async (req, res, next) => {
    try {
      const bid = idz.safeParse(req.params.bid);
      if (!bid.success) return notFound(res);
      const b = (await pool.query(`SELECT id, membership_id FROM booking WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`, [bid.data, req.orgId])).rows[0];
      if (!b) return notFound(res);
      const m = await me(req);
      if (!can(req.session.role, 'booking.manage') && String(b.membership_id) !== String(m?.id)) return notFound(res);
      await pool.query(`UPDATE booking SET deleted_at = now() WHERE id = $1 AND org_id = $2`, [b.id, req.orgId]);
      await audit(pool, { orgId: req.orgId, userId: req.session.userId, action: 'booking.cancel', table: 'booking', rowId: b.id });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // 고정 칸 잠금
  r.get('/room-locks', own, async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT l.id, l.special_room_id, s.name AS room_name, l.weekday, l.period, l.note FROM room_lock l JOIN special_room s ON s.id = l.special_room_id
         WHERE l.org_id = $1 AND l.deleted_at IS NULL ORDER BY s.name, l.weekday, l.period`, [req.orgId]);
      res.json(rows);
    } catch (e) { next(e); }
  });
  r.post('/room-locks', manage, async (req, res, next) => {
    try {
      const p = z.object({ special_room_id: idz, weekday: z.number().int().min(1).max(7), period: z.number().int().min(1).max(12), note: z.string().trim().max(60).nullable().optional() }).safeParse(req.body);
      if (!p.success) return bad(res);
      const d = p.data;
      if (!(await pool.query(`SELECT 1 FROM special_room WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`, [d.special_room_id, req.orgId])).rows[0]) return notFound(res);
      const ins = await pool.query(`INSERT INTO room_lock (org_id, special_room_id, weekday, period, note) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [req.orgId, d.special_room_id, d.weekday, d.period, d.note ?? null]);
      await audit(pool, { orgId: req.orgId, userId: req.session.userId, action: 'room_lock.create', table: 'room_lock', rowId: ins.rows[0].id, after: d });
      res.status(201).json({ id: ins.rows[0].id });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: '이미 같은 것이 있습니다' });
      next(e);
    }
  });
  r.delete('/room-locks/:lid', manage, async (req, res, next) => {
    try {
      const lid = idz.safeParse(req.params.lid);
      if (!lid.success) return notFound(res);
      const up = await pool.query(`UPDATE room_lock SET deleted_at = now() WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`, [lid.data, req.orgId]);
      if (!up.rowCount) return notFound(res);
      await audit(pool, { orgId: req.orgId, userId: req.session.userId, action: 'room_lock.delete', table: 'room_lock', rowId: lid.data });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // 빈 교실 찾기 — 그 날 그 교시에 아무도 안 쓰는 특별실(쓰는 근거도 함께)
  r.get('/rooms/free', own, async (req, res, next) => {
    try {
      const q = z.object({ on_date: DATE, period: z.coerce.number().int().min(1).max(12) }).safeParse(req.query);
      if (!q.success) return bad(res);
      const rooms = (await pool.query(`SELECT id, name, purpose, capacity FROM special_room WHERE org_id = $1 AND deleted_at IS NULL ORDER BY id`, [req.orgId])).rows;
      const u = await usage(req.orgId, q.data.on_date, q.data.period);
      res.json(rooms.map((rm) => {
        const why = [
          ...u.lessons.filter((l) => String(l.room) === String(rm.id)).map((l) => `${l.grade}-${l.class_no} 수업`),
          ...u.locks.filter((l) => String(l.room) === String(rm.id)).map((l) => `고정 칸 잠금${l.note ? ` (${l.note})` : ''}`),
          ...u.books.filter((b) => String(b.room) === String(rm.id)).map((b) => `${b.name} 예약`),
        ];
        return { ...rm, free: !why.length, busy: why };
      }));
    } catch (e) { next(e); }
  });

  return r;
}
