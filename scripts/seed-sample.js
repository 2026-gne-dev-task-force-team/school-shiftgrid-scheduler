// 예시 학교(「예시초등학교」 6학급)를 심는다. 검수자·처음 쓰는 선생님이 칸을 눌러 보며 익히는 용.
//   [SAMPLE_PASSWORD=...] node scripts/seed-sample.js [--reset]
// 이미 있으면 「있음」만 찍고 끝낸다. --reset 이면 그 기관 자료와 sample-* 계정을 지우고 다시 심는다.
// SAMPLE_PASSWORD 를 안 주면 임시 8자를 만들어 한 번 보여 준다. 이름은 전부 지어낸 것.
// F-1 합친 뒤 features 를 0단계로 (이 판에선 org.config 를 건드리지 않는다)
import crypto from 'node:crypto';
import argon2 from 'argon2';
import { createPool } from '../server/db.js';
import { migrate } from '../server/migrate.js';

const ORG = '예시초등학교';
const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
const pw = process.env.SAMPLE_PASSWORD || Array.from(crypto.randomBytes(8), (b) => alphabet[b % alphabet.length]).join('');

// [로그인 ID, 이름, 역할, duty]
const PEOPLE = [
  ['sample-admin', '박누리', '기관관리자', null],
  ...['김가람', '이든솔', '최하늘', '정다온', '한보람', '오은빛'].map((n, i) => [`sample-t${i + 1}`, n, '교직원', '담임']),
  ['sample-t7', '윤새봄', '교직원', '전담·비교과'], // 영어
  ['sample-t8', '강다솜', '교직원', '전담·비교과'], // 체육
];
// 주당 시수(학년군별) — 2022 개정 교육과정 느낌으로 줄인 값. 1·2학년 21 / 3·4학년 26 / 5·6학년 29
const HOURS = {
  low: { 국어: 6, 수학: 4, 통합교과: 6, 체육: 3, 창체: 2 },
  mid: { 국어: 5, 수학: 4, 사회: 3, 과학: 3, 도덕: 1, 음악: 2, 미술: 2, 체육: 3, 영어: 2, 창체: 1 },
  high: { 국어: 5, 수학: 4, 사회: 3, 과학: 3, 도덕: 1, 실과: 2, 음악: 2, 미술: 2, 체육: 3, 영어: 3, 창체: 1 },
};
const band = (g) => (g <= 2 ? 'low' : g <= 4 ? 'mid' : 'high');
// 반쯤 채운 시안: [학년, 요일(1=월), 교시, 교과]. 월·화 앞 교시와 전담 수업 몇 칸 — 전담·특별실 겹침 없게 어긋나 있다.
const FILLED = [];
for (let g = 1; g <= 6; g++) {
  FILLED.push([g, 1, 1, '국어'], [g, 1, 2, '수학'], [g, 1, 3, g <= 2 ? '통합교과' : '사회'], [g, 2, 1, '국어'], [g, 2, 2, '수학']);
  FILLED.push([g, 2, 3, g === 3 ? '과학' : '국어']);
}
FILLED.push([1, 2, 4, '체육'], [2, 1, 5, '체육'], [3, 2, 4, '체육'], [4, 2, 5, '체육'], [5, 2, 6, '체육'], [6, 1, 6, '체육']);
FILLED.push([3, 1, 4, '영어'], [4, 1, 5, '영어'], [5, 1, 6, '영어'], [6, 2, 4, '영어']);

