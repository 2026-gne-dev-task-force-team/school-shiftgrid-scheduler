// 「다른 기관 ID 로 조회 → 404」 시험 틀. 이후 판마다 여기에 줄을 보태면 자동으로 돈다:
//   1) 기관 경계 표(CASES)에 「경로 · 허용 역할」 한 줄을 더한다
//   2) `npm test` 가 A 기관 세션으로 B 기관 자원을 두드려 전부 404 인지 본다
// DB 가 필요하다(DATABASE_URL). 없으면 건너뛴다(통과가 아니라 건너뜀).
import test from 'node:test';
import assert from 'node:assert/strict';
import argon2 from 'argon2';
import { can, PERMISSIONS } from '../server/permissions.js';

const HAS_DB = !!(process.env.DATABASE_URL || process.env.DATABASE_URL_FILE);

// 이후 판이 보태는 자리 — {orgId} {id} 는 시험이 채운다. 기관 B 의 실제 자원 id 를 {id} 로 쓴다.
const CASES = [
  { path: '/api/orgs/{orgB}/classrooms', note: '남의 기관 목록' },
  { path: '/api/orgs/{orgB}/classrooms/{classB}', note: '남의 기관 반 상세(URL 기관도 남의 것)' },
  { path: '/api/orgs/{orgA}/classrooms/{classB}', note: '내 기관 URL + 남의 기관 반 id' },
  // S-1a 명단 — method 를 적으면 GET 말고 그 방식으로 두드린다
  { path: '/api/orgs/{orgB}/roster', note: '남의 기관 명단' },
  { method: 'POST', path: '/api/orgs/{orgB}/roster', body: { name: 'x', loginId: 'x-roster', role: '교직원' }, note: '남의 기관에 사람 만들기' },
  { method: 'POST', path: '/api/orgs/{orgB}/roster/import', body: { rows: [{ name: 'x' }] }, note: '남의 기관에 명단 올리기' },
  { method: 'GET', path: '/api/orgs/{orgB}/roster/template', note: '남의 기관 양식' },
  { method: 'PATCH', path: '/api/orgs/{orgA}/roster/{memB}', body: { role: '보기만' }, note: '내 기관 URL + 남의 기관 명단 줄 고치기' },
  { method: 'POST', path: '/api/orgs/{orgA}/roster/{memB}/reset-password', note: '내 기관 URL + 남의 줄 비밀번호 초기화' },
  { method: 'POST', path: '/api/orgs/{orgA}/roster/{memB}/lock', note: '내 기관 URL + 남의 줄 잠금' },
  { method: 'POST', path: '/api/orgs/{orgA}/roster/{memB}/unlock', note: '내 기관 URL + 남의 줄 잠금 해제' },
  { path: '/api/orgs/{orgB}/subjects', note: 'S-1b 교과' },
  { path: '/api/orgs/{orgB}/special-rooms', note: 'S-1b 특별실' },
  { method: 'POST', path: '/api/orgs/{orgB}/subjects/preset-reload', note: 'S-1d 남의 기관 교과 프리셋 불러오기' },
  { path: '/api/orgs/{orgB}/specialists', note: 'S-1b 전담·비교과' },
  { path: '/api/orgs/{orgB}/school/periods', note: 'S-1b 교시·점심' },
  { path: '/api/orgs/{orgB}/term', note: 'S-1b 학기' },
  { path: '/api/orgs/{orgB}/loads', note: 'S-1b 시수표' },
  { path: '/api/orgs/{orgB}/loads/effective', note: 'S-1b 시수표 펼침' },
  { path: '/api/orgs/{orgB}/pins', note: 'S-1b 고정·금지' },
  { path: '/api/orgs/{orgB}/rules', note: 'S-1b 규칙 수위' },
  // S-1c 시간표 격자
  { path: '/api/orgs/{orgB}/timetables', note: 'S-1c 시간표 목록' },
  { method: 'POST', path: '/api/orgs/{orgB}/timetables', body: { name: 'x' }, note: 'S-1c 남의 기관에 시안 만들기' },
  { path: '/api/orgs/{orgA}/timetables/{ttB}', note: 'S-1c 내 기관 URL + 남의 시간표' },
  { method: 'PUT', path: '/api/orgs/{orgA}/timetables/{ttB}/cells', body: { classroom_id: 1, weekday: 1, period: 1, subject_id: null }, note: 'S-1c 내 기관 URL + 남의 시간표 칸 저장' },
  { path: '/api/orgs/{orgA}/timetables/{ttB}/mine', note: 'S-1c 내 기관 URL + 남의 시간표 내 칸' },
  // S-4a 근태·가중·소규모교
  { path: '/api/orgs/{orgB}/attendance?ym=2026-11', note: 'S-4a 남의 기관 근태 목록' },
  { path: '/api/orgs/{orgB}/attendance/summary?ym=2026-11', note: 'S-4a 남의 기관 월 집계' },
  { method: 'POST', path: '/api/orgs/{orgB}/attendance', body: { on_date: '2026-11-03', hours: 1 }, note: 'S-4a 남의 기관에 근태 쓰기' },
  { method: 'POST', path: '/api/orgs/{orgB}/attendance/close', body: { ym: '2026-11' }, note: 'S-4a 남의 기관 월 마감' },
  { method: 'DELETE', path: '/api/orgs/{orgB}/attendance/close/2026-11', note: 'S-4a 남의 기관 마감 풀기' },
  { method: 'PATCH', path: '/api/orgs/{orgA}/attendance/{attB}', body: { hours: 9 }, note: 'S-4a 내 기관 URL + 남의 근태 줄 고치기' },
  { method: 'DELETE', path: '/api/orgs/{orgA}/attendance/{attB}', note: 'S-4a 내 기관 URL + 남의 근태 줄 지우기' },
  { path: '/api/orgs/{orgB}/attendance/allowed', note: 'S-4a 남의 기관 허용 교과' },
  { path: '/api/orgs/{orgB}/soft-weights', note: 'S-4a 남의 기관 권장 가중' },
  { method: 'PUT', path: '/api/orgs/{orgB}/soft-weights', body: { weights: {} }, note: 'S-4a 남의 기관 가중 저장' },
  { method: 'PUT', path: '/api/orgs/{orgA}/soft-weights/tier', body: { membership_id: '{memB}', tier: 1 }, note: 'S-4a 내 기관 URL + 남의 사람 티어' },
  { path: '/api/orgs/{orgB}/small-school', note: 'S-4a 남의 기관 소규모교 설정' },
  // S-3 보결·특별실
  { path: '/api/orgs/{orgB}/substitutes', note: 'S-3 보결 목록' },
  { path: '/api/orgs/{orgB}/substitutes/fairness', note: 'S-3 형평성' },
  { method: 'POST', path: '/api/orgs/{orgB}/substitutes', body: { on_date: '2026-11-16', items: [{ period: 1 }] }, note: 'S-3 남의 기관에 보결 올리기' },
  { path: '/api/orgs/{orgA}/substitutes/{subB}/candidates', note: 'S-3 내 기관 URL + 남의 보결 후보' },
  { method: 'POST', path: '/api/orgs/{orgA}/substitutes/{subB}/take', note: 'S-3 내 기관 URL + 남의 보결 맡기' },
  { method: 'POST', path: '/api/orgs/{orgA}/substitutes/{subB}/assign', body: { outside_name: 'x' }, note: 'S-3 내 기관 URL + 남의 보결 강제 지정' },
  { method: 'POST', path: '/api/orgs/{orgA}/substitutes/{subB}/cancel', note: 'S-3 내 기관 URL + 남의 보결 취소' },
  { path: '/api/orgs/{orgB}/bookings', note: 'S-3 예약 목록' },
  { method: 'POST', path: '/api/orgs/{orgB}/bookings', body: { special_room_id: 1, on_date: '2026-11-16', period: 1 }, note: 'S-3 남의 기관에 예약' },
  { method: 'DELETE', path: '/api/orgs/{orgA}/bookings/{bkB}', note: 'S-3 내 기관 URL + 남의 예약 취소' },
  { path: '/api/orgs/{orgB}/room-locks', note: 'S-3 고정 칸 잠금' },
  { path: '/api/orgs/{orgB}/rooms/free?on_date=2026-11-16&period=1', note: 'S-3 빈 교실 찾기' },
  // S-2 자동 생성 · 시안 · 확정
  { path: '/api/orgs/{orgB}/gen/input', note: 'S-2 남의 기관 생성 재료' },
  { method: 'POST', path: '/api/orgs/{orgB}/timetables/generated', body: { name: 'x', cells: [] }, note: 'S-2 남의 기관에 생성 시안 저장' },
  { method: 'POST', path: '/api/orgs/{orgA}/timetables/generated', body: { name: 'x-gen', cells: [{ classroom_id: '{classB}', weekday: 1, period: 1 }] }, note: 'S-2 내 기관 URL + 남의 반 칸' },
  { method: 'POST', path: '/api/orgs/{orgA}/timetables/{ttB}/copy', body: { name: 'x' }, note: 'S-2 남의 시간표 복제' },
  { method: 'DELETE', path: '/api/orgs/{orgA}/timetables/{ttB}', note: 'S-2 남의 시간표 지우기' },
  { method: 'PATCH', path: '/api/orgs/{orgA}/timetables/{ttB}', body: { name: 'x' }, note: 'S-2 남의 시간표 이름 바꾸기' },
  { method: 'POST', path: '/api/orgs/{orgA}/timetables/{ttB}/confirm', body: { starts_on: '2026-09-01' }, note: 'S-2 남의 시간표 확정' },
  { method: 'POST', path: '/api/orgs/{orgA}/timetables/{ttB}/unconfirm', note: 'S-2 남의 시간표 확정 풀기' },
  { path: '/api/orgs/{orgA}/timetables/{ttB}/gen-info', note: 'S-2 남의 시간표 생성 정보' },
  // S-4b 출력 · 급식 벽시계 · 반 비교 · 담임 과목 취합본
  { path: '/api/orgs/{orgB}/export/targets', note: 'S-4b 남의 기관 출력 대상' },
  { path: '/api/orgs/{orgB}/export/settings', note: 'S-4b 남의 기관 출력 설정' },
  { method: 'PUT', path: '/api/orgs/{orgB}/export/settings', body: { lunchMinutes: 30 }, note: 'S-4b 남의 기관 출력 설정 저장' },
  { path: '/api/orgs/{orgA}/timetables/{ttB}/export.pdf', note: 'S-4b 내 기관 URL + 남의 시간표 PDF' },
  { path: '/api/orgs/{orgA}/timetables/{ttB}/export.xlsx', note: 'S-4b 내 기관 URL + 남의 시간표 엑셀' },
  { path: '/api/orgs/{orgA}/timetables/{ttB}/export.hwpx', note: 'S-4b 내 기관 URL + 남의 시간표 HWPX' },
  { path: '/api/orgs/{orgB}/timetables/{ttB}/export.pdf', note: 'S-4b 남의 기관 URL PDF' },
  { path: '/api/orgs/{orgB}/lunch-clock', note: 'S-4b 남의 기관 급식 벽시계' },
  { path: '/api/orgs/{orgA}/timetables/{ttB}/compare?a={classB}&b=1', note: 'S-4b 내 기관 URL + 남의 시간표 반 비교' },
  { path: '/api/orgs/{orgB}/homeroom-subjects/template', note: 'S-4b 남의 기관 담임 과목 양식' },
  { method: 'POST', path: '/api/orgs/{orgB}/homeroom-subjects/apply', body: { rows: [] }, note: 'S-4b 남의 기관 담임 과목 반영' },
];

