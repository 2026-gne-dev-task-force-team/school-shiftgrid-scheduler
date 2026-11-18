// 보결 후보 등급 — 순수 함수(DB 없이 시험). 거부하지 않고 등급 또는 제외 사유를 붙여 목록으로 낸다.
// 등급 A 자기 반이 전담 수업 중인 담임 · B 하교한 뒤인 담임 · C 그 시간 수업 없는 전담 · D 비교과(시간표에 수업이 하나도 없는 전담·비교과)
// 제외 사유 5: 보조인력 · 교실묶임(보조 인력만 들어가는 교시의 담임) · 급식지도 · 본인결강 · 고정일정   (+ 수업중: 후보 아님, 참고 표시)
export const REASONS = {
  assistant: '보조 인력은 담임·전담 구분이 없어 보결 후보에서 빠지는 분입니다',
  held: '보조 인력 수업이라 교실에 매여 있음',
  lunch: '급식지도 시간',
  absent: '이 시간에 본인 보결을 올림(결강)',
  fixed: '고정일정(회의·출장 등) 금지 칸',
  teaching: '그 시간에 수업 중',
};

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
  const out = (m, code) => excluded.push({ membership_id: m.id, name: m.name, code, reason: REASONS[code] });
  for (const m of members) {
    if (ctx.exclude?.has(m.id)) continue;
    const taken = takenIds.has(m.id);
    if (!m.duty) { out(m, 'assistant'); continue; }
    if (absentIds.has(m.id)) { out(m, 'absent'); continue; }
    if (pins.some((p) => p.target_id === m.id && p.weekday === weekday && p.period === period)) { out(m, 'fixed'); continue; }
    const g = m.homeroom ? periodConfig?.grades?.[String(m.homeroom.grade)] : null;
    if (g && g.lunch && g.lunchAfter && g.lunchAfter === period) { out(m, 'lunch'); continue; }
    if (m.duty === '담임' && m.homeroom) {
      const cell = at(m.homeroom.id);
      if (g && g.periods && period > g.periods) { candidates.push({ membership_id: m.id, name: m.name, grade: 'B', taken }); continue; }
      const who = cell?.membership_id;
      if (cell && who && who !== m.id && dutyById.get(who) === '전담·비교과') { candidates.push({ membership_id: m.id, name: m.name, grade: 'A', taken }); continue; }
      if (cell && (!who || !dutyById.get(who))) { out(m, 'held'); continue; }
      out(m, 'teaching'); continue;
    }
    if (m.duty === '담임') { out(m, 'teaching'); continue; } // 반이 없는 담임: 판단 재료가 없어 후보 아님
    if (teaching.has(m.id)) { out(m, 'teaching'); continue; }
    candidates.push({ membership_id: m.id, name: m.name, grade: hasAnyCell.has(m.id) ? 'C' : 'D', taken });
  }
  const rank = { A: 0, B: 1, C: 2, D: 3 };
  candidates.sort((a, b) => rank[a.grade] - rank[b.grade] || a.name.localeCompare(b.name, 'ko'));
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
