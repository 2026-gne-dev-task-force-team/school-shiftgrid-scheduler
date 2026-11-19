// S-fix-18: 명단 올리기(/roster/import) 200·1000줄 시간 실측. 기본 npm test 와 무관 — 따로 돌린다.
// 실행: DATABASE_URL=... SESSION_SECRET=... node scripts/bench-roster.js
import { setup } from '../test/sec-helpers.js';

const t = { after: (fn) => (t.fns ??= []).push(fn) };
const f = await setup(t);
try {
  const c = f.client();
  await c.login('adminA');
  for (const n of [200, 1000]) {
    const rows = Array.from({ length: n }, (_, i) => ({ name: `벤${n}_${i}`, loginId: `${f.tag}-b${n}-${i}`, role: '교직원', duty: '' }));
    const t0 = performance.now();
    const r = await c.call('POST', `/api/orgs/${f.orgA}/roster/import`, { rows });
    const s = (performance.now() - t0) / 1000;
    console.log(`${n}줄 status=${r.status} made=${r.json?.made} failed=${r.json?.failed} ${s.toFixed(1)}초 (줄당 ${((s / n) * 1000).toFixed(0)}ms) 본문 ${JSON.stringify({ rows }).length}B`);
  }
} finally {
  for (const fn of t.fns ?? []) await fn();
}
