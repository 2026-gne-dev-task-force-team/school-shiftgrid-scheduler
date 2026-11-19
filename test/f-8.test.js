// F-8: 예시 학교 씨앗 — 빈 DB 에 심으면 6학급·교사 8·관리자 1·특별실 2, 두 번 돌려도 중복 없음
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cleanupOrgs, HAS_DB } from './sec-helpers.js';

test('예시 학교 씨앗', { skip: !HAS_DB }, async (t) => {
  const { createPool } = await import('../server/db.js');
  const { migrate } = await import('../server/migrate.js');
  const pool = createPool();
  await migrate(pool);
  const run = (...a) => execFileSync('node', ['scripts/seed-sample.js', ...a], { env: { ...process.env, SAMPLE_PASSWORD: 'sample-pw-1234' }, encoding: 'utf8' });
  const orgId = async () => (await pool.query(`SELECT id FROM org WHERE name = '예시초등학교' AND deleted_at IS NULL`)).rows[0]?.id;
  t.after(async () => { await cleanupOrgs(pool, [await orgId()], 'sample'); await pool.end(); });

  assert.match(run('--reset'), /심음/);
  const count = async (sql) => Number((await pool.query(sql, [await orgId()])).rows[0].n);
  const snap = async () => [
    await count(`SELECT count(*) n FROM classroom WHERE org_id = $1 AND deleted_at IS NULL`),
    await count(`SELECT count(*) n FROM membership WHERE org_id = $1 AND duty IS NOT NULL`),
    await count(`SELECT count(*) n FROM membership WHERE org_id = $1 AND role = '기관관리자'`),
    await count(`SELECT count(*) n FROM special_room WHERE org_id = $1`),
    await count(`SELECT count(*) n FROM cell WHERE org_id = $1`),
    await count(`SELECT count(*) n FROM app_user WHERE login_id LIKE 'sample-%' AND must_change_password = FALSE AND $1::bigint IS NOT NULL`),
  ];
  const first = await snap();
  assert.deepEqual(first.slice(0, 4), [6, 8, 1, 2]);
  assert.ok(first[4] > 0 && first[5] === 9);

  assert.match(run(), /있음/);
  assert.deepEqual(await snap(), first);
  assert.match(run('--reset'), /심음/);
  assert.deepEqual(await snap(), first);
});
