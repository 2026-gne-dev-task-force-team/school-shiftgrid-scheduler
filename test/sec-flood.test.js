// S-sec 5: 요청 폭주 — 로그인 IP 제한 · API 제한 · 계정 실패 잠금 · 큰 본문(수 MB) 거부 · 깊은 JSON.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HAS_DB, setup, PW } from './sec-helpers.js';

test('요청 폭주', { skip: !HAS_DB && 'DB 없음' }, async (t) => {
  const f = await setup(t);
  const oA = `/api/orgs/${f.orgA}`;

  await t.test('로그인 IP 제한: 한도 넘으면 429(맞는 비번이어도)', async () => {
    const { createApp } = await import('../server/app.js');
    const app = createApp(f.pool, { testMode: true, cookieSecure: false, loginLimit: 5, apiLimit: 30 });
    const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
    t.after(() => server.close());
    const base = `http://127.0.0.1:${server.address().port}`;
    const s = await fetch(base + '/api/auth/session');
    const cookie = s.headers.getSetCookie()[0].split(';')[0];
    const csrf = (await s.json()).csrf;
    const login = (password) => fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', cookie, 'x-csrf-token': csrf }, body: JSON.stringify({ orgId: f.orgA, loginId: f.users.staffA.loginId, password }) });
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await login('wrong')).status);
    assert.deepEqual(codes, [401, 401, 401, 401, 401]);
    assert.equal((await login(PW)).status, 429);
    // API 전체 제한(30/분) — 세션 조회를 몰아친다
    const many = await Promise.all(Array.from({ length: 40 }, () => fetch(base + '/api/auth/orgs').then((r) => r.status)));
    assert.ok(many.includes(429), `429 없음: ${many.join(',')}`);
  });

  await t.test('비번 바꾸기 IP 제한: 성공은 세지 않고 실패만 센다', async () => {
    const { createApp } = await import('../server/app.js');
    const app = createApp(f.pool, { testMode: true, cookieSecure: false, loginLimit: 3, apiLimit: 1000 });
    const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
    t.after(() => server.close());
    const base = `http://127.0.0.1:${server.address().port}`;
    const s = await fetch(base + '/api/auth/session');
    let cookie = s.headers.getSetCookie()[0].split(';')[0];
    let csrf = (await s.json()).csrf;
    const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', cookie, 'x-csrf-token': csrf }, body: JSON.stringify(body) });
    const lg = await post('/api/auth/login', { orgId: f.orgA, loginId: f.users.dual.loginId, password: PW });
    assert.equal(lg.status, 200);
    const nc = lg.headers.getSetCookie()[0];
    if (nc) cookie = nc.split(';')[0];
    csrf = (await (await fetch(base + '/api/auth/session', { headers: { cookie } })).json()).csrf;
    const pws = [PW, 'flood-pass-1a2b', 'flood-pass-3c4d', 'flood-pass-5e6f', 'flood-pass-7g8h', 'flood-pass-9i0j'];
    for (let i = 0; i < 5; i++) assert.equal((await post('/api/auth/password', { current: pws[i], next: pws[i + 1] })).status, 200, `성공 ${i}`);
    const bad = [];
    for (let i = 0; i < 4; i++) bad.push((await post('/api/auth/password', { current: 'wrong-wrong-1', next: 'flood-pass-zzzz1' })).status);
    assert.equal(bad[3], 429, `실패 4번째는 429: ${bad.join(',')}`);
    assert.notEqual(bad[0], 429);
  });

  await t.test('계정 실패 10회 → 맞는 비번도 15분 잠금, 관리자가 풀면 다시 된다', async () => {
    const c = f.client();
    await c.call('GET', '/api/auth/session');
    for (let i = 0; i < 10; i++) assert.equal((await c.call('POST', '/api/auth/login', { orgId: f.orgA, loginId: f.users.viewA.loginId, password: 'wrong' })).status, 401);
    assert.equal((await c.login('viewA')).status, 401);
    const admin = await f.as('adminA');
    assert.equal((await admin.call('POST', `${oA}/roster/${f.users.viewA.mid}/unlock`)).status, 200);
    assert.equal((await f.client().login('viewA')).status, 200);
  });

  await t.test('큰 본문 거부: JSON 5MB·1.5MB → 413, 엑셀 올리기 3MB·6MB → 413, 서버는 계속 산다', async () => {
    const a = await f.as('adminA');
    const big = (n) => JSON.stringify({ name: 'x'.repeat(n) });
    assert.equal((await a.call('POST', `${oA}/subjects`, big(5 * 1024 * 1024))).status, 413);
    assert.equal((await a.call('POST', `${oA}/subjects`, big(1.5 * 1024 * 1024))).status, 413);
    assert.equal((await a.call('POST', '/api/auth/login', big(5 * 1024 * 1024))).status, 413);
    const bin = { 'content-type': 'application/octet-stream' };
    assert.equal((await a.call('POST', `${oA}/roster/import/preview`, Buffer.alloc(3 * 1024 * 1024, 1), bin)).status, 413);
    assert.equal((await a.call('POST', `${oA}/homeroom-subjects/preview`, Buffer.alloc(6 * 1024 * 1024, 1), bin)).status, 413);
    // 큰 배열(줄 수 상한)
    const rows = Array.from({ length: 1001 }, (_, i) => ({ name: `n${i}` }));
    assert.equal((await a.call('POST', `${oA}/roster/import`, { rows })).status, 400);
    const cells = Array.from({ length: 5001 }, () => ({ classroom_id: f.A.class, weekday: 1, period: 1 }));
    assert.equal((await a.call('POST', `${oA}/timetables/generated`, { name: 'big', cells })).status, 400);
    assert.equal((await a.call('GET', `${oA}/classrooms`)).status, 200);
  });

  await t.test('아주 깊은 JSON → 4xx(죽지 않음)', async () => {
    const a = await f.as('adminA');
    const deep = '['.repeat(100_000) + ']'.repeat(100_000);
    const r = await a.call('POST', `${oA}/subjects`, deep);
    assert.ok(r.status >= 400 && r.status < 500, `→ ${r.status}`);
    const obj = '{"a":'.repeat(50_000) + '1' + '}'.repeat(50_000);
    const r2 = await a.call('POST', `${oA}/subjects`, obj);
    assert.ok(r2.status >= 400 && r2.status < 500, `→ ${r2.status}`);
    assert.equal((await a.call('GET', `${oA}/classrooms`)).status, 200);
  });
});
