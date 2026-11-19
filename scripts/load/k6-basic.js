// k6 대본: 로그인 → 시간표 조회 → 보결 목록. k6 는 이 PC 에 없다(실행 안 해 봤음).
// 실행: k6 run -e BASE=http://127.0.0.1:3000 -e ORG=1 -e LOGIN=admin -e PASS=비번 -e VUS=20 -e DUR=30s scripts/load/k6-basic.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE || 'http://127.0.0.1:3000';
export const options = {
  vus: Number(__ENV.VUS || 20),
  duration: __ENV.DUR || '30s',
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<1000'] },
};

export default function () {
  const jar = http.cookieJar();
  const s = http.get(`${BASE}/api/auth/session`);
  const csrf = s.json('csrf');
  const org = __ENV.ORG;
  const login = http.post(`${BASE}/api/auth/login`, JSON.stringify({ orgId: org, loginId: __ENV.LOGIN, password: __ENV.PASS }),
    { headers: { 'content-type': 'application/json', 'x-csrf-token': csrf } });
  check(login, { 로그인: (r) => r.status === 200 });
  const tt = http.get(`${BASE}/api/orgs/${org}/timetables`);
  check(tt, { 시간표: (r) => r.status === 200 });
  const sub = http.get(`${BASE}/api/orgs/${org}/substitutes`);
  check(sub, { 보결: (r) => r.status === 200 });
  sleep(1);
}
