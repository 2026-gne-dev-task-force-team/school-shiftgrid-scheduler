import express from 'express';
import { z } from 'zod';
import { requireOrgAction } from '../guard.js';

// 감사 로그 조회(audit.view). 기관 관리자는 자기 기관 것만, 시스템 관리자는 기관을 골라서.
// 최근순 · 커서(before = 마지막으로 받은 id) · 거르기(기간·사람·동작). 비밀 같은 키는 상세에서 뺀다.
const SECRET = /pass|hash|secret|token|temp|csrf|sid/i;
const clean = (v) => {
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => !SECRET.test(k)).map(([k, x]) => [k, clean(x)]));
  return v;
};
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const q = z.object({
  from: date.optional(),
  to: date.optional(),
  who: z.string().trim().max(50).optional(),
  action: z.string().trim().max(50).optional(),
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// 맡은 사람·올린 사람 같은 멤버십 번호는 이름으로 바꿔 내보낸다(날것 숫자 11673 대신 사람 이름). 이름 못 찾으면 「지운 계정」.
const ID_KEYS = { taken: 'taken', by_membership_id: 'by', for_membership_id: 'for' };
const isId = (v) => (typeof v === 'number' || (typeof v === 'string' && /^\d+$/.test(v)));
export function idsIn(...objs) {
  const ids = new Set();
  for (const o of objs) if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (k in ID_KEYS && isId(v)) ids.add(String(v));
  return ids;
}
export function nameIds(o, names) {
  if (!o || typeof o !== 'object') return o;
  return Object.fromEntries(Object.entries(o).map(([k, v]) => (k in ID_KEYS && isId(v) ? [ID_KEYS[k], names.get(String(v)) ?? '지운 계정'] : [k, v])));
}

export async function auditPage(pool, orgId, query) {
  const p = q.safeParse(query);
  if (!p.success) return { error: '조건을 확인해 주세요' };
  const d = p.data;
  // 값은 전부 자리표시자 — 안 쓴 거르기는 NULL 로 넘겨 꺼진다
  const { rows } = await pool.query(
    `SELECT a.id, a.at, a.action, a.table_name AS "table", a.row_id AS "rowId", a.before, a.after, u.name AS "who", u.login_id AS "loginId"
       FROM audit_log a LEFT JOIN app_user u ON u.id = a.user_id
      WHERE a.org_id = $1 AND a.deleted_at IS NULL
        AND ($2::date IS NULL OR a.at >= $2::date)
        AND ($3::date IS NULL OR a.at < $3::date + 1)
        AND ($4::text IS NULL OR position(lower($4) in lower(u.name)) > 0)
        AND ($5::text IS NULL OR starts_with(a.action, $5))
        AND ($6::bigint IS NULL OR a.id < $6)
      ORDER BY a.id DESC LIMIT $7`,
    [orgId, d.from ?? null, d.to ?? null, d.who || null, d.action || null, d.before ?? null, d.limit + 1],
  );
  const more = rows.length > d.limit;
  const page = rows.slice(0, d.limit);
  const want = new Set();
  for (const r of page) for (const i of idsIn(r.before, r.after)) want.add(i);
  const names = new Map();
  if (want.size) {
    const m = await pool.query(`SELECT m.id, u.name FROM membership m JOIN app_user u ON u.id = m.user_id WHERE m.org_id = $1 AND m.id = ANY($2::bigint[])`, [orgId, [...want]]);
    for (const x of m.rows) names.set(String(x.id), x.name);
  }
  const items = page.map((r) => ({ ...r, before: nameIds(clean(r.before), names), after: nameIds(clean(r.after), names) }));
  return { items, more, next: more ? items[items.length - 1].id : null };
}

export function auditRouter(pool) {
  const r = express.Router({ mergeParams: true });
  r.get('/audit', requireOrgAction('audit.view'), async (req, res, next) => {
    try {
      const out = await auditPage(pool, req.orgId, req.query);
      res.status(out.error ? 400 : 200).json(out);
    } catch (e) { next(e); }
  });
  return r;
}
