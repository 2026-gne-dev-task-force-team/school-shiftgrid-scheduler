import test from 'node:test';
import assert from 'node:assert/strict';
import { HAS_DB, PW, setup } from './sec-helpers.js';

// 쿠키·CSRF 를 들고 다니는 작은 클라이언트
const client = (base) => {
  let cookie = '';
  let csrf = '';
  return async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie, 'x-csrf-token': csrf }, body: body ? JSON.stringify(body) : undefined });
    const sc = res.headers.getSetCookie?.() ?? [];
    if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
    const json = await res.json().catch(() => null);
    if (json?.csrf) csrf = json.csrf;
    return { status: res.status, json };
  };
};

test('겸임자가 둘째 기관으로 바꾸면 그 기관 자료가 보이고, 소속 아닌 기관은 404', { skip: !HAS_DB && 'DB 없음' }, async (t) => {
  const f = await setup(t);
  const c = client(f.base);
  await c('GET', '/api/auth/session');
  const l = await c('POST', '/api/auth/login', { orgId: f.orgA, loginId: f.users.dual.loginId, password: PW });
  assert.equal(l.status, 200);
  assert.equal((await c('GET', `/api/orgs/${f.orgB}/classrooms?termId=${f.B.term}`)).status, 404); // 아직 A 세션

  const m = await c('GET', '/api/auth/memberships');
  assert.deepEqual(m.json.items.map((x) => x.orgId).sort(), [f.orgA, f.orgB].sort());

  const s = await c('POST', '/api/auth/switch-org', { orgId: f.orgB });
  assert.equal(s.status, 200);
  assert.equal(s.json.user.orgId, Number(f.orgB));
  assert.equal(s.json.user.role, '기관관리자'); // 소속마다 역할이 따로
  const r = await c('GET', `/api/orgs/${f.orgB}/classrooms?termId=${f.B.term}`);
  assert.equal(r.status, 200);
  assert.ok(JSON.stringify(r.json).includes(`"id":"${f.B.class}"`) || JSON.stringify(r.json).includes(`"id":${f.B.class}`));
  assert.equal((await c('GET', `/api/orgs/${f.orgA}/classrooms?termId=${f.A.term}`)).status, 404); // 이제 A 는 남의 기관

  // 소속 아닌 기관(교육청) · 없는 기관
  assert.equal((await c('POST', '/api/auth/switch-org', { orgId: f.orgEdu })).status, 404);
  assert.equal((await c('POST', '/api/auth/switch-org', { orgId: 999999999 })).status, 404);
  assert.equal((await c('GET', '/api/auth/session')).json.user.orgId, Number(f.orgB)); // 거부돼도 그대로
});
