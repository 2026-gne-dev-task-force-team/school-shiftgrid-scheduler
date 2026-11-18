// S-sec2 1: 응답 보안 헤더 · 쿠키 속성 · API no-store · 오류가 스택·SQL 을 흘리지 않는가.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HAS_DB, setup, PW } from './sec-helpers.js';

const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'sec-dist-'));
fs.mkdirSync(path.join(dist, 'assets'));
fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>x</title>');
fs.writeFileSync(path.join(dist, 'assets', 'a-1.js'), 'console.log(1)');
fs.writeFileSync(path.join(dist, 'favicon.txt'), 'x');
process.env.WEB_DIST = dist;

const need = (h, who) => {
  const csp = h.get('content-security-policy') || '';
  assert.match(csp, /default-src 'self'/, `${who}: CSP default-src`);
  assert.match(csp, /frame-ancestors 'self'/, `${who}: frame-ancestors`);
  assert.match(csp, /object-src 'none'/, `${who}: object-src`);
  assert.equal(h.get('x-content-type-options'), 'nosniff', `${who}: nosniff`);
  assert.ok(h.get('referrer-policy'), `${who}: Referrer-Policy`);
  assert.equal(h.get('x-powered-by'), null, `${who}: x-powered-by`);
};

test('응답 헤더', { skip: !HAS_DB && 'DB 없음' }, async (t) => {
  const f = await setup(t);
  const c = await f.as('staffA');
  const oA = `/api/orgs/${f.orgA}`;
  const raw = (p) => fetch(f.base + p, { headers: { cookie: c.cookie } });

  await t.test('HTML·정적·assets·API·내려받기 모두 CSP·nosniff·Referrer-Policy·frame-ancestors', async () => {
    for (const p of ['/', '/some/deep/route', '/favicon.txt', '/assets/a-1.js', '/api/auth/session', `${oA}/classrooms`, '/api/nope', `${oA}/timetables/${f.A.tt}/export.xlsx`]) {
      const r = await raw(p);
      need(r.headers, p);
    }
    const e = await raw('/api/auth/login'); // GET 은 404
    need(e.headers, '404');
  });

  await t.test('HTML 은 캐시 금지가 아니어도 되지만 API 는 전부 no-store', async () => {
    for (const p of ['/api/auth/session', `${oA}/classrooms`, `${oA}/export/targets`, '/api/nope', `${oA}/timetables/${f.A.tt}/export.pdf`, `${oA}/timetables/999999999/export.pdf`]) {
      const r = await raw(p);
      assert.match(r.headers.get('cache-control') || '', /no-store/, `${p}: Cache-Control`);
    }
    const post = await c.call('POST', '/api/auth/login', { orgId: f.orgA, loginId: 'x', password: 'y' });
    assert.match(post.headers.get('cache-control') || '', /no-store/, 'POST 응답 Cache-Control');
    assert.match((await raw('/assets/a-1.js')).headers.get('cache-control'), /immutable/, 'assets 캐시는 그대로');
  });

  await t.test('오류 응답은 스택·SQL·경로를 흘리지 않는다', async () => {
    const bad = [
      ['GET', `${oA}/timetables/abc/export.pdf`],
      ['GET', `${oA}/timetables/${f.A.tt}/export.pdf?id='%20OR%201=1--`],
      ['GET', `${oA}/timetables/${f.A.tt}/export.exe`],
      ['GET', `/api/orgs/abc/classrooms`],
      ['GET', `/api/orgs/99999999999999999999/classrooms`],
      ['POST', `${oA}/homeroom-subjects/apply`, '{"rows":'], // 깨진 JSON
      ['POST', `${oA}/homeroom-subjects/preview`, Buffer.from('not a zip')],
    ];
    for (const [m, p, body] of bad) {
      const r = await c.call(m, p, body, body instanceof Buffer ? { 'content-type': 'application/octet-stream' } : {});
      assert.ok(r.status >= 400 && r.status < 500, `${m} ${p} → ${r.status}`);
      assert.doesNotMatch(r.text, /\bat .*\(.*:\d+:\d+\)|node_modules|SyntaxError|syntax error|SELECT |INSERT |pg_|\/Users\/|\/app\//i, `${m} ${p} 본문에 내부 정보: ${r.text.slice(0, 200)}`);
    }
  });

  await t.test('쿠키 속성: HttpOnly·SameSite — Secure 는 HTTPS 프록시 전제', async () => {
    const mk = async (env, secure) => {
      const prev = process.env.TRUST_PROXY;
      if (env === undefined) delete process.env.TRUST_PROXY; else process.env.TRUST_PROXY = env;
      const { createApp } = await import('../server/app.js');
      const app = createApp(f.pool, { testMode: true, cookieSecure: secure });
      if (prev === undefined) delete process.env.TRUST_PROXY; else process.env.TRUST_PROXY = prev;
      const s = await new Promise((r) => { const x = app.listen(0, () => r(x)); });
      t.after(() => s.close());
      return `http://127.0.0.1:${s.address().port}`;
    };
    // 기본(프록시 1단) + Secure: 프록시가 https 라고 알려 주면 Secure 쿠키
    const b1 = await mk(undefined, true);
    const r1 = await fetch(b1 + '/api/auth/session', { headers: { 'x-forwarded-proto': 'https' } });
    const sc = r1.headers.getSetCookie()[0] || '';
    assert.match(sc, /; Secure/i); assert.match(sc, /HttpOnly/i); assert.match(sc, /SameSite=Lax/i);
    // TRUST_PROXY=false 인데 Secure: 거짓 x-forwarded-proto 를 믿지 않으니 평문 연결에선 쿠키를 아예 안 준다(Secure 쿠키를 평문에 흘리지 않음)
    const b2 = await mk('false', true);
    const r2 = await fetch(b2 + '/api/auth/session', { headers: { 'x-forwarded-proto': 'https' } });
    assert.equal(r2.headers.getSetCookie().length, 0, 'TRUST_PROXY=false 에서 헤더 위조만으로 Secure 쿠키가 나감');
    // 로그인 뒤 쿠키도 같은 속성
    const lc = f.client();
    await fetch(b1 + '/api/auth/session');
    assert.ok(PW);
  });

  await t.test('운영 기본값: COOKIE_SECURE 가 꺼지지 않으면 Secure', async () => {
    const prev = process.env.COOKIE_SECURE; delete process.env.COOKIE_SECURE;
    const { createApp } = await import('../server/app.js');
    const app = createApp(f.pool, { testMode: true });
    if (prev !== undefined) process.env.COOKIE_SECURE = prev;
    const s = await new Promise((r) => { const x = app.listen(0, () => r(x)); });
    t.after(() => s.close());
    const r = await fetch(`http://127.0.0.1:${s.address().port}/api/auth/session`, { headers: { 'x-forwarded-proto': 'https' } });
    assert.match(r.headers.getSetCookie()[0] || '', /; Secure/i);
  });
});
