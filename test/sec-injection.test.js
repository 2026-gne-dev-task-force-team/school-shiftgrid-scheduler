// S-sec 4: 인젝션 — 문자열 칸에 SQL 조각·아주 긴 문자열·이상한 유니코드 · zod 밖으로 새는 경로 ·
// SQL 문자열에 값을 이어 붙인 곳(정적 검사: 끼워 넣는 것은 코드 상수뿐이어야 한다).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HAS_DB, setup } from './sec-helpers.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []));

// SQL 안에 끼워도 되는 것: 코드에 박힌 열 목록·조각 상수, 스키마 키로만 만든 SET 목록, 숫자로 바꾼 값
const SAFE = new Set(['COLS', 'CELL_COLS', 'SEL', 'BSEL', 'table', 'where', "sets.join(', ')"]);
const SAFE_RE = /^Number\([\w.]+\)$/;

test('정적 검사: SQL 문자열에 값을 이어 붙인 곳이 없다(끼워 넣는 건 상수뿐)', () => {
  const bad = [];
  let seen = 0;
  for (const f of walk(root)) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/`([^`]*)`/g)) {
      if (!/\b(SELECT|INSERT|UPDATE|DELETE|WHERE)\b/.test(m[1])) continue;
      for (const e of m[1].matchAll(/\$\{([^}]*)\}/g)) {
        seen++;
        if (!SAFE.has(e[1].trim()) && !SAFE_RE.test(e[1].trim())) bad.push(`${path.relative(root, f)}: \${${e[1]}}`);
      }
    }
    // 문자열 + 로 SQL 이어 붙이기
    for (const m of src.matchAll(/['"`]\s*\+\s*\w+[^;\n]*\b(WHERE|VALUES|SET)\b/g)) bad.push(`${path.relative(root, f)}: ${m[0].slice(0, 60)}`);
  }
  assert.ok(seen > 5, `끼움 ${seen}개 — 검사가 아무것도 못 보면 검사 쪽이 고장`);
  assert.deepEqual(bad, []);
});

