import test from 'node:test';
import assert from 'node:assert/strict';
import argon2 from 'argon2';
import { rankCandidates, fairness } from '../server/candidates.js';
import crypto from 'node:crypto';
import { seal, unseal } from '../server/seal.js';
import { cleanupOrgs } from './sec-helpers.js';

const HAS_DB = !!(process.env.DATABASE_URL || process.env.DATABASE_URL_FILE);

test('후보 등급 순수 계산: A 전담 수업 중 담임 · B 하교 뒤 담임 · C/D · 제외 사유', () => {
  const members = [
    { id: 1, name: '가담임', duty: '담임', homeroom: { id: 11, grade: 1 } }, // 반이 전담 수업 중 → A
    { id: 2, name: '나담임', duty: '담임', homeroom: { id: 12, grade: 1 } }, // 1학년은 2교시까지 → 3교시엔 하교 → B
    { id: 3, name: '다전담', duty: '전담·비교과', homeroom: null }, // 수업 있는 전담 → C
    { id: 4, name: '라비교과', duty: '전담·비교과', homeroom: null }, // 수업 하나도 없음 → D
    { id: 5, name: '마강사', duty: null, homeroom: null }, // 보조 인력
    { id: 6, name: '바담임', duty: '담임', homeroom: { id: 13, grade: 2 } }, // 반이 보조 인력 수업 → 묶임
    { id: 7, name: '사전담', duty: '전담·비교과', homeroom: null }, // 고정일정
    { id: 8, name: '아전담', duty: '전담·비교과', homeroom: null }, // 결강
    { id: 9, name: '자담임', duty: '담임', homeroom: { id: 14, grade: 3 } }, // 급식지도
  ];
  const cells = [
    { classroom_id: 11, weekday: 1, period: 2, membership_id: 3 },
    { classroom_id: 13, weekday: 1, period: 2, membership_id: 5 },
    { classroom_id: 99, weekday: 1, period: 1, membership_id: 7 },
  ];
  const periodConfig = { grades: { 1: { periods: 2 }, 3: { periods: 6, lunch: '12:00', lunchAfter: 2 } } };
  const run = (period) => rankCandidates({ weekday: 1, period, periodConfig, cells, members, absentIds: new Set([8]), pins: [{ target_id: 7, weekday: 1, period }], takenIds: new Set([4]), exclude: new Set(), config: { substitute: { assistants: 'exclude', lunchDuty: 'exclude' } } }); // 제외 모드(예전 동작)
  const two = run(2);
  const g = Object.fromEntries(two.candidates.map((c) => [c.name, c.grade]));
  assert.equal(g['가담임'], 'A');
  assert.equal(g['라비교과'], 'D');
  assert.equal(two.candidates.find((c) => c.name === '라비교과').taken, true); // 빼지 않고 표시만
  const code = Object.fromEntries(two.excluded.map((e) => [e.name, e.code]));
  assert.equal(code['마강사'], 'assistant');
  assert.equal(code['바담임'], 'held');
  assert.equal(code['사전담'], 'fixed');
  assert.equal(code['아전담'], 'absent');
  assert.equal(code['자담임'], 'lunch');
  assert.equal(code['다전담'], 'teaching');
  const three = run(3);
  assert.equal(three.candidates.find((c) => c.name === '나담임').grade, 'B');
  assert.equal(three.candidates.find((c) => c.name === '다전담').grade, 'C');
  assert.deepEqual(three.candidates.map((c) => c.grade).filter((x) => 'ABCD'.includes(x)), [...three.candidates.map((c) => c.grade)].sort());
});

test('형평성: 한 번도 안 간 사람도 0 · 적게 간 순 · 명단 밖 이름 보존', () => {
  const rows = fairness([{ id: 1, name: '가' }, { id: 2, name: '나' }, { id: 3, name: '다' }], [
    { membership_id: 1, on_date: '2026-11-10' }, { membership_id: 1, on_date: '2026-11-12' }, { membership_id: 2, on_date: '2026-11-11' },
    { membership_id: null, outside_name: '옛강사', on_date: '2026-11-01' },
  ]);
  assert.deepEqual(rows.map((r) => [r.name, r.count]), [['다', 0], ['나', 1], ['옛강사', 1], ['가', 2]]);
  assert.equal(rows.find((r) => r.name === '가').last, '2026-11-12');
  assert.equal(rows.find((r) => r.name === '옛강사').outside, true);
});

