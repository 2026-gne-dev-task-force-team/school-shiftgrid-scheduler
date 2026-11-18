// 생성기 ↔ 권장 17(soft.js) 이음 — 생성 재료(input)를 soft.js 의 state 꼴로 바꿔 점수를 낸다. 낮을수록 좋다.
// input 에서 읽는 것: classrooms · periods · tiers({membership_id: 1|2|3}) · weights(기관 저장값) · levels · small(소규모교) · lines
// 회피 칸·선택 규칙·숫자 값은 input.avoid/options/params 가 먼저, 없으면 기관 저장값(weights.avoid/options/params), 그것도 없으면 아래 기본.
import { combinedOf } from './overlap.js';
import { resolveWeights, softScore as softTotal, SOFT_RULES } from './soft.js';

// 숫자 값의 허용 범위 — 밖이면 soft.js 기본값으로 둔다
const NUM_PARAMS = { maxConsec: [1, 12], dailySubjectCap: [1, 12], amTolerance: [0, 40], maxPerDay: [1, 12] };
const DAY_MODES = ['분산', '몰기'];

// 회피 칸 {membership_id: [{weekday, period}]} — 형식이 틀린 칸은 버린다
export function resolveAvoid(src) {
  const out = {};
  if (!src || typeof src !== 'object') return out;
  for (const [t, list] of Object.entries(src)) {
    if (!Array.isArray(list)) continue;
    const ok = list.filter((a) => Number.isInteger(a?.weekday) && Number.isInteger(a?.period) && a.weekday >= 1 && a.weekday <= 7 && a.period >= 1 && a.period <= 12)
      .map((a) => ({ weekday: a.weekday, period: a.period }));
    if (ok.length) out[t] = ok;
  }
  return out;
}

// 숫자 값 · 진도 순환 교과. roundSubjects 를 따로 안 정했으면 「진도 맞춤」이 켜진 시수표 줄의 교과로 잡는다.
export function resolveParams(src, lines = []) {
  const s = src && typeof src === 'object' ? src : {};
  const out = {};
  for (const [k, [lo, hi]] of Object.entries(NUM_PARAMS)) if (Number.isFinite(s[k]) && s[k] >= lo && s[k] <= hi) out[k] = s[k];
  if (DAY_MODES.includes(s.teacherDayMode)) out.teacherDayMode = s.teacherDayMode;
  if (Array.isArray(s.earlyTiers)) out.earlyTiers = s.earlyTiers.filter((x) => [1, 2, 3].includes(x));
  out.roundSubjects = Array.isArray(s.roundSubjects)
    ? s.roundSubjects.filter((x) => x != null)
    : [...new Set((lines || []).filter((l) => l.sync_progress && l.subject_id != null).map((l) => l.subject_id))];
  return out;
}

// 기본 끔인 선택 규칙 둘(roomClassSplit · oneSubjectDay) — true 일 때만 켠다
export function resolveOptions(src) {
  const s = src && typeof src === 'object' ? src : {};
  return Object.fromEntries(Object.keys(SOFT_RULES).filter((k) => SOFT_RULES[k].optional).map((k) => [k, s[k] === true]));
}

export function makeSoftScore(input) {
  const weights = resolveWeights(input?.weights);
  const levels = Object.fromEntries(Object.entries(input?.levels || {}).filter(([k]) => SOFT_RULES[k]));
  const tiers = input?.tiers || {};
  const lunchAfter = {};
  for (const [g, v] of Object.entries(input?.periods?.grades || {})) if (v?.lunchAfter > 0) lunchAfter[g] = v.lunchAfter;
  const avoid = resolveAvoid(input?.avoid ?? input?.weights?.avoid);
  const options = resolveOptions(input?.options ?? input?.weights?.options);
  const params = resolveParams(input?.params ?? input?.weights?.params, input?.lines);
  // 복식 묶음: 같은 묶음 반들의 같은 교사·교과·요일·교시 칸은 한 수업 — 교사 기준 규칙에선 한 번만 센다(dup 표시)
  const groupOf = new Map();
  combinedOf(input?.small).forEach((g, i) => g.forEach((id) => groupOf.set(String(id), i)));
  return ({ cells }) => {
    const ids = new Set();
    const seen = new Set();
    const state = {
      classrooms: input.classrooms,
      lunchAfter,
      teachers: [],
      cells: cells.map((c) => {
        if (c.membership_id != null) ids.add(c.membership_id);
        let dup = false;
        const grp = groupOf.get(String(c.classroom_id));
        if (grp !== undefined && c.membership_id != null) {
          const k = `${grp}|${c.membership_id}|${c.subject_id}|${c.weekday}|${c.period}`;
          dup = seen.has(k);
          seen.add(k);
        }
        return { classroom_id: c.classroom_id, weekday: c.weekday, period: c.period, subject_id: c.subject_id, teacher_id: c.membership_id ?? null, room_id: c.special_room_id ?? null, ...(dup ? { dup: true } : {}) };
      }),
      avoid,
      options,
      params,
    };
    state.teachers = [...ids].map((id) => ({ id, tier: Number(tiers[id]) || 2 }));
    return softTotal(state, levels, weights).total;
  };
}
