// 규칙 수위 — 한 곳. 앱은 업무 규칙을 거부하지 않고 세 수위로만 말한다. 이후 판(S-1c 격자·S-2 자동 생성·S-3·S-4)이 여기서 읽는다.
//   알림: 저장됨 · 노랑 목록  /  경고: 저장됨 · 빨강 · 되돌리기  /  재확인: 「그래도 저장할까요」 한 번 묻고 저장  /  끔
export const LEVELS = ['알림', '경고', '재확인', '끔'];

export const LEVEL_UI = {
  알림: { color: 'yellow', undo: false, confirm: false },
  경고: { color: 'red', undo: true, confirm: false },
  재확인: { color: 'orange', undo: false, confirm: true },
};

// 규칙 키 → 이름 · 기본 수위. 기관 설정(org.rule_levels)이 덮는다.
export const RULES = {
  load_missing_teacher: { label: '시수표에 빠진 교사', level: '알림' },
  load_short: { label: '시수 부족', level: '알림' },
  room_capacity: { label: '특별실 정원 초과', level: '알림' },
  attendance_subject: { label: '근태 허용 교과 밖', level: '알림' },
  teacher_overlap: { label: '교사 겹침', level: '경고' },
  room_overlap: { label: '특별실 겹침', level: '경고' },
  lunch_conflict: { label: '급식 시각 충돌', level: '경고' },
  pin_conflict: { label: '고정·금지 충돌', level: '경고' },
  attendance_month_cap: { label: '근태 월 상한 초과', level: '알림' }, // 기관 설정 attendanceMonthlyCap(시간)이 있을 때만
  edit_confirmed: { label: '확정된 시간표 고치기', level: '재확인' },
  edit_closed_month: { label: '마감된 달 고치기', level: '재확인' },
  hide_roster: { label: '명단 숨김', level: '재확인' },
};

// 기관 설정 JSON 에서 수위를 읽는다. 모르는 키·잘못된 값은 기본값으로 돌린다.
export function resolveLevels(stored) {
  const out = {};
  for (const [k, d] of Object.entries(RULES)) {
    const v = stored && typeof stored === 'object' ? stored[k] : undefined;
    out[k] = LEVELS.includes(v) ? v : d.level;
  }
  return out;
}

export async function getRuleLevels(pool, orgId) {
  const { rows } = await pool.query(`SELECT rule_levels FROM org WHERE id = $1 AND deleted_at IS NULL`, [orgId]);
  return resolveLevels(rows[0]?.rule_levels);
}

// 위반 목록 [{rule, detail}] → 수위를 붙인 목록. 「끔」은 뺀다. 거부하지 않는다.
export function applyLevels(levels, found) {
  return found
    .filter((f) => RULES[f.rule] && levels[f.rule] !== '끔')
    .map((f) => ({ ...f, label: RULES[f.rule].label, level: f.level ?? levels[f.rule], ...LEVEL_UI[f.level ?? levels[f.rule]] }));
}