const pool = createPool();
try {
  await migrate(pool);
  const q = async (sql, a) => (await pool.query(sql, a)).rows;
  const old = (await q(`SELECT id FROM org WHERE name = $1 AND deleted_at IS NULL`, [ORG]))[0];
  if (old && !process.argv.includes('--reset')) {
    console.log(`있음: ${ORG}(기관 id ${old.id}) — 다시 심으려면 --reset`);
    process.exit(0);
  }
  const ids = PEOPLE.map((p) => p[0]);
  if (old) {
    for (const tb of ['attendance_allowed', 'attendance', 'month_close', 'booking', 'room_lock', 'substitute', 'cell', 'timetable', 'pin', 'teaching_load', 'classroom', 'term', 'subject', 'special_room', 'audit_log']) {
      await pool.query(`DELETE FROM ${tb} WHERE org_id = $1`, [old.id]);
    }
    await pool.query(`DELETE FROM membership WHERE org_id = $1`, [old.id]);
    await pool.query(`DELETE FROM org WHERE id = $1`, [old.id]);
  }
  await pool.query(`DELETE FROM session WHERE (sess->>'userId') IN (SELECT id::text FROM app_user WHERE login_id = ANY($1))`, [ids]);
  await pool.query(`DELETE FROM app_user WHERE login_id = ANY($1) AND NOT EXISTS (SELECT 1 FROM membership m WHERE m.user_id = app_user.id)`, [ids]);
  if ((await q(`SELECT 1 FROM app_user WHERE lower(login_id) = ANY($1)`, [ids]))[0]) {
    console.error('sample-* ID 가 다른 기관에 소속돼 있어 심지 않았다');
    process.exit(1);
  }

  const hash = await argon2.hash(pw);
  const now = new Date();
  const m = now.getMonth() + 1;
  const year = m < 3 ? now.getFullYear() - 1 : now.getFullYear();
  const semester = m >= 3 && m <= 8 ? 1 : 2;
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const one = async (sql, a) => (await c.query(sql, a)).rows[0].id;
    const periods = { grades: Object.fromEntries([1, 2, 3, 4, 5, 6].map((g) => [g, { periods: g <= 2 ? 5 : 6, lunchAfter: 4 }])) };
    const org = await one(`INSERT INTO org (name, kind, period_config) VALUES ($1, '초', $2) RETURNING id`, [ORG, JSON.stringify(periods)]);
    const term = await one(`INSERT INTO term (org_id, year, semester) VALUES ($1,$2,$3) RETURNING id`, [org, year, semester]);

    const mem = {};
    for (const [login, name, role, duty] of PEOPLE) {
      const u = await one(`INSERT INTO app_user (name, login_id, password_hash, must_change_password) VALUES ($1,$2,$3,FALSE) RETURNING id`, [name, login, hash]);
      mem[login] = await one(`INSERT INTO membership (org_id, user_id, role, duty) VALUES ($1,$2,$3,$4) RETURNING id`, [org, u, role, duty]);
    }
    const room = {};
    for (const [name, cap] of [['과학실', 24], ['체육관', null]]) room[name] = await one(`INSERT INTO special_room (org_id, name, capacity) VALUES ($1,$2,$3) RETURNING id`, [org, name, cap]);
    const subj = {};
    for (const s of new Set(Object.values(HOURS).flatMap(Object.keys))) subj[s] = await one(`INSERT INTO subject (org_id, name) VALUES ($1,$2) RETURNING id`, [org, s]);

    const teacherOf = (s, g) => (s === '영어' ? mem['sample-t7'] : s === '체육' ? mem['sample-t8'] : mem[`sample-t${g}`]);
    const roomOf = (s) => (s === '과학' ? room['과학실'] : s === '체육' ? room['체육관'] : null);
    const cls = {};
    for (let g = 1; g <= 6; g++) {
      cls[g] = await one(`INSERT INTO classroom (org_id, term_id, grade, class_no, student_count, homeroom_membership_id) VALUES ($1,$2,$3,1,$4,$5) RETURNING id`, [org, term, g, 18 + g, mem[`sample-t${g}`]]);
      for (const [s, h] of Object.entries(HOURS[band(g)])) {
        await c.query(`INSERT INTO teaching_load (org_id, term_id, membership_id, subject_id, classroom_id, weekly_hours, special_room_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [org, term, teacherOf(s, g), subj[s], cls[g], h, roomOf(s)]);
      }
    }
    const tt = await one(`INSERT INTO timetable (org_id, term_id, name, created_by) VALUES ($1,$2,'연습용 시안(반쯤 채움)',$3) RETURNING id`, [org, term, mem['sample-admin']]);
    for (const [g, wd, p, s] of FILLED) {
      await c.query(`INSERT INTO cell (org_id, timetable_id, classroom_id, weekday, period, subject_id, membership_id, special_room_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [org, tt, cls[g], wd, p, subj[s], teacherOf(s, g), roomOf(s)]);
    }
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
  console.log(`${ORG} 심음: 6학급 · 교사 8 · 기관관리자 1 · 특별실 2 · 시안 칸 ${FILLED.length}`);
  console.log(`ID: sample-admin, sample-t1 ~ sample-t8(t7 영어·t8 체육 전담) / 비밀번호=${process.env.SAMPLE_PASSWORD ? '(준 값)' : pw}`);
} finally {
  await pool.end();
}
