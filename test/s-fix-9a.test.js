import test from 'node:test';
import assert from 'node:assert/strict';
import argon2 from 'argon2';
import { DEFAULTS, mergeConfig, limitWarnings, semesterOf, periodsOf } from '../server/orgConfig.js';
import { rankCandidates } from '../server/candidates.js';
import { RULES } from '../server/rules.js';
import { legendOf } from '../server/export/pdf.js';
import { mergeSettings } from '../server/export/settings.js';

const HAS_DB = !!(process.env.DATABASE_URL || process.env.DATABASE_URL_FILE);

test('설정 병합: 비면 기본값 · 일부만 덮고 나머지는 기본 · 배열은 통째로', () => {
  assert.deepEqual(mergeConfig({}), DEFAULTS);
  assert.deepEqual(mergeConfig(null), DEFAULTS);
  const c = mergeConfig({ limits: { periods: 14 }, weekdays: ['월', '화', '수', '목', '금', '토'], substitute: { assistants: 'exclude' } });
  assert.equal(c.limits.periods, 14);
  assert.equal(c.limits.classNo, 60); // 안 적은 칸은 기본
  assert.equal(c.weekdays.length, 6);
  assert.equal(c.substitute.assistants, 'exclude');
  assert.equal(c.substitute.lunchDuty, 'warn');
  assert.deepEqual(c.substitute.order, ['A', 'B', 'C', 'D']);
  assert.equal(c.attendanceMonthlyCap, null);
  assert.equal(mergeConfig({ attendanceMonthlyCap: 40 }).attendanceMonthlyCap, 40);
});

test('상한 경고: 기관 limits 를 넘을 때만 · 거부 아님', () => {
  assert.deepEqual(limitWarnings(DEFAULTS, { periods: 12, classNo: 60 }), []);
  const w = limitWarnings(DEFAULTS, { periods: 14, classNo: 61 });
  assert.deepEqual(w.map((x) => x.key), ['periods', 'classNo']);
  assert.match(w[0].msg, /평소보다 큽니다/);
  assert.equal(limitWarnings(mergeConfig({ limits: { periods: 14 } }), { periods: 14 }).length, 0);
});

test('학기: 기본 3·9월 = 옛 판정 · 3학기제도 된다', () => {
  for (let m = 1; m <= 12; m++) assert.equal(semesterOf(DEFAULTS, m), m >= 3 && m <= 8 ? 1 : 2, `기본 ${m}월`);
  const three = mergeConfig({ semesterStarts: [3, 7, 11] });
  assert.deepEqual([1, 2, 3, 6, 7, 10, 11, 12].map((m) => semesterOf(three, m)), [3, 3, 1, 1, 2, 2, 3, 3]);
});

test('교시 수 기본: 그 학년 → 기관에 적힌 가장 큰 값 → 인자', () => {
  const pc = { grades: { 1: { periods: 4 }, 3: { periods: 6 } } };
  assert.equal(periodsOf(pc, 1, 8), 4);
  assert.equal(periodsOf(pc, 5, 8), 6);
  assert.equal(periodsOf({}, 5, 8), 8);
});

const members = [
  { id: 1, name: '가담임', duty: '담임', homeroom: { id: 11, grade: 3 } },
  { id: 2, name: '나전담', duty: '전담·비교과', homeroom: null },
  { id: 5, name: '마강사', duty: null, homeroom: null },
  { id: 3, name: '다전담', duty: '전담·비교과', homeroom: null },
];
const cells = [{ classroom_id: 11, weekday: 1, period: 2, membership_id: 2 }, { classroom_id: 99, weekday: 1, period: 1, membership_id: 3 }];
const pc = { grades: { 3: { periods: 6, lunch: '12:00', lunchAfter: 2 } } };
const base = { weekday: 1, period: 2, periodConfig: pc, cells, members, absentIds: new Set(), pins: [], takenIds: new Set(), exclude: new Set() };

test('보결 warn 모드(기본): 보조인력·급식지도를 후보에 남기고 warn 사유 · 순위 뒤로', () => {
  const r = rankCandidates(base);
  const by = Object.fromEntries(r.candidates.map((c) => [c.name, c]));
  assert.equal(by['마강사'].warn.code, 'assistant');
  assert.equal(by['가담임'].warn.code, 'lunch'); // 3학년 2교시 뒤 점심
  assert.ok(by['가담임'].warn.detail.length > 0);
  assert.equal(r.excluded.filter((e) => e.code === 'assistant' || e.code === 'lunch').length, 0);
  assert.equal(r.candidates[0].name, '다전담'); // 경고 없는 후보가 앞(가담임은 A 등급이어도 경고 때문에 뒤)
  assert.ok(!r.candidates[0].warn);
  assert.deepEqual(r.candidates.map((c) => c.name), ['다전담', '가담임', '마강사']);
});

