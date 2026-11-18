import test from 'node:test';
import assert from 'node:assert/strict';
import argon2 from 'argon2';
import { monthSummary } from '../server/routes/attendance.js';
import { seal, unseal } from '../server/seal.js';

const HAS_DB = !!(process.env.DATABASE_URL || process.env.DATABASE_URL_FILE);

test('월 근무시간 집계: 사람별 합 · 일수(0시간은 일수에 안 넣음)', () => {
  const s = monthSummary([
    { membership_id: 1, hours: 3.5 }, { membership_id: 1, hours: 4 }, { membership_id: 1, hours: 0 }, { membership_id: 2, hours: 2 },
  ]);
  assert.deepEqual(s.find((x) => x.membership_id === 1), { membership_id: 1, total_hours: 7.5, days: 2 });
  assert.equal(s.length, 2);
});

test('메모 암호화: 왕복 · 평문이 안 보임 · 깨진 값은 null', () => {
  const b = seal('비밀 메모');
  assert.ok(!b.includes('비밀'));
  assert.equal(unseal(b), '비밀 메모');
  assert.equal(unseal('v1:x:y:z'), null);
  assert.equal(seal(''), null);
});

test('S-4a 경로: 허용 교과 알림 · 마감 뒤 재확인 · 메모는 DB 에 암호문', { skip: !HAS_DB && 'DB 없음 — 건너뜀' }, async (t) => {
  const { createPool } = await import('../server/db.js');
  const { migrate } = await import('../server/migrate.js');
  const { createApp } = await import('../server/app.js');
  const pool = createPool();
  await migrate(pool);
  const tag = `a${Date.now()}`;
  const hash = await argon2.hash('pw-test-1234');
  const org = (await pool.query(`INSERT INTO org (name, kind) VALUES ($1, '초') RETURNING id`, [`${tag}-O`])).rows[0].id;
  const mk = async (lid, role) => {
    const u = (await pool.query(`INSERT INTO app_user (name, login_id, password_hash, must_change_password) VALUES ($1,$2,$3,FALSE) RETURNING id`, [lid, `${tag}-${lid}`, hash])).rows[0].id;
    const m = (await pool.query(`INSERT INTO membership (org_id, user_id, role) VALUES ($1,$2,$3) RETURNING id`, [org, u, role])).rows[0].id;
    return { login: `${tag}-${lid}`, m: Number(m) };
  };
  const adm = await mk('adm', '기관관리자');
  const stf = await mk('stf', '교직원');
  const view = await mk('view', '보기만');
  const sub = (await pool.query(`INSERT INTO subject (org_id, name) VALUES ($1,'영어') RETURNING id`, [org])).rows[0].id;
  const app = createApp(pool, { testMode: true, cookieSecure: false, loginLimit: 1000, apiLimit: 10000 });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.close();
    for (const tb of ['attendance_allowed', 'attendance', 'month_close', 'audit_log', 'subject', 'term']) await pool.query(`DELETE FROM ${tb} WHERE org_id = $1`, [org]);
    await pool.query(`DELETE FROM membership WHERE org_id = $1`, [org]);
    await pool.query(`DELETE FROM app_user WHERE login_id LIKE $1`, [`${tag}-%`]);
    await pool.query(`DELETE FROM org WHERE id = $1`, [org]);
    await pool.end();
  });
  const client = () => {
    let cookie = ''; let csrf = '';
    const call = async (method, path, body) => {
      const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie, 'x-csrf-token': csrf }, body: body ? JSON.stringify(body) : undefined });
      const sc = res.headers.getSetCookie?.() ?? [];
      if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
      const json = await res.json().catch(() => null);
      if (json?.csrf) csrf = json.csrf;
      return { status: res.status, json };
    };
    return { call, login: async (login) => { await call('GET', '/api/auth/session'); return call('POST', '/api/auth/login', { orgId: org, loginId: login, password: 'pw-test-1234' }); } };
  };
  const A = client();
  const S = client();
  const V = client();
  assert.equal((await A.login(adm.login)).status, 200);
  assert.equal((await S.login(stf.login)).status, 200);
  assert.equal((await V.login(view.login)).status, 200);
  const P = `/api/orgs/${org}`;

  await t.test('허용 교과 밖은 저장되고 알림만 · 같은 날 다시 저장하면 한 줄', async () => {
    assert.equal((await A.call('PUT', `${P}/attendance/allowed`, { membership_id: stf.m, subject_ids: [Number(sub)] })).status, 200);
    const r = await S.call('POST', `${P}/attendance`, { on_date: '2026-11-03', hours: 3.5, allowed_subject: '수학', memo: '병원 다녀옴' });
    assert.equal(r.status, 201);
    assert.ok(r.json.violations.some((v) => v.rule === 'attendance_subject'));
    assert.equal(r.json.row.memo, '병원 다녀옴');
    const raw = (await pool.query(`SELECT memo_enc FROM attendance WHERE id = $1`, [r.json.row.id])).rows[0].memo_enc;
    assert.ok(!raw.includes('병원'));
    await S.call('POST', `${P}/attendance`, { on_date: '2026-11-03', hours: 4, allowed_subject: '영어' });
    const l = await S.call('GET', `${P}/attendance?ym=2026-11`);
    assert.equal(l.json.rows.length, 1);
    assert.equal(l.json.rows[0].hours, 4);
  });

  await t.test('월 마감 뒤 고치면 거부가 아니라 재확인(409) → confirm 하면 저장', async () => {
    assert.equal((await S.call('POST', `${P}/attendance/close`, { ym: '2026-11' })).status, 404); // 마감은 관리자만
    assert.equal((await A.call('POST', `${P}/attendance/close`, { ym: '2026-11' })).status, 200);
    const first = await S.call('POST', `${P}/attendance`, { on_date: '2026-11-03', hours: 5 });
    assert.equal(first.status, 409);
    assert.equal(first.json.needConfirm, true);
    assert.equal((await S.call('GET', `${P}/attendance?ym=2026-11`)).json.rows[0].hours, 4); // 아직 안 바뀜
    const ok = await S.call('POST', `${P}/attendance`, { on_date: '2026-11-03', hours: 5, confirm: true });
    assert.equal(ok.status, 201);
    const sum = await A.call('GET', `${P}/attendance/summary?ym=2026-11`);
    assert.equal(sum.json.closed, true);
    assert.equal(sum.json.people[0].total_hours, 5);
  });

  await t.test('보기만은 근태 못 씀 · 남의 줄은 교직원에게 안 보임', async () => {
    assert.equal((await V.call('GET', `${P}/attendance?ym=2026-11`)).status, 404);
    await A.call('POST', `${P}/attendance`, { membership_id: adm.m, on_date: '2026-11-04', hours: 2, confirm: true });
    const mine = await S.call('GET', `${P}/attendance?ym=2026-11`);
    assert.ok(mine.json.rows.every((x) => x.membership_id === String(stf.m) || x.membership_id === stf.m));
    const other = await S.call('POST', `${P}/attendance`, { membership_id: adm.m, on_date: '2026-11-05', hours: 1, confirm: true });
    assert.equal(other.status, 404);
  });

  await t.test('가중·소규모교: 관리자만 저장 · 형식 틀리면 400', async () => {
    assert.equal((await S.call('PUT', `${P}/soft-weights`, { weights: { bands: { 중요: 30 } } })).status, 404);
    assert.equal((await A.call('PUT', `${P}/soft-weights`, { weights: { bands: { 중요: 30 } } })).status, 200);
    assert.equal((await A.call('PUT', `${P}/soft-weights`, { weights: { bands: { 중요: 'x' } } })).status, 400);
    assert.equal((await S.call('GET', `${P}/soft-weights`)).json.weights.bands.중요, 30);
    assert.equal((await A.call('PUT', `${P}/small-school`, { enabled: true, homeroom_subject_ids: [Number(sub)], combined: [] })).status, 200);
    assert.equal((await A.call('PUT', `${P}/small-school`, { enabled: true, homeroom_subject_ids: [999999999], combined: [] })).status, 404);
  });
});
