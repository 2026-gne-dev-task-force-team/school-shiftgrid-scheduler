import argon2 from 'argon2';
import { tempPassword } from './passwords.js';

export const ID_RE = /^[^\s/\\<>"'`]{1,100}$/; // 공백·따옴표·슬래시 빼고 한글 허용(이름이 기본 ID)

// 계정(사람) 하나 + 소속 한 줄을 만든다. ID 가 이미 있으면 (existing: 'add') 때만 그 사람에게 소속을 더한다.
// 반환: { userId, membershipId, temp } (소속만 더했으면 temp = null) 또는 { error }
export async function createAccount(db, { orgId, name, loginId, role, duty = null, existing = 'reject' }) {
  const found = (await db.query(`SELECT id, deleted_at FROM app_user WHERE lower(login_id) = lower($1)`, [loginId])).rows[0];
  let userId;
  let temp = null;
  if (found) {
    if (existing !== 'add' || found.deleted_at) return { error: '이미 쓰고 있는 ID 입니다' };
    userId = found.id;
    const m = (await db.query(`SELECT 1 FROM membership WHERE user_id = $1 AND org_id = $2`, [userId, orgId])).rows[0];
    if (m) return { error: '이 기관에 이미 소속된 사람입니다' };
  } else {
    temp = tempPassword();
    const ins = await db.query(
      `INSERT INTO app_user (name, login_id, password_hash, must_change_password) VALUES ($1,$2,$3,TRUE)
       ON CONFLICT (lower(login_id)) DO NOTHING RETURNING id`,
      [name, loginId, await argon2.hash(temp)],
    );
    if (!ins.rows[0]) return { error: '이미 쓰고 있는 ID 입니다' };
    userId = ins.rows[0].id;
  }
  const m = await db.query(`INSERT INTO membership (org_id, user_id, role, duty) VALUES ($1,$2,$3,$4) RETURNING id`, [orgId, userId, role, duty]);
  return { userId: Number(userId), membershipId: Number(m.rows[0].id), temp };
}

// 임시 비밀번호로 되돌린다(관리자가 본인 비밀번호를 정하지는 못한다). 잠금도 풀고 첫 로그인 상태로.
export async function resetPassword(db, userId) {
  const temp = tempPassword();
  await db.query(
    `UPDATE app_user SET password_hash = $2, must_change_password = TRUE, failed_count = 0, locked_until = NULL WHERE id = $1`,
    [userId, await argon2.hash(temp)],
  );
  return temp;
}