test('보결 exclude 모드: 예전처럼 제외 사유로 뺀다', () => {
  const r = rankCandidates({ ...base, config: mergeConfig({ substitute: { assistants: 'exclude', lunchDuty: 'exclude' } }) });
  assert.ok(r.excluded.some((e) => e.code === 'assistant'));
  assert.ok(r.excluded.some((e) => e.code === 'lunch'));
  assert.ok(!r.candidates.some((c) => c.name === '마강사'));
});

test('보결 등급 순서는 기관 설정', () => {
  const m2 = [{ id: 3, name: '다전담', duty: '전담·비교과', homeroom: null }, { id: 4, name: '라비교과', duty: '전담·비교과', homeroom: null }];
  const c2 = [{ classroom_id: 50, weekday: 1, period: 9, membership_id: 3 }]; // 다전담 = C · 라비교과 = D
  const run = (order) => rankCandidates({ ...base, period: 2, cells: c2, members: m2, periodConfig: {}, config: mergeConfig({ substitute: { order } }) }).candidates.map((c) => c.grade);
  assert.deepEqual(run(['A', 'B', 'C', 'D']), ['C', 'D']);
  assert.deepEqual(run(['A', 'B', 'D', 'C']), ['D', 'C']);
});

test('근태 월 상한 규칙이 규칙표에 있고 기본 수위는 알림', () => {
  assert.equal(RULES.attendance_month_cap.level, '알림');
});

test('PDF 범례는 설정에서 만든다', () => {
  const l = legendOf(mergeSettings({ changcheColor: '#112233', changcheNames: ['창체', '자율'], shadeRoomKeywords: ['체육관'] }));
  assert.equal(l[0][0], '#112233');
  assert.match(l[0][1], /창체·자율/);
  assert.match(l[2][1], /체육관/);
});