test('암호화 칸: 되돌려 읽히고 평문이 안 남고 틀린 키로는 안 열린다', () => {
  const old = process.env.DATA_KEY;
  try {
    process.env.DATA_KEY = 'key-one';
    const blob = seal('병가 — 수술');
    assert.ok(!blob.includes('병가'));
    assert.equal(unseal(blob), '병가 — 수술');
    process.env.DATA_KEY = 'key-two';
    assert.equal(unseal(blob), null);
    assert.equal(seal(''), null);
  } finally {
    if (old === undefined) delete process.env.DATA_KEY; else process.env.DATA_KEY = old;
  }
});

test('암호화 칸: 옛 v1 암호문은 거부된다', () => {
  const old = process.env.DATA_KEY;
  try {
    process.env.DATA_KEY = 'legacy-key';
    const mk = (key, enc64) => {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', key, iv);
      const e = Buffer.concat([c.update('옛 글', 'utf8'), c.final()]);
      return ['v1', iv.toString(enc64), c.getAuthTag().toString(enc64), e.toString(enc64)].join(':');
    };
    const sealKey = crypto.createHash('sha256').update('legacy-key').digest();
    const boxKey = Buffer.from(crypto.hkdfSync('sha256', 'legacy-key', 'school-timetable', 'secretbox-v1', 32));
    assert.equal(unseal(mk(sealKey, 'base64')), null);
    assert.equal(unseal(mk(boxKey, 'base64url')), null);
  } finally {
    if (old === undefined) delete process.env.DATA_KEY; else process.env.DATA_KEY = old;
  }
});

