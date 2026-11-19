// 해시 강도 재측정: 명단 1000줄 올리기 시간 + 로그인 동시 20명 p95. DATABASE_URL 필요. 쓴 기관은 끝에 정리한다.
import argon2 from 'argon2';
import { ARGON } from '../server/accounts.js';
import { createPool } from '../server/db.js';
import { migrate } from '../server/migrate.js';
import { createApp } from '../server/app.js';
import { cleanupOrgs } from '../test/sec-helpers.js';

const pool = createPool();
await migrate(pool);
const tag = `mh${Date.now()}`;
const hash = await argon2.hash('pw-test-1234', process.env.OLD_HASH ? undefined : ARGON);
const org = (await pool.query(`INSERT INTO org (name, kind) VALUES ($1,'초') RETURNING id`, [`${tag}-O`])).rows[0].id;
const ids = [];
for (let i = 0; i < 21; i++) {
  const u = (await pool.query(`INSERT INTO app_user (name, login_id, password_hash, must_change_password) VALUES ($1,$2,$3,FALSE) RETURNING id`, [`u${i}`, `${tag}-u${i}`, hash])).rows[0].id;
  await pool.query(`INSERT INTO membership (org_id, user_id, role) VALUES ($1,$2,$3)`, [org, u, i === 0 ? '기관관리자' : '교직원']);
  ids.push(`${tag}-u${i}`);
}
const app = createApp(pool, { testMode: true, cookieSecure: false, loginLimit: 100000, apiLimit: 100000 });
const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const sess = async (loginId) => {
  const st = { cookie: '', csrf: '' };
  const call = async (m, p, body) => {
    const res = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', cookie: st.cookie, 'x-csrf-token': st.csrf }, body: body ? JSON.stringify(body) : undefined });
    const sc = res.headers.getSetCookie?.() ?? [];
    if (sc.length) st.cookie = sc.map((c) => c.split(';')[0]).join('; ');
    const j = await res.json().catch(() => null);
    if (j?.csrf) st.csrf = j.csrf;
    return { status: res.status, json: j };
  };
  await call('GET', '/api/auth/session');
  return { call, login: () => call('POST', '/api/auth/login', { orgId: org, loginId, password: 'pw-test-1234' }) };
};
try {
  const adm = await sess(ids[0]);
  await adm.login();
  const rows = Array.from({ length: 1000 }, (_, i) => ({ name: `명${i}`, loginId: `${tag}-r${i}`, role: '교직원' }));
  let t0 = performance.now();
  const r = await adm.call('POST', `/api/orgs/${org}/roster/import`, { rows, confirm: true });
  console.log('명단 1000줄', r.status, Math.round(performance.now() - t0), 'ms');
  const ss = await Promise.all(ids.slice(1).map(sess)); // 20명
  const lat = await Promise.all(ss.map(async (s) => { const t = performance.now(); const x = await s.login(); return x.status === 200 ? performance.now() - t : NaN; }));
  const ok = lat.filter(Number.isFinite).sort((a, b) => a - b);
  console.log('로그인 동시 20명 성공', ok.length, 'p95', Math.round(ok[Math.ceil(ok.length * 0.95) - 1]), 'ms · 중앙값', Math.round(ok[ok.length >> 1]), 'ms');
} finally {
  server.close();
  await pool.query(`DELETE FROM membership WHERE org_id = $1 AND user_id IN (SELECT id FROM app_user WHERE login_id LIKE $2)`, [org, `${tag}-%`]).catch(() => {});
  await cleanupOrgs(pool, [org], tag).catch((e) => console.log('정리 실패', e.message));
  await pool.end();
}
