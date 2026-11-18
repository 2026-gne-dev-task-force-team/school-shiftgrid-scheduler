// 「그 날 적용 중인 확정본」 고르기 — 한 곳. 내 시간표·보결·특별실 예약·겸임 겹침 검사가 여기서 읽는다.
// 규칙: 확정본 중 적용 시작일이 그 날(기본 오늘 · 한국 시각) 이전·당일인 것 가운데 가장 늦은 것.
//   시작일이 같으면 나중에 확정한 것 · 시작일이 빈 옛 확정본은 맨 뒤(NULLS LAST).
export function todayKST(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export async function appliedTimetable(pool, orgId, date) {
  const d = date || todayKST();
  const { rows } = await pool.query(
    `SELECT id, term_id, name, status, to_char(starts_on, 'YYYY-MM-DD') AS starts_on FROM timetable
      WHERE org_id = $1 AND status = '확정' AND deleted_at IS NULL AND (starts_on IS NULL OR starts_on <= $2::date)
      ORDER BY starts_on DESC NULLS LAST, confirmed_at DESC NULLS LAST, id DESC LIMIT 1`,
    [orgId, d],
  );
  return rows[0] ?? null;
}