test('S-3 경로: 동시 맡기 20건 중 1건만 성공 · 후보 등급 · 형평성 · 예약 겹침 경고', { skip: !HAS_DB && 'DB 없음 — 건너뜀' }, async (t) => {
  const { createPool } = await import('../server/db.js');
  const { migrate } = await import('../server/migrate.js');
  const { createApp } = await import('../server/app.js');
  const pool = createPool();
  await migrate(pool);
  const tag = `s${Date.now()}`;
  const hash = await argon2.hash('pw-test-1234');
  const mkOrg = async (n) => (await pool.query(`INSERT INTO org (name, kind) VALUES ($1, '초') RETURNING id`, [`${tag}-${n}`])).rows[0].id;
  const org = await mkOrg('O');
  const orgB = await mkOrg('B');
  const mk = async (o, lid, role, duty = null) => {
    const u = (await pool.query(`INSERT INTO app_user (name, login_id, password_hash, must_change_password) VALUES ($1,$2,$3,FALSE) RETURNING id`, [lid, `${tag}-${lid}`, hash])).rows[0].id;
    const m = (await pool.query(`INSERT INTO membership (org_id, user_id, role, duty) VALUES ($1,$2,$3,$4) RETURNING id`, [o, u, role, duty])).rows[0].id;
    return { login: `${tag}-${lid}`, m: Number(m) };
  };
  const adm = await mk(org, 'adm', '기관관리자');
  const abs = await mk(org, 'abs', '교직원', '담임'); // 결강 교사(1-2 담임)
  const hA = await mk(org, 'hA', '교직원', '담임'); // 1-1 담임: 전담 수업 중 → A
  const spec = await mk(org, 'spec', '교직원', '전담·비교과'); // 1-1 에서 수업 중
  const free = await mk(org, 'free', '교직원', '전담·비교과'); // 3교시 수업만 있음 → 2교시 C
  const bike = await mk(org, 'bike', '교직원', '전담·비교과'); // 수업 없음 → D
  const crowd = [];
  for (let i = 0; i < 20; i++) crowd.push(await mk(org, `c${i}`, '교직원', '전담·비교과'));
  const outsider = await mk(orgB, 'outB', '교직원');
  const term = (await pool.query(`INSERT INTO term (org_id, year, semester) VALUES ($1, 2026, 2) RETURNING id`, [org])).rows[0].id;
  const cls = async (g, n, hm) => (await pool.query(`INSERT INTO classroom (org_id, term_id, grade, class_no, homeroom_membership_id, student_count) VALUES ($1,$2,$3,$4,$5,30) RETURNING id`, [org, term, g, n, hm])).rows[0].id;
  const c11 = await cls(1, 1, hA.m);
  const c12 = await cls(1, 2, abs.m);
  const room = (await pool.query(`INSERT INTO special_room (org_id, name, capacity) VALUES ($1,'과학실',20) RETURNING id`, [org])).rows[0].id;
  const tt = (await pool.query(`INSERT INTO timetable (org_id, term_id, name, status) VALUES ($1,$2,'확정판','확정') RETURNING id`, [org, term])).rows[0].id;
  const cell = (c, w, p, m, r = null) => pool.query(`INSERT INTO cell (org_id, timetable_id, classroom_id, weekday, period, membership_id, special_room_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [org, tt, c, w, p, m, r]);
  await cell(c11, 1, 2, spec.m, room); // 월 2교시 1-1 전담(과학실)
  await cell(c12, 1, 2, abs.m); // 월 2교시 1-2 담임 수업
  await cell(c12, 1, 3, free.m);
  const MON = '2026-11-16';
  const app = createApp(pool, { testMode: true, cookieSecure: false, loginLimit: 1000, apiLimit: 10000 });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.close();
    await cleanupOrgs(pool, [org, orgB], tag);
    await pool.end();
  });
  const client = async (o, login) => {
    let cookie = ''; let csrf = '';
    const call = async (method, path, body) => {
      const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie, 'x-csrf-token': csrf }, body: body ? JSON.stringify(body) : undefined });
      const sc = res.headers.getSetCookie?.() ?? [];
      if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
      const json = await res.json().catch(() => null);
      if (json?.csrf) csrf = json.csrf;
      return { status: res.status, json };
    };
    await call('GET', '/api/auth/session');
    const l = await call('POST', '/api/auth/login', { orgId: o, loginId: login, password: 'pw-test-1234' });
    assert.equal(l.status, 200, `로그인 ${login}`);
    return call;
  };
  const P = `/api/orgs/${org}`;
  const A = await client(org, adm.login);
  const absC = await client(org, abs.login);

  await t.test('올리기: 사유는 암호화 저장 · 본인·관리자만 읽는다 · 같은 것 둘은 409', async () => {
    const r = await absC('POST', `${P}/substitutes`, { on_date: MON, items: [{ period: 2, classroom_id: Number(c12) }], reason_kind: '병가', reason: '수술 회복' });
    assert.equal(r.status, 201);
    const raw = (await pool.query(`SELECT reason_enc FROM substitute WHERE id = $1`, [r.json.ids[0]])).rows[0].reason_enc;
    assert.ok(raw && !raw.includes('수술'));
    const mine = (await absC('GET', `${P}/substitutes`)).json.rows[0];
    assert.equal(mine.reason, '수술 회복');
    assert.equal((await A('GET', `${P}/substitutes`)).json.rows[0].reason, '수술 회복');
    const other = await client(org, crowd[0].login);
    const seen = (await other('GET', `${P}/substitutes`)).json.rows[0];
    assert.equal(seen.reason, undefined);
    assert.equal(seen.has_reason, true);
    const dup = await absC('POST', `${P}/substitutes`, { on_date: MON, items: [{ period: 2, classroom_id: Number(c12) }] });
    assert.equal(dup.status, 409);
  });

  const sid = (await pool.query(`SELECT id FROM substitute WHERE org_id = $1`, [org])).rows[0].id;

  await t.test('후보: 담임 A · 비교과 D · 전담 C 는 3교시 · 강사 제외 · 본인(결강) 빠짐', async () => {
    const r = await A('GET', `${P}/substitutes/${sid}/candidates`);
    assert.equal(r.status, 200);
    const g = Object.fromEntries(r.json.candidates.map((c) => [c.name, c.grade]));
    assert.equal(g.hA, 'A');
    assert.equal(g.bike, 'D');
    assert.equal(g.free, 'C'); // 월 2교시엔 수업 없음 + 시간표엔 3교시 수업이 있어 C
    assert.equal(g.spec, undefined); // 그 시간 수업 중 → 후보 아님
    assert.equal(r.json.excluded.find((e) => e.name === 'spec').code, 'teaching');
    assert.equal(g.abs, undefined);
  });

  await t.test('동시 맡기 20건 중 1건만 성공 · 나머지 409', async () => {
    const cs = await Promise.all(crowd.map((c) => client(org, c.login)));
    const rs = await Promise.all(cs.map((c) => c('POST', `${P}/substitutes/${sid}/take`)));
    const ok = rs.filter((r) => r.status === 200);
    assert.equal(ok.length, 1);
    assert.equal(rs.filter((r) => r.status === 409).length, 19);
    const row = (await pool.query(`SELECT status, taken_membership_id FROM substitute WHERE id = $1`, [sid])).rows[0];
    assert.equal(row.status, '맡음');
    const winner = crowd.find((c) => String(c.m) === String(row.taken_membership_id));
    assert.ok(winner);
    assert.ok(Array.isArray(ok[0].json.warnings));
  });

  await t.test('형평성: 맡은 사람 1 · 안 간 사람 0 이 앞 · 명단 밖 이름 강제 지정 · 해제', async () => {
    let f = (await A('GET', `${P}/substitutes/fairness`)).json.rows;
    assert.equal(f.filter((x) => x.count === 1).length, 1);
    assert.equal(f[0].count, 0);
    assert.equal(f.find((x) => x.name === 'bike').count, 0);
    const a = await A('POST', `${P}/substitutes/${sid}/assign`, { outside_name: '옛강사' });
    assert.equal(a.status, 200);
    f = (await A('GET', `${P}/substitutes/fairness`)).json.rows;
    assert.equal(f.find((x) => x.name === '옛강사').count, 1);
    assert.equal(f.filter((x) => x.count === 1 && !x.outside).length, 0);
    assert.equal((await A('POST', `${P}/substitutes/${sid}/release`)).status, 200);
    assert.equal((await pool.query(`SELECT status FROM substitute WHERE id = $1`, [sid])).rows[0].status, '열림');
    assert.equal((await absC('POST', `${P}/substitutes/${sid}/assign`, { outside_name: 'x' })).status, 404);
  });

  await t.test('예약: 겹쳐도 저장 · 경고 수위 · 잠금 · 빈 교실 · 남의 기관은 404', async () => {
    const u1 = await client(org, crowd[1].login);
    const u2 = await client(org, crowd[2].login);
    const b1 = await u1('POST', `${P}/bookings`, { special_room_id: Number(room), on_date: MON, period: 4 });
    assert.equal(b1.status, 201);
    assert.equal(b1.json.warnings.length, 0);
    const b2 = await u2('POST', `${P}/bookings`, { special_room_id: Number(room), on_date: MON, period: 4 });
    assert.equal(b2.status, 201);
    assert.ok(b2.json.warnings.some((w) => w.rule === 'room_overlap' && w.level === '경고'));
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM booking WHERE org_id = $1`, [org])).rows[0].n, 2);
    assert.equal((await u1('POST', `${P}/bookings`, { special_room_id: Number(room), on_date: MON, period: 4 })).status, 409);
    const b3 = await u1('POST', `${P}/bookings`, { special_room_id: Number(room), on_date: MON, period: 2, classroom_id: Number(c11) });
    assert.ok(b3.json.warnings.some((w) => w.detail.includes('수업')));
    assert.ok(b3.json.warnings.some((w) => w.rule === 'room_capacity'));
    assert.equal((await u1('POST', `${P}/room-locks`, { special_room_id: Number(room), weekday: 1, period: 5 })).status, 404);
    assert.equal((await A('POST', `${P}/room-locks`, { special_room_id: Number(room), weekday: 1, period: 5, note: '과학 고정' })).status, 201);
    const b4 = await u1('POST', `${P}/bookings`, { special_room_id: Number(room), on_date: MON, period: 5 });
    assert.equal(b4.status, 201);
    assert.ok(b4.json.warnings.some((w) => w.detail.includes('잠근')));
    const fr = (await u1('GET', `${P}/rooms/free?on_date=${MON}&period=6`)).json;
    assert.equal(fr[0].free, true);
    const fr4 = (await u1('GET', `${P}/rooms/free?on_date=${MON}&period=4`)).json;
    assert.equal(fr4[0].free, false);
    assert.equal((await u2('DELETE', `${P}/bookings/${b1.json.id}`)).status, 404);
    assert.equal((await A('DELETE', `${P}/bookings/${b1.json.id}`)).status, 200);
    const o = await client(orgB, outsider.login);
    assert.equal((await o('GET', `${P}/bookings`)).status, 404);
    assert.equal((await o('GET', `${P}/substitutes/${sid}/candidates`)).status, 404);
    assert.equal((await o('POST', `${P}/substitutes/${sid}/take`)).status, 404);
  });
});
