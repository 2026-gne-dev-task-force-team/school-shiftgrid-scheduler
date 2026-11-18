// S-sec 3: 세션 고정·끊기 — 로그인 전후 세션 id 가 바뀌는가 · 로그아웃·비번 변경·초기화·역할 내림·잠금·기관 중지 뒤 옛 쿠키가 죽는가.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HAS_DB, setup, PW } from './sec-helpers.js';

const NEW_PW = 'Zq9-sec-uniq-pass';

test('세션', { skip: !HAS_DB && 'DB 없음' }, async (t) => {
  const f = await setup(t);
  const oA = `/api/orgs/${f.orgA}`;
  const alive = async (c) => (await c.call('GET', `${oA}/classrooms`)).status === 200;
  const withCookie = (cookie) => { const c = f.client(); c.cookie = cookie; return c; };

  await t.test('로그인 전 세션 id 는 로그인 뒤 버려진다(세션 고정 막음) · 쿠키 HttpOnly·SameSite', async () => {
    const c = f.client();
    const res = await fetch(f.base + '/api/auth/session');
    const pre = res.headers.getSetCookie()[0];
    assert.match(pre, /HttpOnly/i);
    assert.match(pre, /SameSite=Lax/i);
    c.cookie = pre.split(';')[0];
    c.csrf = (await res.json()).csrf;
    const before = c.cookie;
    const l = await c.call('POST', '/api/auth/login', { orgId: f.orgA, loginId: f.users.staffA.loginId, password: PW });
    assert.equal(l.status, 200);
    assert.notEqual(c.cookie, before, '로그인 뒤에도 같은 세션 id');
    // 공격자가 심어 둔 옛 id 로는 로그인 상태가 아니다
    const old = withCookie(before);
    assert.equal((await old.call('GET', '/api/auth/session')).json.user, null);
    assert.equal(await alive(old), false);
    assert.equal(await alive(c), true);
  });

  await t.test('위조 쿠키·남의 CSRF 토큰은 안 먹힌다', async () => {
    const forged = withCookie('sid=s%3Aforged.forged');
    assert.equal((await forged.call('GET', '/api/auth/session')).json.user, null);
    const a = await f.as('staffA');
    const b = await f.as('viewA');
    const swapped = withCookie(a.cookie);
    swapped.csrf = b.csrf;
    assert.equal((await swapped.call('POST', '/api/auth/logout-others')).status, 403);
  });

  await t.test('로그아웃 뒤 옛 쿠키는 죽는다', async () => {
    const c = await f.as('staffA');
    const saved = c.cookie;
    assert.equal((await c.call('POST', '/api/auth/logout')).status, 200);
    assert.equal(await alive(withCookie(saved)), false);
  });

  await t.test('비번 변경 → 내 다른 세션은 죽고 지금 세션만 산다 · 옛 비번 로그인 실패', async () => {
    const c1 = await f.as('staffA');
    const c2 = await f.as('staffA');
    const r = await c1.call('POST', '/api/auth/password', { current: PW, next: NEW_PW });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(await alive(c2), false);
    assert.equal(await alive(c1), true);
    assert.equal((await f.client().login('staffA')).status, 401);
    assert.equal((await f.client().login('staffA', f.orgA, NEW_PW)).status, 200);
  });

  await t.test('관리자 비번 초기화·역할 내림·잠금 → 그 사람 세션 죽음', async () => {
    const admin = await f.as('adminA');
    const v = await f.as('viewA');
    assert.equal((await admin.call('POST', `${oA}/roster/${f.users.viewA.mid}/reset-password`)).status, 200);
    assert.equal(await alive(v), false);

    // 역할 내림: dual(A 교직원) 을 보기만으로
    const d = await f.as('dual', f.orgA);
    assert.equal((await admin.call('PATCH', `${oA}/roster/${f.users.dual.mid}`, { role: '보기만' })).status, 200);
    assert.equal(await alive(d), false);

    // 잠금 — staffA 는 비번을 바꿨으니 새 비번으로
    const s = f.client();
    assert.equal((await s.login('staffA', f.orgA, NEW_PW)).status, 200);
    assert.equal((await admin.call('POST', `${oA}/roster/${f.users.staffA.mid}/lock`)).status, 200);
    assert.equal(await alive(s), false);
  });

  await t.test('시스템 관리자가 기관을 멈추면 그 기관의 열린 세션도 죽는다', async () => {
    const a = await f.as('adminA');
    assert.equal(await alive(a), true);
    const sys = await f.as('sys');
    assert.equal((await sys.call('PATCH', `/api/admin/orgs/${f.orgA}`, { status: '중지' })).status, 200);
    assert.equal(await alive(a), false, '멈춘 기관의 세션이 살아 있다');
    assert.equal((await f.client().login('adminA')).status, 401);
    assert.equal((await sys.call('PATCH', `/api/admin/orgs/${f.orgA}`, { status: '사용' })).status, 200);
  });
});
