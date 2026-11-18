// 감사 로그 한 줄. 실패해도 본 일을 막지 않는다(로그만 남김).
export async function audit(db, { orgId = null, userId = null, action, table = null, rowId = null, before = null, after = null }) {
  try {
    await db.query(
      `INSERT INTO audit_log (org_id, user_id, action, table_name, row_id, before, after) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [orgId, userId, action, table, rowId, before && JSON.stringify(before), after && JSON.stringify(after)],
    );
  } catch (e) {
    console.error('감사 로그 실패', e.message);
  }
}

// 그 사람의 세션을 다 끊는다(keepSid 는 남김). 비밀번호 변경·초기화·역할 내림·잠금 때.
export async function killSessions(db, userId, keepSid = null) {
  await db.query(`DELETE FROM session WHERE (sess->>'userId') = $1 AND sid <> COALESCE($2, '')`, [String(userId), keepSid]);
}

// 그 기관으로 로그인한 세션을 다 끊는다(기관 중지 때 — 로그인만 막으면 열린 세션이 계속 산다).
export async function killOrgSessions(db, orgId) {
  await db.query(`DELETE FROM session WHERE (sess->>'orgId') = $1`, [String(orgId)]);
}
