// k6 없이 같은 흐름(로그인 → 시간표 조회 → 보결 목록)을 node 로 돈다. 시험 기관을 직접 만들고 끝에 지운다.
// 실행: DATABASE_URL=... SESSION_SECRET=... [VUS=20 SECS=30] node scripts/load/node-basic.js
// 자기 포트로 앱을 새로 띄우므로 개발 앱(3000)을 건드리지 않는다.
import { setup } from '../../test/sec-helpers.js';

const VUS = Number(process.env.VUS || 20);
const SECS = Number(process.env.SECS || 30);
const t = { after: (fn) => (t.fns ??= []).push(fn) };
const f = await setup(t);
const lat = { 로그인: [], 시간표: [], 보결: [] };
let fail = 0;
try {
  const o = `/api/orgs/${f.orgA}`;
  const timed = async (k, c, m, p, b) => {
    const t0 = performance.now();
    const r = await c.call(m, p, b);
    lat[k].push(performance.now() - t0);
    if (r.status !== 200) fail++;
  };
  const end = Date.now() + SECS * 1000;
  await Promise.all(Array.from({ length: VUS }, async () => {
    while (Date.now() < end) {
      const c = f.client();
      const t0 = performance.now();
      const r = await c.login('adminA');
      lat.로그인.push(performance.now() - t0);
      if (r.status !== 200) { fail++; continue; }
      await timed('시간표', c, 'GET', `${o}/timetables`);
      await timed('보결', c, 'GET', `${o}/substitutes`);
    }
  }));
  const p95 = (a) => [...a].sort((x, y) => x - y)[Math.max(0, Math.ceil(a.length * 0.95) - 1)]?.toFixed(0);
  for (const [k, a] of Object.entries(lat)) console.log(`${k}: ${a.length}건 p95=${p95(a)}ms`);
  console.log(`동시 ${VUS} · ${SECS}초 · 실패 ${fail}`);
} finally {
  for (const fn of t.fns ?? []) await fn();
}
