// S-sec 2: 권한 상승 — 보기만·교직원이 관리자 전용 경로를 두드리기 · 시스템 관리자가 기관 안 데이터 보기 ·
// 겸임 계정이 한 기관 역할로 다른 기관 권한 얻기.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HAS_DB, setup, routeList } from './sec-helpers.js';

test('권한 상승', { skip: !HAS_DB && 'DB 없음' }, async (t) => {
  const f = await setup(t);
  const { A } = f;
  const oA = `/api/orgs/${f.orgA}`;
  const u = f.users;

  // 관리자 전용(기관 안) — 교직원·보기만은 전부 404
  const ADMIN_ONLY = [
    ['GET', `${oA}/roster`],
    ['POST', `${oA}/roster`, { name: 'x', loginId: `${f.tag}-new`, role: '기관관리자' }],
    ['PATCH', `${oA}/roster/${u.staffA.mid}`, { role: '기관관리자' }],
    ['POST', `${oA}/roster/${u.adminA.mid}/reset-password`],
    ['POST', `${oA}/roster/${u.adminA.mid}/lock`],
    ['POST', `${oA}/roster/${u.staffA.mid}/unlock`],
    ['GET', `${oA}/roster/template`],
    ['POST', `${oA}/roster/import`, { rows: [{ name: 'x', loginId: `${f.tag}-imp`, role: '기관관리자' }] }],
    ['PUT', `${oA}/school/periods`, {}],
    ['POST', `${oA}/classrooms`, { grade: 2, class_no: 1 }],
    ['POST', `${oA}/subjects`, { name: 'x' }],
    ['PUT', `${oA}/rules`, { levels: {} }],
    ['POST', `${oA}/timetables`, { name: 'x' }],
    ['PUT', `${oA}/timetables/${A.tt}/cells`, { classroom_id: A.class, weekday: 1, period: 1, subject_id: A.subject }],
    ['POST', `${oA}/timetables/${A.tt}/confirm`, { starts_on: '2026-09-01' }],
    ['POST', `${oA}/timetables/${A.tt}/unconfirm`],
    ['PATCH', `${oA}/timetables/${A.tt}`, { name: 'hacked' }],
    ['DELETE', `${oA}/timetables/${A.tt}`],
    ['POST', `${oA}/timetables/${A.tt}/copy`, { name: 'x' }],
    ['GET', `${oA}/gen/input`],
    ['POST', `${oA}/timetables/generated`, { name: 'x', cells: [] }],
    ['POST', `${oA}/loads`, { weekly_hours: 1 }],
    ['POST', `${oA}/pins`, { target_kind: '반', target_id: A.class, weekday: 1, period: 1, kind: '금지' }],
    ['POST', `${oA}/substitutes/${A.sub}/assign`, { outside_name: 'x' }],
    ['POST', `${oA}/room-locks`, { special_room_id: A.room, weekday: 1, period: 1 }],
    ['POST', `${oA}/attendance/close`, { ym: '2026-11' }],
    ['DELETE', `${oA}/attendance/close/2026-11`],
    ['PUT', `${oA}/attendance/allowed`, { membership_id: u.staffA.mid, subject_ids: [] }],
    ['PUT', `${oA}/soft-weights`, { weights: {} }],
    ['PUT', `${oA}/soft-weights/tier`, { membership_id: u.staffA.mid, tier: 1 }],
    ['PUT', `${oA}/small-school`, { enabled: true, homeroom_subject_ids: [], combined: [] }],
    ['PUT', `${oA}/export/settings`, { lunchMinutes: 30 }],
    ['POST', `${oA}/homeroom-subjects/apply`, { rows: [] }],
    ['PATCH', `${oA}/specialists/${u.staffA.mid}`, { duty: '담임' }],
    ['GET', '/api/admin/orgs'],
    ['POST', '/api/admin/orgs', { name: `${f.tag}-evil`, kind: '초' }],
    ['POST', `/api/admin/orgs/${f.orgA}/reset-password`, { userId: u.adminA.uid }],
  ];
  // 보기만은 「내 것」 동작도 없다
  const OWN_ONLY = [
    ['POST', `${oA}/substitutes`, { on_date: '2026-11-17', items: [{ period: 1 }] }],
    ['POST', `${oA}/bookings`, { special_room_id: A.room, on_date: '2026-11-17', period: 1 }],
    ['POST', `${oA}/attendance`, { on_date: '2026-11-04', hours: 1 }],
    ['POST', `${oA}/substitutes/${A.sub}/take`],
  ];

  await t.test('교직원·보기만 → 관리자 전용 경로 전부 404', async () => {
    for (const who of ['staffA', 'viewA']) {
      const c = await f.as(who);
      const list = who === 'viewA' ? [...ADMIN_ONLY, ...OWN_ONLY] : ADMIN_ONLY;
      const bad = [];
      for (const [m, p, b] of list) {
        const r = await c.call(m, p, b);
        if (r.status !== 404) bad.push(`${who} ${m} ${p} → ${r.status}`);
      }
      assert.deepEqual(bad, []);
    }
    const tt = (await f.pool.query(`SELECT name, status, deleted_at FROM timetable WHERE id = $1`, [A.tt])).rows[0];
    assert.deepEqual(tt, { name: 'A시간표', status: '시안', deleted_at: null });
    assert.equal((await f.pool.query(`SELECT role FROM membership WHERE id = $1`, [u.staffA.mid])).rows[0].role, '교직원');
  });

  await t.test('교직원 → 남의 것(관리자의 결강) 취소·남을 결강으로 올리기·남의 근태 쓰기는 404', async () => {
    const c = await f.as('staffA');
    assert.equal((await c.call('POST', `${oA}/substitutes/${A.sub}/cancel`)).status, 404);
    assert.equal((await c.call('POST', `${oA}/substitutes`, { on_date: '2026-11-18', absent_membership_id: Number(u.adminA.mid), items: [{ period: 2 }] })).status, 404);
    assert.equal((await c.call('POST', `${oA}/attendance`, { membership_id: Number(u.adminA.mid), on_date: '2026-11-05', hours: 1 })).status, 404);
    assert.equal((await f.pool.query(`SELECT status FROM substitute WHERE id = $1`, [A.sub])).rows[0].status, '열림');
  });

  await t.test('관리자도 역할을 시스템관리자로 올릴 수 없다', async () => {
    const c = await f.as('adminA');
    assert.equal((await c.call('PATCH', `${oA}/roster/${u.staffA.mid}`, { role: '시스템관리자' })).status, 400);
    assert.equal((await c.call('POST', `${oA}/roster`, { name: 'x', loginId: `${f.tag}-sys2`, role: '시스템관리자' })).status, 400);
    const imp = await c.call('POST', `${oA}/roster/import`, { rows: [{ name: 'x', loginId: `${f.tag}-sys3`, role: '시스템관리자' }] });
    assert.equal(imp.json.made, 0);
    assert.equal((await c.call('GET', '/api/admin/orgs')).status, 404);
  });

  await t.test('시스템 관리자 → 기관 안 경로 전부 404(교육청·A 기관 모두)', async () => {
    const c = await f.as('sys');
    const bad = [];
    for (const r of routeList().filter((x) => x.path.startsWith('/api/orgs/'))) {
      for (const org of [f.orgEdu, f.orgA]) {
        const p = r.path.replace(':orgId', org).replace(/:(\w+)/g, (_, n) => (n === 'ym' ? '2026-11' : n === 'fmt' ? 'pdf' : n === 'tid' ? A.tt : n === 'sid' ? A.sub : n === 'mid' ? u.staffA.mid : A.class));
        const res = await c.call(r.method, p, r.method === 'GET' || r.method === 'DELETE' ? undefined : {});
        if (res.status !== 404) bad.push(`${r.method} ${p} → ${res.status}`);
      }
    }
    assert.deepEqual(bad, []);
    // 관리자 목록은 이름·ID·상태만
    const adm = await c.call('GET', `/api/admin/orgs/${f.orgA}/admins`);
    assert.equal(adm.status, 200);
    for (const row of adm.json) assert.deepEqual(Object.keys(row).sort(), ['loginId', 'mustChange', 'name', 'status', 'userId']);
  });

  await t.test('겸임(A 교직원 · B 관리자): A 로 로그인하면 A 관리자 경로도 B 경로도 404, B 로 로그인하면 B 만', async () => {
    const ca = await f.as('dual', f.orgA);
    assert.equal((await ca.call('GET', `${oA}/roster`)).status, 404);
    assert.equal((await ca.call('GET', `/api/orgs/${f.orgB}/roster`)).status, 404);
    assert.equal((await ca.call('GET', `/api/orgs/${f.orgB}/classrooms`)).status, 404);
    const cb = await f.as('dual', f.orgB);
    assert.equal((await cb.call('GET', `/api/orgs/${f.orgB}/roster`)).status, 200);
    assert.equal((await cb.call('GET', `${oA}/roster`)).status, 404);
    assert.equal((await cb.call('GET', `${oA}/classrooms`)).status, 404);
  });

  await t.test('겸임 계정을 A 관리자가 건드려 B 권한을 얻을 수 없다(비번 초기화·잠금·풀기·ID 바꾸기)', async () => {
    const c = await f.as('adminA');
    const mid = u.dual.mid;
    const reset = await c.call('POST', `${oA}/roster/${mid}/reset-password`);
    assert.equal(reset.status, 409, `A 관리자가 겸임 계정 비번을 초기화했다(${reset.status}) — 임시 비번으로 B 관리자 로그인 가능`);
    assert.equal((await c.call('POST', `${oA}/roster/${mid}/lock`)).status, 409);
    assert.equal((await c.call('POST', `${oA}/roster/${mid}/unlock`)).status, 409);
    assert.equal((await c.call('PATCH', `${oA}/roster/${mid}`, { loginId: `${f.tag}-dual-renamed` })).status, 409);
    // A 안에서만 닿는 것(역할·숨김)은 된다
    assert.equal((await c.call('PATCH', `${oA}/roster/${mid}`, { role: '보기만' })).status, 200);
    // 겸임 본인은 원래 비번으로 B 관리자 그대로
    const cb = await f.as('dual', f.orgB);
    assert.equal((await cb.call('GET', `/api/orgs/${f.orgB}/roster`)).status, 200);
  });
});
