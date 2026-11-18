import test from 'node:test';
import assert from 'node:assert/strict';
import argon2 from 'argon2';
import { resolveLevels, applyLevels } from '../server/rules.js';
import { expandMaster, missingTeachers, isIncomplete } from '../server/routes/loads.js';

import { cleanupOrgs } from './sec-helpers.js';
const HAS_DB = !!(process.env.DATABASE_URL || process.env.DATABASE_URL_FILE);

test('규칙 수위: 기본값 · 덮어쓰기 · 끔 · 잘못된 값은 기본으로', () => {
  const l = resolveLevels({ teacher_overlap: '끔', room_capacity: '경고', load_short: '엉터리', 모르는: '알림' });
  assert.equal(l.teacher_overlap, '끔');
  assert.equal(l.room_capacity, '경고');
  assert.equal(l.load_short, '알림');
  assert.equal(l.모르는, undefined);
  const out = applyLevels(l, [{ rule: 'teacher_overlap' }, { rule: 'room_capacity' }, { rule: 'edit_confirmed' }]);
  assert.deepEqual(out.map((o) => o.rule), ['room_capacity', 'edit_confirmed']); // 끔은 빠진다
  assert.equal(out[0].undo, true);
  assert.equal(out[1].confirm, true);
});

test('시수표: 덜 채운 줄 · 마스터 펼침 · 빠진 교사', () => {
  assert.equal(isIncomplete({ membership_id: 1, subject_id: 2, weekly_hours: 0 }), true);
  assert.equal(isIncomplete({ membership_id: 1, subject_id: 2, weekly_hours: 3 }), false);
  const lines = [
    { id: 1, membership_id: 5, subject_id: 9, classroom_id: null, weekly_hours: 2 },
    { id: 2, membership_id: 5, subject_id: 9, classroom_id: 11, weekly_hours: 4 },
  ];
  const ex = expandMaster(lines, [{ id: 11 }, { id: 12 }]);
  assert.equal(ex.length, 2);
  assert.equal(ex.find((l) => l.classroom_id === 11).weekly_hours, 4); // 직접 적은 줄이 이긴다
  assert.equal(ex.find((l) => l.classroom_id === 12).from_master, 1);
  assert.equal(missingTeachers([{ membership_id: 5, name: 'a' }, { membership_id: 6, name: 'b' }], lines).length, 1);
});

