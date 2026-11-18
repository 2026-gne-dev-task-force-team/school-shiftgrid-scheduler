// S-sec 공용 틀: 자기 기관 자료를 만들고(태그 붙인 이름) 시험이 끝나면 그 기관 것만 지운다.
// 실행 중인 앱(3000)은 건드리지 않는다 — createApp 을 시험 안에서 띄운다.
import argon2 from 'argon2';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const routesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server', 'routes');

// 라우터가 붙는 자리(app.js · timetables.js 의 generateRouter)
const MOUNT = { 'auth.js': '/api/auth', 'admin.js': '/api/admin', 'roster.js': '/api/orgs/:orgId/roster' };
export function routeList() {
  const out = [];
  for (const file of fs.readdirSync(routesDir).filter((f) => f.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(routesDir, file), 'utf8');
    const prefix = MOUNT[file] ?? '/api/orgs/:orgId';
    for (const m of src.matchAll(/\br\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)) {
      const sub = m[2] === '/' ? '' : m[2];
      out.push({ file, method: m[1].toUpperCase(), path: prefix + sub });
    }
  }
  return out;
}

export const HAS_DB = !!(process.env.DATABASE_URL || process.env.DATABASE_URL_FILE);
export const PW = 'pw-test-1234';

// 지울 차례(참조 받는 표가 뒤)
const ORG_TABLES = ['attendance_allowed', 'attendance', 'month_close', 'booking', 'room_lock', 'substitute', 'cell', 'timetable', 'pin', 'teaching_load', 'classroom', 'term', 'subject', 'special_room', 'audit_log'];

// 시험이 만든 기관·계정을 끝에 지운다(참조 받는 표 먼저). 로그인 기관 목록에 시험 기관이 남지 않게 — 시험마다 이걸 쓴다.
export async function cleanupOrgs(pool, orgIds, tag) {
  const ids = [orgIds].flat();
  for (const tb of ORG_TABLES) await pool.query(`DELETE FROM ${tb} WHERE org_id = ANY($1)`, [ids]);
  await pool.query(`DELETE FROM session WHERE (sess->>'userId') IN (SELECT id::text FROM app_user WHERE login_id LIKE $1)`, [`${tag}-%`]);
  await pool.query(`DELETE FROM membership WHERE org_id = ANY($1)`, [ids]);
  await pool.query(`DELETE FROM app_user WHERE login_id LIKE $1`, [`${tag}-%`]);
  await pool.query(`DELETE FROM org WHERE id = ANY($1)`, [ids]);
}

