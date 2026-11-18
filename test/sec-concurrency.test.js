// S-sec 6: 동시 확정 20건 — 같은 시안을 20번 동시에 확정해도 상태가 한 가지로 맞는가.
// 설계: 확정은 여럿이어도 되고(시안마다) 같은 시안을 다시 확정하면 시작일만 바뀐다 → 결과는 「그 시안 하나가 확정」.
// 동시 보결 맡기(20건 중 1건만)는 s3.test.js 에 있다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HAS_DB, setup } from './sec-helpers.js';

test('동시 확정 20건', { skip: !HAS_DB && 'DB 없음' }, async (t) => {
  const f = await setup(t);
  const oA = `/api/orgs/${f.orgA}`;
  const admins = await Promise.all(Array.from({ length: 20 }, () => f.as('adminA')));
  const before = (await f.pool.query(`SELECT count(*)::int AS n FROM timetable WHERE org_id = $1`, [f.orgA])).rows[0].n;

  await t.test('같은 시작일 20건 동시 → 전부 200, 확정 한 줄, 시안 수 그대로', async () => {
    const rs = await Promise.all(admins.map((c) => c.call('POST', `${oA}/timetables/${f.A.tt}/confirm`, { starts_on: '2026-09-01' })));
    assert.deepEqual([...new Set(rs.map((r) => r.status))], [200]);
    const row = (await f.pool.query(`SELECT status, to_char(starts_on,'YYYY-MM-DD') AS s, confirmed_at FROM timetable WHERE id = $1`, [f.A.tt])).rows[0];
    assert.equal(row.status, '확정');
    assert.equal(row.s, '2026-09-01');
    assert.ok(row.confirmed_at);
    assert.equal((await f.pool.query(`SELECT count(*)::int AS n FROM timetable WHERE org_id = $1`, [f.orgA])).rows[0].n, before);
    // 자기 자신을 「같은 날 확정본」 알림으로 세지 않는다
    for (const r of rs) assert.ok(!r.json.notes.some((n) => n.detail.includes('A시간표')));
  });

  await t.test('시작일이 다른 20건 + 확정 풀기 섞어 동시 → 최종 상태는 요청 중 하나와 맞는다', async () => {
    const reqs = admins.map((c, i) => (i % 5 === 4
      ? c.call('POST', `${oA}/timetables/${f.A.tt}/unconfirm`)
      : c.call('POST', `${oA}/timetables/${f.A.tt}/confirm`, { starts_on: `2026-09-${String(i + 1).padStart(2, '0')}` })));
    const rs = await Promise.all(reqs);
    assert.ok(rs.every((r) => r.status === 200), rs.map((r) => r.status).join(','));
    const row = (await f.pool.query(`SELECT status, to_char(starts_on,'YYYY-MM-DD') AS s, confirmed_at FROM timetable WHERE id = $1`, [f.A.tt])).rows[0];
    // 확정이면 confirmed_at 이 있고, 시안이면 없다(반쯤 바뀐 줄 없음)
    if (row.status === '확정') assert.ok(row.confirmed_at && /^2026-09-\d\d$/.test(row.s));
    else assert.equal(row.confirmed_at, null);
  });
});
