import express from 'express';
import { z } from 'zod';
import { requireOrgAction } from '../guard.js';
import { audit } from '../audit.js';

// 권장 규칙 17의 가중(기관 설정 JSON) · 교사 티어 · 소규모교 설정.
// 기본값은 web/src/gen/soft.js 의 DEFAULT_WEIGHTS 다 — 서버 이미지엔 web/src 가 없어 여기엔 「바꾼 것만」 저장한다(비면 기본값).
// 거부하는 건 형식뿐이다.
const bad = (res) => res.status(400).json({ error: '입력을 확인해 주세요' });
const notFound = (res) => res.status(404).json({ error: '없습니다' });
const w = z.number().min(0).max(100000);
const idP = z.coerce.number().int().positive();
const weights = z.object({
  bands: z.record(z.string().max(20), w).optional(),
  ruleBand: z.record(z.string().max(40), z.enum(['거의필수', '중요', '선호'])).optional(),
  tierMult: z.record(z.enum(['1', '2', '3']), w).optional(),
  avoidanceTierMult: z.record(z.enum(['1', '2', '3']), w).optional(),
  // 권장 규칙 재료(S-fix-3): 숫자 값 · 선택 규칙 켜기 · 교사 회피 칸 — 생성기 soft-adapter.js 가 읽는다
  params: z.object({
    maxConsec: z.number().int().min(1).max(12).optional(),
    dailySubjectCap: z.number().int().min(1).max(12).optional(),
    amTolerance: z.number().int().min(0).max(40).optional(),
    maxPerDay: z.number().int().min(1).max(12).optional(),
    teacherDayMode: z.enum(['분산', '몰기']).optional(),
    roundSubjects: z.array(idP).max(40).optional(),
  }).strict().optional(),
  options: z.object({ roomClassSplit: z.boolean().optional(), oneSubjectDay: z.boolean().optional() }).strict().optional(),
  avoid: z.record(z.string().regex(/^\d+$/), z.array(z.object({ weekday: z.number().int().min(1).max(7), period: z.number().int().min(1).max(12) })).max(60)).optional(),
}).strict();
// 소규모교: 담임이 메우는 교과 · 복식(합친) 학급 묶음
const small = z.object({
  enabled: z.boolean(),
  homeroom_subject_ids: z.array(idP).max(40).default([]),
  combined: z.array(z.object({ name: z.string().max(30), classroom_ids: z.array(idP).min(2).max(6) })).max(20).default([]),
  // 해석 뒤집기(S-fix-3): 담임 교과 빈 교사 칸을 담임으로 채울까 · 복식 묶음을 한 칸에 같이 놓을까('separate' 면 따로)
  homeroom_fill: z.boolean().default(true),
  combined_mode: z.enum(['same_slot', 'separate']).default('same_slot'),
}).strict();

export function softWeightsRouter(pool) {
  const r = express.Router({ mergeParams: true });
  const view = requireOrgAction('timetable.view');
  const manage = requireOrgAction('school.manage');
  const guard = (fn) => (req, res, next) => fn(req, res).catch(next);

  r.get('/soft-weights', view, guard(async (req, res) => {
    const { rows } = await pool.query(`SELECT soft_weights FROM org WHERE id = $1 AND deleted_at IS NULL`, [req.orgId]);
    const tiers = await pool.query(`SELECT id, tier FROM membership WHERE org_id = $1 AND deleted_at IS NULL AND tier IS NOT NULL`, [req.orgId]);
    res.json({ weights: rows[0]?.soft_weights ?? {}, tiers: tiers.rows.map((t) => ({ membership_id: Number(t.id), tier: t.tier })) });
  }));

  r.put('/soft-weights', manage, guard(async (req, res) => {
    const p = weights.safeParse(req.body?.weights);
    if (!p.success) return bad(res);
    await pool.query(`UPDATE org SET soft_weights = $2 WHERE id = $1`, [req.orgId, JSON.stringify(p.data)]);
    await audit(pool, { orgId: req.orgId, userId: req.session.userId, action: 'soft-weights.save', table: 'org', rowId: req.orgId, after: p.data });
    res.json({ weights: p.data });
  }));

  // 사람 티어(1 보직 · 2 일반 전담 · 3 지원인력 · null 은 미정)
  r.put('/soft-weights/tier', manage, guard(async (req, res) => {
    const p = z.object({ membership_id: idP, tier: z.union([z.literal(1), z.literal(2), z.literal(3), z.null()]) }).safeParse(req.body);
    if (!p.success) return bad(res);
    const { rowCount } = await pool.query(`UPDATE membership SET tier = $3 WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`, [p.data.membership_id, req.orgId, p.data.tier]);
    if (!rowCount) return notFound(res);
    res.json({ membership_id: p.data.membership_id, tier: p.data.tier });
  }));

  r.get('/small-school', view, guard(async (req, res) => {
    const { rows } = await pool.query(`SELECT small_school FROM org WHERE id = $1 AND deleted_at IS NULL`, [req.orgId]);
    const s = rows[0]?.small_school ?? {};
    res.json({ enabled: !!s.enabled, homeroom_subject_ids: s.homeroom_subject_ids ?? [], combined: s.combined ?? [], homeroom_fill: s.homeroom_fill !== false, combined_mode: s.combined_mode === 'separate' ? 'separate' : 'same_slot' });
  }));

  r.put('/small-school', manage, guard(async (req, res) => {
    const p = small.safeParse(req.body);
    if (!p.success) return bad(res);
    const subj = [...new Set(p.data.homeroom_subject_ids)];
    const cls = [...new Set(p.data.combined.flatMap((c) => c.classroom_ids))];
    const a = await pool.query(`SELECT id FROM subject WHERE org_id = $1 AND id = ANY($2) AND deleted_at IS NULL`, [req.orgId, subj]);
    const b = await pool.query(`SELECT id FROM classroom WHERE org_id = $1 AND id = ANY($2) AND deleted_at IS NULL`, [req.orgId, cls]);
    if (a.rows.length !== subj.length || b.rows.length !== cls.length) return notFound(res); // 남의 기관 것이 섞였다
    const out = { enabled: p.data.enabled, homeroom_subject_ids: subj, combined: p.data.combined, homeroom_fill: p.data.homeroom_fill, combined_mode: p.data.combined_mode };
    await pool.query(`UPDATE org SET small_school = $2 WHERE id = $1`, [req.orgId, JSON.stringify(out)]);
    await audit(pool, { orgId: req.orgId, userId: req.session.userId, action: 'small-school.save', table: 'org', rowId: req.orgId, after: out });
    res.json(out);
  }));
  return r;
}