export async function setup(t, appOpts = {}) {
  const { createPool } = await import('../server/db.js');
  const { migrate } = await import('../server/migrate.js');
  const { createApp } = await import('../server/app.js');
  const pool = createPool();
  await migrate(pool);
  const tag = `sec${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const hash = await argon2.hash(PW);
  const q = async (sql, args) => (await pool.query(sql, args)).rows[0]?.id;
  const orgs = [];
  const mkOrg = async (name, kind = '초') => { const id = await q(`INSERT INTO org (name, kind) VALUES ($1, $2) RETURNING id`, [`${tag}-${name}`, kind]); orgs.push(id); return id; };
  const mkUser = async (loginId) => q(`INSERT INTO app_user (name, login_id, password_hash, must_change_password) VALUES ($1, $2, $3, FALSE) RETURNING id`, [loginId, `${tag}-${loginId}`, hash]);
  const addMem = async (orgId, userId, role) => q(`INSERT INTO membership (org_id, user_id, role) VALUES ($1, $2, $3) RETURNING id`, [orgId, userId, role]);

  const f = { tag, pool, users: {} };
  f.orgA = await mkOrg('A');
  f.orgB = await mkOrg('B');
  f.orgEdu = await mkOrg('교육청', '교육청');
  const person = async (key, orgId, role) => {
    const uid = await mkUser(key);
    const mid = await addMem(orgId, uid, role);
    f.users[key] = { uid, mid, loginId: `${tag}-${key}`, orgId };
    return f.users[key];
  };
  await person('adminA', f.orgA, '기관관리자');
  await person('staffA', f.orgA, '교직원');
  await person('viewA', f.orgA, '보기만');
  await person('adminB', f.orgB, '기관관리자');
  await person('sys', f.orgEdu, '시스템관리자');
  // 겸임: A 에선 교직원, B 에선 관리자
  const dual = await person('dual', f.orgA, '교직원');
  dual.midB = await addMem(f.orgB, dual.uid, '기관관리자');

  // 기관 B 자원 한 벌(남의 것 id), A 자원 조금(내 것)
  const B = {};
  B.term = await q(`INSERT INTO term (org_id, year, semester) VALUES ($1, 2026, 2) RETURNING id`, [f.orgB]);
  B.class = await q(`INSERT INTO classroom (org_id, term_id, grade, class_no) VALUES ($1, $2, 3, 1) RETURNING id`, [f.orgB, B.term]);
  B.subject = await q(`INSERT INTO subject (org_id, name) VALUES ($1, 'B과목') RETURNING id`, [f.orgB]);
  B.room = await q(`INSERT INTO special_room (org_id, name) VALUES ($1, 'B실') RETURNING id`, [f.orgB]);
  B.load = await q(`INSERT INTO teaching_load (org_id, term_id, classroom_id, subject_id, weekly_hours) VALUES ($1,$2,$3,$4,2) RETURNING id`, [f.orgB, B.term, B.class, B.subject]);
  B.pin = await q(`INSERT INTO pin (org_id, term_id, target_kind, target_id, weekday, period, kind) VALUES ($1,$2,'반',$3,1,1,'금지') RETURNING id`, [f.orgB, B.term, B.class]);
  B.tt = await q(`INSERT INTO timetable (org_id, term_id, name) VALUES ($1, $2, 'B시간표') RETURNING id`, [f.orgB, B.term]);
  B.mem = f.users.adminB.mid;
  B.sub = await q(`INSERT INTO substitute (org_id, term_id, absent_membership_id, on_date, period) VALUES ($1, $2, $3, '2026-11-16', 1) RETURNING id`, [f.orgB, B.term, B.mem]);
  B.booking = await q(`INSERT INTO booking (org_id, special_room_id, on_date, period, membership_id) VALUES ($1, $2, '2026-11-16', 1, $3) RETURNING id`, [f.orgB, B.room, B.mem]);
  B.lock = await q(`INSERT INTO room_lock (org_id, special_room_id, weekday, period) VALUES ($1, $2, 2, 2) RETURNING id`, [f.orgB, B.room]);
  B.att = await q(`INSERT INTO attendance (org_id, term_id, membership_id, on_date, hours) VALUES ($1,$2,$3,'2026-11-03',1) RETURNING id`, [f.orgB, B.term, B.mem]);
  f.B = B;
  const A = {};
  A.term = await q(`INSERT INTO term (org_id, year, semester) VALUES ($1, 2026, 2) RETURNING id`, [f.orgA]);
  A.class = await q(`INSERT INTO classroom (org_id, term_id, grade, class_no) VALUES ($1, $2, 1, 1) RETURNING id`, [f.orgA, A.term]);
  A.subject = await q(`INSERT INTO subject (org_id, name) VALUES ($1, 'A과목') RETURNING id`, [f.orgA]);
  A.room = await q(`INSERT INTO special_room (org_id, name) VALUES ($1, 'A실') RETURNING id`, [f.orgA]);
  A.tt = await q(`INSERT INTO timetable (org_id, term_id, name) VALUES ($1, $2, 'A시간표') RETURNING id`, [f.orgA, A.term]);
  A.sub = await q(`INSERT INTO substitute (org_id, term_id, absent_membership_id, on_date, period) VALUES ($1, $2, $3, '2026-11-16', 1) RETURNING id`, [f.orgA, A.term, f.users.adminA.mid]);
  f.A = A;

  const app = createApp(pool, { testMode: true, cookieSecure: false, loginLimit: 1000, apiLimit: 100000, ...appOpts });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  f.base = `http://127.0.0.1:${server.address().port}`;
  f.app = app;

  t.after(async () => {
    server.close();
    const ids = orgs;
    const uids = Object.values(f.users).map((u) => u.uid);
    for (const tb of ORG_TABLES) await pool.query(`DELETE FROM ${tb} WHERE org_id = ANY($1)`, [ids]);
    await pool.query(`DELETE FROM session WHERE (sess->>'userId') = ANY($1)`, [uids.map(String)]);
    await pool.query(`DELETE FROM membership WHERE org_id = ANY($1)`, [ids]);
    await pool.query(`DELETE FROM app_user WHERE login_id LIKE $1`, [`${tag}-%`]);
    await pool.query(`DELETE FROM org WHERE id = ANY($1)`, [ids]);
    await pool.end();
  });

  // 쿠키·CSRF 를 들고 다니는 작은 클라이언트
  f.client = () => {
    let cookie = '';
    let csrf = '';
    const call = async (method, path, body, headers = {}) => {
      const res = await fetch(f.base + path, {
        method,
        headers: { 'content-type': 'application/json', cookie, 'x-csrf-token': csrf, ...headers },
        body: body === undefined ? undefined : typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body),
      });
      const sc = res.headers.getSetCookie?.() ?? [];
      if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* 파일 응답 */ }
      if (json?.csrf) csrf = json.csrf;
      return { status: res.status, json, text, headers: res.headers };
    };
    const c = {
      call,
      get cookie() { return cookie; },
      set cookie(v) { cookie = v; },
      get csrf() { return csrf; },
      set csrf(v) { csrf = v; },
      login: async (who, orgId = f.users[who].orgId, password = PW) => {
        await call('GET', '/api/auth/session');
        return call('POST', '/api/auth/login', { orgId, loginId: f.users[who].loginId, password });
      },
    };
    return c;
  };
  f.as = async (who, orgId) => {
    const c = f.client();
    const r = await c.login(who, orgId);
    if (r.status !== 200) throw new Error(`${who} 로그인 실패 ${r.status}`);
    return c;
  };
  return f;
}
