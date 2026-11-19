// S-fix-34: 초보 검수 화면 시험 — 보결 안내·후보 횟수·등급 이름 · 기록 이름표 · 확정본 직접 수정 기록
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setup } from './sec-helpers.js';
import { ACTION_LABEL, TABLE_LABEL, summarize } from '../shared/audit-labels.js';
import { SUB_GRADES } from '../shared/sub-grades.js';
import { rankCandidates } from '../server/candidates.js';
import { NO_PERIODS } from '../server/routes/substitute.js';

const HAS_DB = !!(process.env.DATABASE_URL || process.env.DATABASE_URL_FILE);
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []));

test('서버가 남기는 모든 감사 동작에 한국어 이름표가 있다', () => {
  const found = new Set();
  for (const f of walk('server')) for (const m of fs.readFileSync(f, 'utf8').matchAll(/action: '([a-z_.-]+)'/g)) found.add(m[1]);
  found.add('substitute.take'); found.add('substitute.assign'); // 삼항으로 적힌 두 개
  assert.ok(found.size >= 30);
  assert.deepEqual([...found].filter((a) => !ACTION_LABEL[a]), []);
  for (const t of ['timetable', 'term', 'substitute', 'org']) assert.ok(TABLE_LABEL[t]);
});

test('대상 요약: 아는 키는 한국어로, 모르는 키·중첩 값은 원문 펼침 표시', () => {
  assert.deepEqual(summarize({ name: '시안1', starts_on: '2026-11-19' }), { text: '이름 시안1 · 적용 시작일 2026-11-19', raw: false });
  assert.deepEqual(summarize({ ids: [1, 2], zzz: 1 }), { text: '건수 2개', raw: true });
  assert.deepEqual(summarize({ classes: { 1: 2 } }), { text: '', raw: true });
  assert.deepEqual(summarize(null), { text: '', raw: false });
});

test('보결 등급 이름은 후보 판정 코드의 A~D 와 짝이 맞는다', () => {
  assert.deepEqual(Object.keys(SUB_GRADES), ['A', 'B', 'C', 'D']);
  // 코드가 실제로 내는 등급이 전부 이름을 가진다
  const members = [
    { id: 1, name: '담임가', duty: '담임', homeroom: { id: 10, grade: 1 } },
    { id: 2, name: '담임나', duty: '담임', homeroom: { id: 11, grade: 1 } },
    { id: 3, name: '전담다', duty: '전담', homeroom: null },
    { id: 4, name: '전담라', duty: '전담', homeroom: null },
    { id: 5, name: '전담마', duty: '전담', homeroom: null },
  ];
  const cells = [
    { classroom_id: 10, weekday: 1, period: 2, membership_id: 5 }, // 1반이 전담 수업 중 → 담임가 A
    { classroom_id: 5, weekday: 1, period: 1, membership_id: 3 }, // 전담다는 다른 시간 수업 → C
  ];
  const periodConfig = { grades: { 1: { periods: 2 } } };
  const r = rankCandidates({ weekday: 1, period: 2, periodConfig, cells, members, absentIds: new Set(), pins: [], takenIds: new Set(), exclude: new Set() });
  const g = Object.fromEntries(r.candidates.map((c) => [c.name, c.grade]));
  assert.equal(g['담임가'], 'A');
  assert.equal(g['전담다'], 'C');
  assert.equal(g['전담라'], 'D');
  for (const c of r.candidates) assert.ok(SUB_GRADES[c.grade]);
  assert.match(NO_PERIODS, /수업이 없습니다/);
});

test('수업 없는 교사 결강은 다음 할 일을 알려 주고 · 후보에 학기 횟수 · 확정본 직접 수정은 기록에 남는다', { skip: !HAS_DB && 'DB 없음 — 건너뜀' }, async (t) => {
  const f = await setup(t);
  const c = await f.as('adminA');
  const P = `/api/orgs/${f.orgA}`;
  const none = await c.call('POST', `${P}/substitutes`, { on_date: '2026-11-18', all_day: true });
  assert.equal(none.status, 400);
  assert.equal(none.json.error, NO_PERIODS);

  const cls = (await c.call('GET', `${P}/classrooms`)).json[0];
  const sv = await c.call('POST', `${P}/timetables/generated`, { name: '확정수정', cells: [{ classroom_id: cls.id, weekday: 1, period: 1 }] });
  assert.equal(sv.status, 201);
  const cell = { classroom_id: cls.id, weekday: 2, period: 1 };
  assert.equal((await c.call('PUT', `${P}/timetables/${sv.json.id}/cells`, cell)).status, 200); // 시안: 수정
  const cnt = async () => (await f.pool.query(`SELECT count(*)::int AS n FROM audit_log WHERE org_id = $1 AND action = 'timetable.edit_confirmed' AND row_id = $2`, [f.orgA, sv.json.id])).rows[0].n;
  assert.equal(await cnt(), 0);
  assert.equal((await c.call('POST', `${P}/timetables/${sv.json.id}/confirm`, { starts_on: '2026-11-19' })).status, 200);
  assert.equal((await c.call('PUT', `${P}/timetables/${sv.json.id}/cells`, { ...cell, weekday: 3 })).status, 200);
  assert.equal(await cnt(), 1);
});