test('S-1b 경로: 저장은 되고 알림만 남는다 · 권한 · 같은 것이 둘', { skip: !HAS_DB && 'DB 없음 — 건너뜀' }, async (t) => {
  const { createPool } = await import('../server/db.js');
  const { migrate } = await import('../server/migrate.js');
  const { createApp } = await import('../server/app.js');
  const pool = createPool();
  await migrate(pool);
  const tag = `s1b${Date.now()}`;
  const hash = await argon2.hash('pw-test-1234');
  const org = (await pool.query(`INSERT INTO org (name, kind) VALUES ($1, '초') RETURNING id`, [`${tag}-A`])).rows[0].id;
  const mkUser = async (name, role, duty) => {
    const u = (await pool.query(`INSERT INTO app_user (name, login_id, password_hash, must_change_password) VALUES ($1,$2,$3,FALSE) RETURNING id`, [name, `${tag}-${name}`, hash])).rows[0].id;
    const m = (await pool.query(`INSERT INTO membership (org_id, user_id, role, duty) VALUES ($1,$2,$3,$4) RETURNING id`, [org, u, role, duty])).rows[0].id;
    return { login: `${tag}-${name}`, mid: m };
  };
  const admin = await mkUser('admin', '기관관리자', null);
  const teacher = await mkUser('tch', '교직원', '전담·비교과');
  const app = createApp(pool, { testMode: true, cookieSecure: false, loginLimit: 1000, apiLimit: 10000 });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.close();
    await cleanupOrgs(pool, org, tag);
    await pool.end();
  });
  const client = async (loginId) => {
    let cookie = '', csrf = '';
    const call = async (method, path, body) => {
      const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie, 'x-csrf-token': csrf }, body: body ? JSON.stringify(body) : undefined });
      const sc = res.headers.getSetCookie?.() ?? [];
      if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
      const json = await res.json().catch(() => null);
      if (json?.csrf) csrf = json.csrf;
      return { status: res.status, json };
    };
    await call('GET', '/api/auth/session');
    await call('POST', '/api/auth/login', { orgId: org, loginId, password: 'pw-test-1234' });
    return call;
  };
  const a = await client(admin.login);
  const s = await client(teacher.login);
  const P = `/api/orgs/${org}`;

  await t.test('기본 교과 14개가 미리 들어 있다', async () => {
    const r = await a('GET', `${P}/subjects`);
    assert.equal(r.json.length, 14);
  });

  await t.test('교과: 추가 · 이름 바꿈 · 숨김 · 프리셋 다시 불러오기(없는 것만)', async () => {
    const added = await a('POST', `${P}/subjects`, { name: '코딩', short_name: '코' });
    assert.equal(added.status, 201);
    const kor = (await a('GET', `${P}/subjects`)).json.find((x) => x.name === '국어');
    assert.equal((await a('PATCH', `${P}/subjects/${kor.id}`, { name: '국어과', short_name: '국' })).json.name, '국어과');
    assert.equal((await a('PATCH', `${P}/subjects/${added.json.id}`, { hidden: true })).json.hidden, true);
    assert.ok(!(await a('GET', `${P}/subjects`)).json.some((x) => x.name === '코딩'));
    assert.ok((await a('GET', `${P}/subjects?hidden=1`)).json.some((x) => x.name === '코딩' && x.hidden));
    assert.equal((await s('POST', `${P}/subjects/preset-reload`)).status, 404);
    const re = await a('POST', `${P}/subjects/preset-reload`);
    assert.deepEqual(re.json.added, []); // S-fix-3: 이름을 바꿔도 열쇠(preset_key)가 남아 다시 안 생긴다
    assert.ok(!(await a('GET', `${P}/subjects`)).json.some((x) => x.name === '국어'));
    // S-fix-7: 열쇠 없는 옛 줄은 순서로 열쇠를 이어 받는다 — 새로 만들지 않는다
    await pool.query(`UPDATE subject SET preset_key = NULL, name = '국어과옛' WHERE id = $1`, [kor.id]);
    const re2 = (await a('POST', `${P}/subjects/preset-reload`)).json;
    assert.deepEqual(re2.added, []);
    assert.deepEqual(re2.linked, ['국어']);
    // 열쇠 없는 기본 교과가 있는데 맞는 자리가 없으면 새로 만들지 않고 확인 필요
    const orgId = (await pool.query(`SELECT org_id FROM subject WHERE id = $1`, [kor.id])).rows[0].org_id;
    await pool.query(`DELETE FROM subject WHERE org_id = $1 AND preset_key = '사회'`, [orgId]);
    await pool.query(`INSERT INTO subject (org_id, name, is_default) VALUES ($1, '엉뚱한교과', TRUE)`, [orgId]);
    const re3 = (await a('POST', `${P}/subjects/preset-reload`)).json;
    assert.deepEqual(re3.added, []);
    assert.deepEqual(re3.needs_check, ['사회']);
    assert.equal((await a('PATCH', `${P}/subjects/${added.json.id}`, { hidden: false })).json.hidden, false);
    assert.equal((await a('POST', `${P}/subjects/preset-reload`)).json.added.length, 0);
  });

  await t.test('반 · 교시 · 특별실', async () => {
    assert.equal((await a('POST', `${P}/classrooms/bulk`, { grade: 3, count: 2 })).json.length, 2);
    assert.equal((await a('PUT', `${P}/school/periods`, { grades: { 3: { periods: 5, lunch: '12:10' } } })).status, 200);
    assert.equal((await a('PUT', `${P}/school/periods`, { grades: { 3: { periods: 99 } } })).status, 400);
    assert.equal((await a('POST', `${P}/special-rooms`, { name: '과학실', purpose: '수업용', capacity: 24 })).status, 201);
    assert.equal((await a('POST', `${P}/special-rooms`, { name: '과학실' })).status, 409);
  });

  await t.test('시수표: 덜 채운 줄도 저장 · 빠진 교사는 알림(거부 아님)', async () => {
    const subj = (await a('GET', `${P}/subjects`)).json[0].id;
    const half = await a('POST', `${P}/loads`, { subject_id: subj }); // 교사·시수 없음
    assert.equal(half.status, 201);
    assert.equal(half.json.incomplete, true);
    const l = await a('GET', `${P}/loads`);
    assert.equal(l.json.lines.length, 1);
    assert.ok(l.json.alerts.some((x) => x.rule === 'load_missing_teacher' && x.level === '알림'));
    const full = await a('POST', `${P}/loads`, { membership_id: teacher.mid, subject_id: subj, weekly_hours: 3, sync_progress: true });
    assert.equal(full.status, 201);
    assert.equal((await a('GET', `${P}/loads`)).json.alerts.length, 0);
    assert.equal((await a('GET', `${P}/loads/effective`)).status, 200);
  });

  await t.test('고정·금지: 같은 것이 둘이면 409 · 남의 대상은 404', async () => {
    const pin = { target_kind: '교사', target_id: teacher.mid, weekday: 1, period: 2, kind: '금지' };
    assert.equal((await a('POST', `${P}/pins`, pin)).status, 201);
    assert.equal((await a('POST', `${P}/pins`, pin)).status, 409);
    assert.equal((await a('POST', `${P}/pins`, { ...pin, target_id: 999999999 })).status, 404);
    assert.equal((await a('GET', `${P}/pins?target_kind=교사`)).json.length, 1);
  });

  await t.test('규칙 수위: 관리자만 바꾼다 · 끄기', async () => {
    assert.equal((await s('PUT', `${P}/rules`, { levels: { teacher_overlap: '끔' } })).status, 404);
    assert.equal((await a('PUT', `${P}/rules`, { levels: { teacher_overlap: '끔' } })).json.levels.teacher_overlap, '끔');
    assert.equal((await a('PUT', `${P}/rules`, { levels: { 없는규칙: '알림' } })).status, 400);
    assert.equal((await s('GET', `${P}/rules`)).json.levels.teacher_overlap, '끔');
  });

  await t.test('교직원은 읽기만(쓰기는 404)', async () => {
    assert.equal((await s('GET', `${P}/loads`)).status, 200);
    assert.equal((await s('POST', `${P}/loads`, {})).status, 404);
    assert.equal((await s('POST', `${P}/classrooms`, { grade: 1, class_no: 1 })).status, 404);
  });
});