// DB 없이도 도는 시험: 권한 표
test('권한 표: 시스템관리자는 기관 안 데이터 동작이 하나도 없다', () => {
  for (const [action, roles] of Object.entries(PERMISSIONS)) {
    if (action === 'org.manage') continue;
    assert.ok(!roles.includes('시스템관리자'), `${action} 에 시스템관리자가 있다`);
  }
  assert.equal(can('보기만', 'substitute.own'), false);
  assert.equal(can('기관관리자', 'timetable.edit'), true);
  assert.equal(can('교직원', 'nope'), false);
});

test('기관 경계: 다른 기관 ID 로 조회하면 404', { skip: !HAS_DB && 'DB 없음(DATABASE_URL) — 건너뜀' }, async (t) => {
  const { createPool } = await import('../server/db.js');
  const { migrate } = await import('../server/migrate.js');
  const { createApp } = await import('../server/app.js');
  const pool = createPool();
  await migrate(pool);
  const tag = `t${Date.now()}`;
  const hash = await argon2.hash('pw-test-1234');

  const mkOrg = async (name) => (await pool.query(`INSERT INTO org (name, kind) VALUES ($1, '초') RETURNING id`, [`${tag}-${name}`])).rows[0].id;
  const mkUser = async (orgId, loginId, role) => {
    const u = (await pool.query(`INSERT INTO app_user (name, login_id, password_hash, must_change_password) VALUES ($1, $2, $3, FALSE) RETURNING id`, [loginId, `${tag}-${loginId}`, hash])).rows[0].id;
    await pool.query(`INSERT INTO membership (org_id, user_id, role) VALUES ($1, $2, $3)`, [orgId, u, role]);
    return `${tag}-${loginId}`;
  };
  const orgA = await mkOrg('A');
  const orgB = await mkOrg('B');
  const adminA = await mkUser(orgA, 'adminA', '기관관리자');
  const adminB = await mkUser(orgB, 'adminB', '기관관리자');
  const memB = (await pool.query(`SELECT id FROM membership WHERE org_id = $1 LIMIT 1`, [orgB])).rows[0].id;
  const termB = (await pool.query(`INSERT INTO term (org_id, year, semester) VALUES ($1, 2026, 2) RETURNING id`, [orgB])).rows[0].id;
  const classB = (await pool.query(`INSERT INTO classroom (org_id, term_id, grade, class_no) VALUES ($1, $2, 3, 1) RETURNING id`, [orgB, termB])).rows[0].id;

  const ttB = (await pool.query(`INSERT INTO timetable (org_id, term_id, name) VALUES ($1, $2, 'x') RETURNING id`, [orgB, termB])).rows[0].id;
  // S-3: 남의 기관 보결·예약 한 건씩
  const subB = (await pool.query(`INSERT INTO substitute (org_id, term_id, absent_membership_id, on_date, period) VALUES ($1, $2, $3, '2026-11-16', 1) RETURNING id`, [orgB, termB, memB])).rows[0].id;
  const roomB = (await pool.query(`INSERT INTO special_room (org_id, name) VALUES ($1, 'r') RETURNING id`, [orgB])).rows[0].id;
  const bkB = (await pool.query(`INSERT INTO booking (org_id, special_room_id, on_date, period, membership_id) VALUES ($1, $2, '2026-11-16', 1, $3) RETURNING id`, [orgB, roomB, memB])).rows[0].id;

  const attB = (await pool.query(`INSERT INTO attendance (org_id, term_id, membership_id, on_date, hours) VALUES ($1,$2,$3,'2026-11-03',1) RETURNING id`, [orgB, termB, memB])).rows[0].id;

  const app = createApp(pool, { testMode: true, cookieSecure: false, loginLimit: 1000, apiLimit: 10000 });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.close();
    await pool.query(`DELETE FROM attendance WHERE org_id = ANY($1)`, [[orgA, orgB]]);
    await pool.query(`DELETE FROM booking WHERE org_id = ANY($1)`, [[orgA, orgB]]);
    await pool.query(`DELETE FROM substitute WHERE org_id = ANY($1)`, [[orgA, orgB]]);
    await pool.query(`DELETE FROM special_room WHERE org_id = ANY($1)`, [[orgA, orgB]]);
    await pool.query(`DELETE FROM cell WHERE org_id = ANY($1)`, [[orgA, orgB]]);
    await pool.query(`DELETE FROM timetable WHERE org_id = ANY($1)`, [[orgA, orgB]]);
    await pool.query(`DELETE FROM classroom WHERE org_id = ANY($1)`, [[orgA, orgB]]);
    await pool.query(`DELETE FROM term WHERE org_id = ANY($1)`, [[orgA, orgB]]);
    await pool.query(`DELETE FROM audit_log WHERE org_id = ANY($1)`, [[orgA, orgB]]);
    await pool.query(`DELETE FROM membership WHERE org_id = ANY($1)`, [[orgA, orgB]]);
    await pool.query(`DELETE FROM app_user WHERE login_id LIKE $1`, [`${tag}-%`]);
    await pool.query(`DELETE FROM org WHERE id = ANY($1)`, [[orgA, orgB]]);
    await pool.end();
  });

  // 쿠키를 들고 다니는 작은 클라이언트
  const client = () => {
    let cookie = '';
    let csrf = '';
    const call = async (method, path, body) => {
      const res = await fetch(base + path, {
        method,
        headers: { 'content-type': 'application/json', cookie, 'x-csrf-token': csrf },
        body: body ? JSON.stringify(body) : undefined,
      });
      const sc = res.headers.getSetCookie?.() ?? [];
      if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
      const json = await res.json().catch(() => null);
      if (json?.csrf) csrf = json.csrf;
      return { status: res.status, json };
    };
    return { call, login: async (orgId, loginId) => { await call('GET', '/api/auth/session'); return call('POST', '/api/auth/login', { orgId, loginId, password: 'pw-test-1234' }); } };
  };
  const fill = (s) => s.replace('{orgA}', orgA).replace('{orgB}', orgB).replace('{classB}', classB).replace('{memB}', memB).replace('{ttB}', ttB).replace('{subB}', subB).replace('{bkB}', bkB).replace('{attB}', attB);

  await t.test('로그인 실패는 ID 없음/비번 틀림이 같은 말', async () => {
    const c = client();
    await c.call('GET', '/api/auth/session');
    const a = await c.call('POST', '/api/auth/login', { orgId: orgA, loginId: 'nobody', password: 'x' });
    const b = await c.call('POST', '/api/auth/login', { orgId: orgA, loginId: adminA, password: 'wrong' });
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.equal(a.json.error, b.json.error);
  });

  await t.test('CSRF 토큰 없이 POST 하면 403', async () => {
    const res = await fetch(base + '/api/auth/logout', { method: 'POST' });
    assert.equal(res.status, 403);
  });

  await t.test('A 기관 관리자: 내 기관은 200, 남의 기관 자원은 전부 404', async () => {
    const a = client();
    const l = await a.login(orgA, adminA);
    assert.equal(l.status, 200);
    assert.equal((await a.call('GET', `/api/orgs/${orgA}/classrooms`)).status, 200);
    for (const c of CASES) {
      const r = await a.call(c.method || 'GET', fill(c.path), c.body && JSON.parse(fill(JSON.stringify(c.body))));
      assert.equal(r.status, 404, `${c.note}: ${c.path} → ${r.status}`);
    }
  });

  await t.test('B 기관 관리자는 자기 반을 본다(404 가 항상 나오는 게 아님을 확인)', async () => {
    const b = client();
    assert.equal((await b.login(orgB, adminB)).status, 200);
    assert.equal((await b.call('GET', `/api/orgs/${orgB}/classrooms/${classB}`)).status, 200);
  });

  await t.test('기관 선택이 틀리면 로그인 자체가 안 된다(A 사람이 B 로 로그인)', async () => {
    const c = client();
    const r = await c.login(orgB, adminA);
    assert.equal(r.status, 401);
  });

  await t.test('로그인 안 한 요청은 404/401', async () => {
    const r = await client().call('GET', `/api/orgs/${orgB}/classrooms`);
    assert.equal(r.status, 404);
  });
});
