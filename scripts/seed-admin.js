// 시스템 관리자(교육청) 첫 계정을 심는다. 설치 때 한 번.
//   ADMIN_LOGIN_ID=... [ADMIN_PASSWORD=...] [ADMIN_NAME=...] node scripts/seed-admin.js
// ADMIN_PASSWORD 를 안 주면 임시 비밀번호 8자를 만들어 한 번 보여 준다. 첫 로그인 때 바꿔야 한다.
import crypto from 'node:crypto';
import argon2 from 'argon2';
import { createPool } from '../server/db.js';
import { migrate } from '../server/migrate.js';

const loginId = process.env.ADMIN_LOGIN_ID;
if (!loginId) {
  console.error('ADMIN_LOGIN_ID 가 필요하다');
  process.exit(1);
}
const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
const temp = process.env.ADMIN_PASSWORD || Array.from(crypto.randomBytes(8), (b) => alphabet[b % alphabet.length]).join('');

const pool = createPool();
try {
  await migrate(pool);
  let org = (await pool.query(`SELECT id FROM org WHERE kind = '교육청' AND deleted_at IS NULL ORDER BY id LIMIT 1`)).rows[0];
  if (!org) org = (await pool.query(`INSERT INTO org (name, kind) VALUES ('교육청', '교육청') RETURNING id`)).rows[0];

  const hash = await argon2.hash(temp, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const u = await pool.query(
    `INSERT INTO app_user (name, login_id, password_hash, must_change_password) VALUES ($1, $2, $3, TRUE)
     ON CONFLICT (lower(login_id)) DO NOTHING RETURNING id`,
    [process.env.ADMIN_NAME || loginId, loginId, hash],
  );
  if (!u.rows[0]) {
    console.log(`이미 있는 ID 라 건드리지 않았다: ${loginId}`);
  } else {
    await pool.query(`INSERT INTO membership (org_id, user_id, role) VALUES ($1, $2, '시스템관리자')`, [org.id, u.rows[0].id]);
    console.log(`시스템 관리자 생성: ID=${loginId} 임시 비밀번호=${process.env.ADMIN_PASSWORD ? '(준 값)' : temp} — 첫 로그인 때 바꾼다(기관은 「교육청」)`);
  }
} finally {
  await pool.end();
}
