// S-sec 1: 다른 기관 ID 로 「모든」 API 경로 — server/routes/*.js 를 긁어 경로 목록을 만들고 전부 두드린다.
// 손으로 적는 org-boundary CASES 와 달리 새 경로가 생기면 저절로 들어온다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HAS_DB, setup, routeList } from './sec-helpers.js';

const here = path.dirname(fileURLToPath(import.meta.url));

test('경로 목록: 긁은 경로 수가 0 이 아니고 기관 경로가 대부분이다', () => {
  const list = routeList();
  assert.ok(list.length > 100, `경로 ${list.length}개`);
  assert.ok(list.filter((r) => r.path.startsWith('/api/orgs/')).length > 90);
});

test('기관 경계(전 경로): A 세션으로 B 기관·B 자원을 두드리면 전부 404, B 자료는 그대로', { skip: !HAS_DB && 'DB 없음' }, async (t) => {
  const f = await setup(t);
  const { B, A } = f;
  const list = routeList();

  // :param → B 자원 id(파일·경로에 따라)
  const idFor = (r, name) => {
    if (name === 'orgId') return null;
    if (name === 'tid') return B.tt;
    if (name === 'sid') return B.sub;
    if (name === 'bid') return B.booking;
    if (name === 'lid') return B.lock;
    if (name === 'mid') return B.mem;
    if (name === 'ym') return '2026-11';
    if (name === 'fmt') return 'pdf';
    if (name === 'id') {
      if (r.file === 'attendance.js') return B.att;
      if (r.file === 'loads.js') return B.load;
      if (r.file === 'pins.js') return B.pin;
      if (r.path.includes('/subjects/')) return B.subject;
      if (r.path.includes('/special-rooms/')) return B.room;
      if (r.path.includes('/classrooms/')) return B.class;
      if (r.file === 'admin.js') return f.orgB;
    }
    throw new Error(`모르는 매개변수 ${name} (${r.method} ${r.path}) — 이 시험의 idFor 에 더할 것`);
  };
  const BODY = {
    'PATCH /attendance/:id': { hours: 2 },
    'PATCH /classrooms/:id': { student_count: 5 },
    'PATCH /subjects/:id': { name: 'x' },
    'PATCH /special-rooms/:id': { name: 'x' },
    'PATCH /loads/:id': { weekly_hours: 3 },
    'PATCH /specialists/:mid': { duty: null },
    'PATCH /:mid': { role: '보기만' },
    'PUT /timetables/:tid/cells': { classroom_id: A.class, weekday: 1, period: 1, subject_id: null },
    'POST /timetables/:tid/copy': { name: 'x' },
    'POST /timetables/:tid/confirm': { starts_on: '2026-09-01' },
    'PATCH /timetables/:tid': { name: 'x' },
    'POST /substitutes/:sid/assign': { outside_name: 'x' },
  };
  const QUERY = { '/timetables/:tid/compare': `?a=${B.class}&b=${B.class}` };
  const sub = (r) => r.path.replace(/^\/api\/(orgs\/:orgId(\/roster)?|admin|auth)/, '') || '/';

  const a = await f.as('adminA');
  let hit = 0;
  const fails = [];
  for (const r of list) {
    if (r.file === 'auth.js') continue; // 로그인 전 경로 — 기관 자원 없음
    const s = sub(r);
    const body = BODY[`${r.method} ${s}`];
    const query = QUERY[s] ?? '';
    const names = [...r.path.matchAll(/:(\w+)/g)].map((m) => m[1]);
    const fill = (orgId) => r.path.replace(/:(\w+)/g, (_, n) => (n === 'orgId' ? orgId : idFor(r, n))) + query;
    const tries = [];
    if (r.file === 'admin.js') tries.push(fill(f.orgB)); // 기관 관리자는 교육청 경로 자체가 없다
    else {
      tries.push(fill(f.orgB)); // URL 기관이 남의 것
      if (names.some((n) => !['orgId', 'ym', 'fmt'].includes(n))) tries.push(fill(f.orgA)); // 내 기관 URL + 남의 자원 id
    }
    for (const url of tries) {
      const res = await a.call(r.method, url, body ?? (r.method === 'GET' || r.method === 'DELETE' ? undefined : {}));
      hit++;
      if (res.status !== 404) fails.push(`${r.method} ${url} → ${res.status}`);
    }
  }

  // 본문에 남의 자원 id 를 끼운 경우(URL 은 내 기관)
  const oA = `/api/orgs/${f.orgA}`;
  const cellB = (k, v) => ({ classroom_id: A.class, weekday: 1, period: 1, [k]: v });
  const BODY_CASES = [
    ['POST', `${oA}/loads`, { membership_id: B.mem }],
    ['POST', `${oA}/loads`, { subject_id: B.subject }],
    ['POST', `${oA}/loads`, { classroom_id: B.class }],
    ['POST', `${oA}/loads`, { special_room_id: B.room }],
    ['POST', `${oA}/pins`, { target_kind: '반', target_id: B.class, weekday: 1, period: 1, kind: '금지' }],
    ['POST', `${oA}/pins`, { target_kind: '교사', target_id: B.mem, weekday: 1, period: 1, kind: '금지' }],
    ['POST', `${oA}/pins`, { target_kind: '특별실', target_id: B.room, weekday: 1, period: 1, kind: '금지' }],
    ['POST', `${oA}/pins`, { target_kind: '반', target_id: A.class, weekday: 1, period: 1, kind: '고정', subject_id: B.subject }],
    ['PUT', `${oA}/timetables/${A.tt}/cells`, { classroom_id: B.class, weekday: 1, period: 1, subject_id: null }],
    ['PUT', `${oA}/timetables/${A.tt}/cells`, cellB('subject_id', B.subject)],
    ['PUT', `${oA}/timetables/${A.tt}/cells`, cellB('membership_id', B.mem)],
    ['PUT', `${oA}/timetables/${A.tt}/cells`, cellB('special_room_id', B.room)],
    ['POST', `${oA}/timetables/generated`, { name: 'x-g1', cells: [cellB('subject_id', B.subject)] }],
    ['POST', `${oA}/timetables/generated`, { name: 'x-g2', cells: [cellB('membership_id', B.mem)] }],
    ['POST', `${oA}/timetables/generated`, { name: 'x-g3', cells: [cellB('special_room_id', B.room)] }],
    ['PATCH', `${oA}/classrooms/${A.class}`, { homeroom_membership_id: B.mem }],
    ['POST', `${oA}/bookings`, { special_room_id: B.room, on_date: '2026-11-17', period: 1 }],
    ['POST', `${oA}/bookings`, { special_room_id: A.room, on_date: '2026-11-17', period: 2, classroom_id: B.class }],
    ['POST', `${oA}/room-locks`, { special_room_id: B.room, weekday: 1, period: 1 }],
    ['POST', `${oA}/substitutes`, { on_date: '2026-11-17', absent_membership_id: B.mem, items: [{ period: 1 }] }],
    ['POST', `${oA}/substitutes`, { on_date: '2026-11-17', items: [{ period: 1, classroom_id: B.class }] }],
    ['POST', `${oA}/substitutes/${A.sub}/assign`, { membership_id: B.mem }],
    ['POST', `${oA}/attendance`, { membership_id: B.mem, on_date: '2026-11-04', hours: 1 }],
    ['GET', `${oA}/attendance/allowed?membership_id=${B.mem}`],
    ['PUT', `${oA}/attendance/allowed`, { membership_id: B.mem, subject_ids: [] }],
    ['PUT', `${oA}/attendance/allowed`, { membership_id: f.users.adminA.mid, subject_ids: [B.subject] }],
    ['PUT', `${oA}/soft-weights/tier`, { membership_id: B.mem, tier: 1 }],
    ['PUT', `${oA}/small-school`, { enabled: true, homeroom_subject_ids: [B.subject], combined: [] }],
    ['PUT', `${oA}/small-school`, { enabled: true, homeroom_subject_ids: [], combined: [{ name: 'x', classroom_ids: [A.class, B.class] }] }],
  ];
  for (const [m, url, body] of BODY_CASES) {
    const res = await a.call(m, url, body);
    hit++;
    if (res.status !== 404) fails.push(`${m} ${url} ${JSON.stringify(body)} → ${res.status}`);
  }
  // 담임 과목 반영은 남의 반 줄을 「건너뛴」다(거부 대신 skipped)
  const hs = await a.call('POST', `${oA}/homeroom-subjects/apply`, { rows: [{ classroom_id: B.class, subject_id: A.subject, hours: 1 }] });
  assert.equal(hs.status, 200);
  assert.equal(hs.json.applied, 0);

  t.diagnostic(`두드린 요청 ${hit}개 · 경로 ${list.length}개`);
  assert.deepEqual(fails, [], `404 가 아닌 것 ${fails.length}개`);

  // B 자료가 그대로인가
  const one = async (sql, id) => (await f.pool.query(sql, [id])).rows[0];
  assert.deepEqual(await one(`SELECT name, status FROM timetable WHERE id = $1`, B.tt), { name: 'B시간표', status: '시안' });
  assert.equal((await one(`SELECT status FROM substitute WHERE id = $1`, B.sub)).status, '열림');
  assert.equal((await one(`SELECT deleted_at FROM booking WHERE id = $1`, B.booking)).deleted_at, null);
  assert.equal((await one(`SELECT deleted_at FROM room_lock WHERE id = $1`, B.lock)).deleted_at, null);
  assert.equal(Number((await one(`SELECT hours FROM attendance WHERE id = $1`, B.att)).hours), 1);
  assert.equal((await one(`SELECT role FROM membership WHERE id = $1`, B.mem)).role, '기관관리자');
  assert.equal((await one(`SELECT weekly_hours FROM teaching_load WHERE id = $1`, B.load)).weekly_hours, 2);
  assert.equal((await one(`SELECT deleted_at FROM pin WHERE id = $1`, B.pin)).deleted_at, null);
  assert.equal((await one(`SELECT tier FROM membership WHERE id = $1`, B.mem)).tier, null);
  assert.equal((await one(`SELECT count(*)::int AS n FROM cell WHERE classroom_id = $1`, B.class)).n, 0);
});

test('org-boundary CASES 대비 빠진 경로 수(참고 · 위 시험이 전부 덮는다)', () => {
  const src = fs.readFileSync(path.join(here, 'org-boundary.test.js'), 'utf8');
  const norm = (m, p) => `${m} ${p.split('?')[0].replace(/\{orgA\}|\{orgB\}|:orgId/g, 'O').replace(/\{\w+\}|:\w+/g, '*').replace(/export\.\w+$/, 'export.*')}`;
  const covered = new Set();
  for (const m of src.matchAll(/\{\s*(?:method:\s*'(\w+)',\s*)?path:\s*'([^']+)'/g)) covered.add(norm(m[1] || 'GET', m[2]));
  const missing = routeList().filter((r) => r.file !== 'auth.js' && !covered.has(norm(r.method, r.path)));
  test.diagnostic?.(`CASES 에 없던 경로 ${missing.length}개`);
  console.log(`[S-sec] org-boundary CASES 에 없던 경로 ${missing.length}개 / 전체 ${routeList().filter((r) => r.file !== 'auth.js').length}개`);
  assert.ok(missing.length >= 0);
});