test('정적 검사기 자가 시험: 심은 구멍을 잡는다', () => {
  const planted = 'pool.query(`SELECT * FROM x WHERE name = \'${req.body.name}\'`)';
  const hits = [...planted.matchAll(/`([^`]*)`/g)].flatMap((m) => [...m[1].matchAll(/\$\{([^}]*)\}/g)].map((e) => e[1])).filter((e) => !SAFE.has(e) && !SAFE_RE.test(e));
  assert.deepEqual(hits, ['req.body.name']);
});

// S-fix-37(요구 48): query( 호출 자체를 훑는다 — 키워드가 없는 조각·따옴표 문자열 이어붙임도 잡는다. 허용 목록은 위 SAFE 와 같다.
export function sqlConcatHits(src, name = '') {
  const hits = [];
  for (const m of src.matchAll(/\.query\(\s*`([^`]*)`/g)) {
    for (const e of m[1].matchAll(/\$\{([^}]*)\}/g)) if (!SAFE.has(e[1].trim()) && !SAFE_RE.test(e[1].trim())) hits.push(`${name}: query(\`…\${${e[1]}}`);
  }
  for (const m of src.matchAll(/\.query\(\s*(['"])[^'"\n]*\1\s*\+/g)) hits.push(`${name}: ${m[0].slice(0, 60)}`);
  for (const m of src.matchAll(/['"]\s*(SELECT|INSERT INTO|UPDATE|DELETE FROM)\b[^'"\n]*['"]\s*\+/g)) hits.push(`${name}: ${m[0].slice(0, 60)}`);
  return hits;
}

test('정적 검사 2: query( 템플릿·문자열 이어붙임 grep 0건(허용 목록 밖)', () => {
  const bad = walk(root).flatMap((f) => sqlConcatHits(fs.readFileSync(f, 'utf8'), path.relative(root, f)));
  assert.deepEqual(bad, []);
});

test('정적 검사 2 자가 시험: 심은 구멍 셋을 잡고 허용 목록은 통과', () => {
  assert.equal(sqlConcatHits('db.query(`x ${req.q} y`)').length, 1);
  assert.equal(sqlConcatHits(`db.query('SELECT 1 WHERE a=' + x)`).length >= 1, true);
  assert.equal(sqlConcatHits(`const s = "UPDATE t SET a=" + v;`).length, 1);
  assert.equal(sqlConcatHits('db.query(`SELECT ${COLS} FROM t WHERE id = $1`, [1])').length, 0);
});

test('입력 인젝션', { skip: !HAS_DB && 'DB 없음' }, async (t) => {
  const f = await setup(t);
  const oA = `/api/orgs/${f.orgA}`;
  const sqlBits = [`' OR '1'='1`, `'; DROP TABLE org; --`, `1; SELECT pg_sleep(5)`, `\\'); DELETE FROM app_user; --`, `$1`, `%' --`];

  await t.test('로그인 칸 SQL 조각 → 401/400, 성공 없음', async () => {
    const c = f.client();
    await c.call('GET', '/api/auth/session');
    for (const s of sqlBits) {
      const r = await c.call('POST', '/api/auth/login', { orgId: f.orgA, loginId: s, password: s });
      assert.equal(r.status, 401, s);
      const r2 = await c.call('POST', '/api/auth/login', { orgId: f.orgA, loginId: f.users.adminA.loginId, password: s });
      assert.equal(r2.status, 401, s);
    }
    assert.equal((await c.call('POST', '/api/auth/login', { orgId: `${f.orgA} OR 1=1`, loginId: 'x', password: 'x' })).status, 400);
    assert.equal((await c.call('POST', '/api/auth/login', { orgId: f.orgA, loginId: { $ne: '' }, password: { $ne: '' } })).status, 400);
    assert.equal((await c.call('POST', '/api/auth/login', { orgId: f.orgA, loginId: ['a'], password: 'x' })).status, 400);
  });

  await t.test('SQL 조각은 글자 그대로 저장된다(실행되지 않음)', async () => {
    const a = await f.as('adminA');
    for (const [i, s] of sqlBits.entries()) {
      const r = await a.call('POST', `${oA}/subjects`, { name: `${s}`.slice(0, 40) });
      assert.equal(r.status, 201, `${s} → ${r.status}`);
      const tt = await a.call('POST', `${oA}/timetables`, { name: `${i}${s}` });
      assert.equal(tt.status, 201);
    }
    const names = (await a.call('GET', `${oA}/subjects`)).json.map((x) => x.name);
    for (const s of sqlBits) assert.ok(names.includes(s.slice(0, 40)), s);
    assert.ok((await f.pool.query(`SELECT count(*)::int AS n FROM org`)).rows[0].n > 0);
    assert.ok((await f.pool.query(`SELECT count(*)::int AS n FROM app_user`)).rows[0].n > 0);
  });

  await t.test('질의 문자열·경로 id 에 SQL 조각 → 400/404', async () => {
    const a = await f.as('adminA');
    const enc = encodeURIComponent(`' OR 1=1 --`);
    assert.equal((await a.call('GET', `${oA}/attendance?ym=${enc}`)).status, 400);
    assert.equal((await a.call('GET', `${oA}/bookings?from=${enc}`)).status, 400);
    assert.equal((await a.call('GET', `${oA}/substitutes?status=${enc}`)).status, 400);
    assert.equal((await a.call('GET', `${oA}/classrooms/1${enc}`)).status, 404);
    assert.equal((await a.call('GET', `${oA}/timetables/1${enc}`)).status, 404);
    assert.equal((await a.call('GET', `/api/orgs/${f.orgA}${enc}/classrooms`)).status, 404);
  });

  await t.test('아주 긴 문자열 → 400(500 아님)', async () => {
    const a = await f.as('adminA');
    const long = 'ㄱ'.repeat(10_000);
    const cases = [
      ['POST', `${oA}/subjects`, { name: long }],
      ['POST', `${oA}/timetables`, { name: long }],
      ['POST', `${oA}/roster`, { name: long, loginId: 'x' }],
      ['POST', `${oA}/roster`, { name: 'x', loginId: long }],
      ['POST', `${oA}/special-rooms`, { name: long }],
      ['POST', `${oA}/attendance`, { on_date: '2026-11-03', hours: 1, memo: long }],
      ['POST', `${oA}/substitutes`, { on_date: '2026-11-17', items: [{ period: 1 }], reason: long }],
      ['POST', '/api/auth/login', { orgId: f.orgA, loginId: long, password: 'x' }],
    ];
    for (const [m, p, b] of cases) {
      const r = await a.call(m, p, b);
      assert.equal(r.status, 400, `${p} → ${r.status}`);
    }
  });

  await t.test('이상한 유니코드 — NUL 은 400, 나머지는 저장되거나 400(500 은 없음)', async () => {
    const a = await f.as('adminA');
    const weird = ['\u0000', 'a\u0000b', '‮evil', '\uD800', '﻿', '👩‍👩‍👧', 'é', '​', '￿'];
    const bad = [];
    for (const [i, w] of weird.entries()) {
      for (const [m, p, b] of [
        ['POST', `${oA}/subjects`, { name: `s${i}${w}` }],
        ['POST', `${oA}/timetables`, { name: `t${i}${w}` }],
        ['POST', `${oA}/roster`, { name: `n${i}${w}`, loginId: `${f.tag}-u${i}` }],
        ['POST', `${oA}/attendance`, { on_date: `2026-10-${String(i + 10)}`, hours: 1, allowed_subject: `x${w}` }],
        ['PUT', `${oA}/rules`, { levels: { [`k${w}`]: '알림' } }],
      ]) {
        const r = await a.call(m, p, b);
        if (r.status >= 500) bad.push(`${p} ${JSON.stringify(w)} → ${r.status}`);
        if (w.includes('\u0000') && r.status !== 400) bad.push(`NUL ${p} → ${r.status}`);
      }
    }
    assert.deepEqual(bad, []);
    assert.equal((await a.call('GET', `${oA}/attendance?ym=2026-11%00`)).status, 400);
  });
});
