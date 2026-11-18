// 보결 후보 등급 — 순수 함수(DB 없이 시험). 거부하지 않고 등급 또는 제외 사유를 붙여 목록으로 낸다.
// 등급 A 자기 반이 전담 수업 중인 담임 · B 하교한 뒤인 담임 · C 그 시간 수업 없는 전담 · D 비교과(시간표에 수업이 하나도 없는 전담·비교과)
// 기관 설정(ctx.config.substitute): order = 등급 순서 · assistants/lunchDuty = 'exclude'(후보에서 뺀다) | 'warn'(후보에 남기고 warn 사유를 달아 순위 맨 뒤로, 기본)
// 제외 사유 5: 보조인력 · 교실묶임(보조 인력만 들어가는 교시의 담임) · 급식지도 · 본인결강 · 고정일정   (+ 수업중: 후보 아님, 참고 표시)
export const REASONS = {
  assistant: '보조 인력은 담임·전담 구분이 없어 보결 후보에서 빠지는 분입니다',
  held: '보조 인력 수업이라 교실에 매여 있음',
  lunch: '급식지도 시간',
  absent: '이 시간에 본인 보결을 올림(결강)',
  fixed: '고정일정(회의·출장 등) 금지 칸',
  teaching: '그 시간에 수업 중',
};
// 후보로 남기되 경고만 다는 사유(warn 모드)
const WARN_CODES = { assistant: REASONS.assistant, lunch: REASONS.lunch };
const DEFAULT_SUB = { order: ['A', 'B', 'C', 'D'], assistants: 'warn', lunchDuty: 'warn' };

// ctx: { weekday, period, periodConfig, cells:[{classroom_id,weekday,period,subject_id,membership_id}],
//   members:[{id,name,duty,homeroom:{id,grade}|null}], dutyById, absentIds:Set(그 날 그 교시 결강·종일 결강),
//   pins:[{target_id,weekday,period}] (교사 금지), takenIds:Set(같은 날 같은 교시 이미 맡음), exclude:Set(결강자) }
export function rankCandidates(ctx) {
  const { weekday, period, periodConfig, cells, members, absentIds, pins, takenIds } = ctx;
  const at = (cid) => cells.find((c) => c.classroom_id === cid && c.weekday === weekday && c.period === period);
  const teaching = new Set(cells.filter((c) => c.weekday === weekday && c.period === period && c.membership_id).map((c) => c.membership_id));
  const dutyById = new Map(members.map((m) => [m.id, m.duty]));
  const hasAnyCell = new Set(cells.filter((c) => c.membership_id).map((c) => c.membership_id));
  const candidates = [];
  const excluded = [];
  const sub = { ...DEFAULT_SUB, ...(ctx.config?.substitute ?? {}) };
  const out = (m, code) => excluded.push({ membership_id: m.id, name: m.name, code, reason: REASONS[code] });
  // 경고 모드면 후보에 남긴다(등급은 아래에서 판정한 값, 없으면 'D'). 제외 모드면 예전처럼 목록에서 뺀다.
  const warnOrOut = (m, code, setting, taken) => {
    if (setting === 'exclude') { out(m, code); return; }
    candidates.push({ membership_id: m.id, name: m.name, grade: 'D', taken, warn: { code, detail: WARN_CODES[code] } });
  };
  const isSpecialist = (d) => !!d && d !== '담임'; // 전담·비교과(및 기관이 더한 담당 구분)
  for (const m of members) {
    if (ctx.exclude?.has(m.id)) continue;
    const taken = takenIds.has(m.id);
    if (!m.duty) { warnOrOut(m, 'assistant', sub.assistants, taken); continue; }
    if (absentIds.has(m.id)) { out(m, 'absent'); continue; }
    if (pins.some((p) => p.target_id === m.id && p.weekday === weekday && p.period === period)) { out(m, 'fixed'); continue; }
    const g = m.homeroom ? periodConfig?.grades?.[String(m.homeroom.grade)] : null;
    if (g && g.lunch && g.lunchAfter && g.lunchAfter === period && sub.lunchDuty === 'exclude') { out(m, 'lunch'); continue; }
    const lunchWarn = g && g.lunch && g.lunchAfter && g.lunchAfter === period ? { code: 'lunch', detail: REASONS.lunch } : null;
    const add = (grade) => candidates.push({ membership_id: m.id, name: m.name, grade, taken, ...(lunchWarn ? { warn: lunchWarn } : {}) });
    if (m.duty === '담임' && m.homeroom) {
      const cell = at(m.homeroom.id);
      if (g && g.periods && period > g.periods) { add('B'); continue; }
      const who = cell?.membership_id;
      if (cell && who && who !== m.id && isSpecialist(dutyById.get(who))) { add('A'); continue; }
      if (cell && (!who || !dutyById.get(who))) { out(m, 'held'); continue; }
      out(m, 'teaching'); continue;
    }
    if (m.duty === '담임') { out(m, 'teaching'); continue; } // 반이 없는 담임: 판단 재료가 없어 후보 아님
    if (teaching.has(m.id)) { out(m, 'teaching'); continue; }
    add(hasAnyCell.has(m.id) ? 'C' : 'D');
  }
  // 등급 순서는 기관 설정. 목록에 없는 등급은 맨 뒤. 경고가 달린 후보는 같은 등급 안에서 뒤로 보낸다.
  const rank = Object.fromEntries(['A', 'B', 'C', 'D'].map((g) => [g, sub.order.includes(g) ? sub.order.indexOf(g) : 99]));
  candidates.sort((a, b) => !!a.warn - !!b.warn || rank[a.grade] - rank[b.grade] || a.name.localeCompare(b.name, 'ko'));
  return { candidates, excluded };
}

// 형평성: 한 번도 안 간 사람도 0 으로 넣는다. 적게 간 순.
export function fairness(members, takes) {
  const by = new Map(members.map((m) => [`m${m.id}`, { key: `m${m.id}`, membership_id: m.id, name: m.name, count: 0, last: null, outside: false }]));
  for (const t of takes) {
    const key = t.membership_id ? `m${t.membership_id}` : `o${t.outside_name}`;
    if (!by.has(key)) by.set(key, { key, membership_id: null, name: t.outside_name, count: 0, last: null, outside: true });
    const e = by.get(key);
    e.count += 1;
    if (!e.last || t.on_date > e.last) e.last = t.on_date;
  }
  return [...by.values()].sort((a, b) => a.count - b.count || a.name.localeCompare(b.name, 'ko'));
}