test('경로: 설정 읽기·쓰기 권한 · 상한 넘으면 경고로 저장 · 학기 · 담당 구분 · 월 상한', { skip: !HAS_DB && 'DB 없음 — 건너뜀' }, async (t) => {
  const { createPool } = await import('../server/db.js');
  const { migrate } = await import('../server/migrate.js');
  const { createApp } = await import('../server/app.js');
  const pool = createPool();
  await migrate(pool);
  const tag = `f9a${Date.now()}`;
  const hash = await argon2.hash('pw-test-1234');
  const org = (await pool.query(`INSERT INTO org (name, kind) VALUES ($1, '초') RETURNING id`, [`${tag}-O`])).rows[0].id;
  const mk = async (lid, role, duty) => {
    const u = (await pool.query(`INSERT INTO app_user (name, login_id, password_hash, must_change_password) VALUES ($1,$2,$3,FALSE) RETURNING id`, [lid, `${tag}-${lid}`, hash])).rows[0].id;
    const m = (await pool.query(`INSERT INTO membership (org_id, user_id, role, duty) VALUES ($1,$2,$3,$4) RETURNING id`, [org, u, role, duty ?? null])).rows[0].id;
    return { login: `${tag}-${lid}`, m: Number(m) };
  };
  const adm = await mk('adm', '기관관리자');
  const stf = await mk('stf', '교직원', '담임');
  const ro = await mk('ro', '보기만');
  const app = createApp(pool, { testMode: true, cookieSecure: false, loginLimit: 1000, apiLimit: 10000 });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.close();
    for (const tb of ['attendance', 'classroom', 'special_room', 'pin', 'term', 'audit_log']) await pool.query(`DELETE FROM ${tb} WHERE org_id = $1`, [org]);
    await pool.query(`DELETE FROM session WHERE (sess->>'userId') IN (SELECT id::text FROM app_user WHERE login_id LIKE $1)`, [`${tag}-%`]);
    await pool.query(`DELETE FROM membership WHERE org_id = $1`, [org]);
    await pool.query(`DELETE FROM app_user WHERE login_id LIKE $1`, [`${tag}-%`]);
    await pool.query(`DELETE FROM org WHERE id = $1`, [org]);
    await pool.end();
  });
  const client = () => {
    let cookie = ''; let csrf = '';
    const call = async (method, path, body) => {
      const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie, 'x-csrf-token': csrf }, body: body ? JSON.stringify(body) : undefined });
      const sc = res.headers.getSetCookie?.() ?? [];
      if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
      let json = null; try { json = await res.json(); } catch { /* 본문 없음 */ }
      if (json?.csrf) csrf = json.csrf;
      return { status: res.status, json };
    };
    return { call, login: async (login) => { await call('GET', '/api/auth/session'); return call('POST', '/api/auth/login', { orgId: org, loginId: login, password: 'pw-test-1234' }); } };
  };
  const A = client(); const S = client(); const R = client();
  assert.equal((await A.login(adm.login)).status, 200);
  assert.equal((await S.login(stf.login)).status, 200);
  assert.equal((await R.login(ro.login)).status, 200);
  const P = `/api/orgs/${org}`;

  await t.test('GET 은 보기 권한 · PUT 은 편집 권한만 · 저장 뒤 병합본', async () => {
    const g = await R.call('GET', `${P}/org/config`);
    assert.equal(g.status, 200);
    assert.deepEqual(g.json, DEFAULTS);
    assert.notEqual((await R.call('PUT', `${P}/org/config`, { limits: { periods: 14 } })).status, 200);
    assert.notEqual((await S.call('PUT', `${P}/org/config`, { limits: { periods: 14 } })).status, 200);
    assert.equal((await A.call('PUT', `${P}/org/config`, { limits: { periods: 'x' } })).status, 400); // 꼴만 검사
    const p = await A.call('PUT', `${P}/org/config`, { limits: { periods: 14 }, roleLabels: { 교직원: '선생님' } });
    assert.equal(p.status, 200);
    assert.equal(p.json.limits.periods, 14);
    assert.equal(p.json.limits.classNo, 60);
    assert.equal((await R.call('GET', `${P}/org/config`)).json.roleLabels.교직원, '선생님');
  });

  await t.test('상한을 넘으면 거부 대신 경고를 붙여 저장 · 넓은 천장 위만 400', async () => {
    const ok = await A.call('POST', `${P}/classrooms`, { grade: 1, class_no: 61 });
    assert.equal(ok.status, 201);
    assert.equal(ok.json.warnings[0].key, 'classNo');
    const n = await A.call('POST', `${P}/classrooms`, { grade: 1, class_no: 2 });
    assert.equal(n.status, 201);
    assert.equal(n.json.warnings, undefined);
    assert.equal((await A.call('POST', `${P}/classrooms`, { grade: 1, class_no: 9999 })).status, 400);
    const per = await A.call('PUT', `${P}/school/periods`, { grades: { 1: { periods: 15 } } }); // 기관 한도 14 → 경고
    assert.equal(per.status, 200);
    assert.equal(per.json.warnings[0].key, 'periods');
    assert.equal((await A.call('PUT', `${P}/school/periods`, { grades: { 1: { periods: 99 } } })).status, 400);
    const room = await A.call('POST', `${P}/special-rooms`, { name: `${tag}실`, capacity: 800 });
    assert.equal(room.status, 201);
    assert.equal(room.json.warnings[0].key, 'capacity');
    const pin = await A.call('POST', `${P}/pins`, { target_kind: '교사', target_id: stf.m, weekday: 1, period: 20, kind: '금지' });
    assert.equal(pin.status, 201);
    assert.equal(pin.json.warnings[0].key, 'periods');
  });

  await t.test('3학기제: 학기 시작 달을 기관이 정하면 새 학기 번호가 따른다', async () => {
    for (const tb of ['classroom', 'pin', 'term']) await pool.query(`DELETE FROM ${tb} WHERE org_id = $1`, [org]); // 앞 시험이 만든 학기를 비운다
    await A.call('PUT', `${P}/org/config`, { semesterStarts: [1, 4, 7, 10] });
    const t1 = await A.call('GET', `${P}/term`);
    assert.equal(t1.json.semester, Math.ceil((new Date().getMonth() + 1) / 3));
  });

  await t.test('담당 구분 목록 밖이면 경고(거부 아님) · 목록 안이면 조용히', async () => {
    await A.call('PUT', `${P}/org/config`, { duties: ['담임', '전담', '비교과', '행정'] });
    const a = await A.call('PATCH', `${P}/specialists/${stf.m}`, { duty: '행정' });
    assert.equal(a.status, 200);
    assert.equal(a.json.warnings, undefined);
    const b = await A.call('PATCH', `${P}/specialists/${stf.m}`, { duty: '도서' });
    assert.equal(b.status, 200);
    assert.equal(b.json.duty, '도서');
    assert.equal(b.json.warnings[0].key, 'duty');
  });

  await t.test('근태 월 상한: 넘으면 위반 목록에 attendance_month_cap(알림) · 저장은 됨', async () => {
    await A.call('PUT', `${P}/org/config`, { attendanceMonthlyCap: 10 });
    const one = await S.call('POST', `${P}/attendance`, { on_date: '2026-05-04', hours: 6 });
    assert.equal(one.status, 201);
    assert.equal(one.json.violations.some((v) => v.rule === 'attendance_month_cap'), false);
    const two = await S.call('POST', `${P}/attendance`, { on_date: '2026-05-05', hours: 6 }); // 합 12 > 10
    assert.equal(two.status, 201);
    const v = two.json.violations.find((x) => x.rule === 'attendance_month_cap');
    assert.ok(v);
    assert.equal(v.level, '알림');
    assert.equal(v.detail.total_hours, 12);
    await A.call('PUT', `${P}/org/config`, { attendanceMonthlyCap: null }); // 상한 없으면 규칙도 없다
    const three = await S.call('POST', `${P}/attendance`, { on_date: '2026-05-06', hours: 8 });
    assert.equal(three.json.violations.some((x) => x.rule === 'attendance_month_cap'), false);
  });
});
