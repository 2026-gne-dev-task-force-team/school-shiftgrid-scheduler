// S-fix-33: 초보 검수 화면 시험에서 걸린 것 — 날짜 하루 어긋남 · 내 시간표 안내 · 반 고정+교과 · 화면 약속
process.env.TZ = 'Asia/Seoul'; // 한국 시각대에서만 DATE 가 하루 어긋난다
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setup } from './sec-helpers.js';
import { emptyReason } from '../web/src/s1c/mineReason.js';
import { generate } from '../web/src/gen/core.js';
import { RULE_TEXT } from '../web/src/s2b/ruleText.js';
import { SOFT_RULES } from '../web/src/gen/soft.js';
import { todayStr } from '../web/src/today.js';

const HAS_DB = !!(process.env.DATABASE_URL || process.env.DATABASE_URL_FILE);
const src = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('확정 날짜는 목록·내 시간표 어디서나 쓴 그대로(하루 안 어긋남) · 반 고정에 교과 저장', { skip: !HAS_DB && 'DB 없음 — 건너뜀' }, async (t) => {
  const f = await setup(t);
  const c = await f.as('adminA');
  const P = `/api/orgs/${f.orgA}`;
  const cls = (await c.call('GET', `${P}/classrooms`)).json[0];
  const sv = await c.call('POST', `${P}/timetables/generated`, { name: '날짜시안', cells: [{ classroom_id: cls.id, weekday: 1, period: 1 }] });
  assert.equal(sv.status, 201);
  const cf = await c.call('POST', `${P}/timetables/${sv.json.id}/confirm`, { starts_on: '2026-11-19' });
  assert.equal(cf.status, 200);
  assert.equal(cf.json.starts_on, '2026-11-19');
  const row = (await c.call('GET', `${P}/timetables`)).json.find((x) => x.id === sv.json.id);
  assert.equal(row.starts_on, '2026-11-19'); // 고치기 전: 2026-11-18T15:00:00.000Z
  const out = (await c.call('GET', `${P}/export/targets`)).json;
  assert.equal(out.find((x) => x.id === sv.json.id)?.starts_on, '2026-11-19');

  // 반 고정 + 교과: 서버가 교과를 저장하고 돌려준다
  const subj = (await c.call('GET', `${P}/subjects`)).json[0];
  const pin = await c.call('POST', `${P}/pins`, { target_kind: '반', target_id: cls.id, weekday: 3, period: 4, kind: '고정', subject_id: subj.id });
  assert.equal(pin.status, 201);
  assert.equal(pin.json.subject_id, subj.id);
  const pins = (await c.call('GET', `${P}/pins?target_kind=${encodeURIComponent('반')}`)).json;
  assert.equal(pins.find((p) => p.id === pin.json.id).subject_id, subj.id);
  const gi = (await c.call('GET', `${P}/gen/input`)).json;
  assert.ok(gi.pins.some((p) => p.target_kind === '반' && p.subject_id === subj.id)); // 생성 재료에 교과가 실려 간다
});

test('생성기: 반+교과 고정은 그 칸에 그 교과 · 교과 없는 고정은 비워 둔다(원인)', () => {
  const base = { classrooms: [{ id: 1, grade: 1 }], periods: { grades: { 1: { periods: 5, lunchAfter: 0 } } }, lines: [{ classroom_id: 1, membership_id: 7, subject_id: 11, weekly_hours: 3 }, { classroom_id: 1, membership_id: 7, subject_id: 12, weekly_hours: 3 }] };
  const at = (subject_id) => generate({ ...base, pins: [{ target_kind: '반', target_id: 1, weekday: 1, period: 1, kind: '고정', subject_id }] }, { k: 1, perMs: 300 }).candidates[0].cells.filter((x) => x.weekday === 1 && x.period === 1);
  assert.equal(at(11)[0].subject_id, 11);
  assert.equal(at(13)[0].subject_id, 13); // 시수표에 없는 교과여도 그 칸에 놓는다
  assert.equal(at(null).length, 0); // 교과 없이 「고정」만 하면 비움 — 화면이 이 사실을 알려 준다
});

test('내 수업이 없으면 확정된 시간표 이름·시작일과 학급별 보기 길을 안내', () => {
  const r = emptyReason({ name: '시안 1', starts_on: '2026-11-19' }, []);
  assert.match(r.body, /확정된 시간표: 시안 1\(11월 19일부터\)/);
  assert.match(r.body, /시간표 격자/);
  assert.match(r.title, /내 수업 없음/);
  assert.match(emptyReason({ name: '시안 1' }, []).body, /확정된 시간표: 시안 1\./);
});

test('오늘 날짜 도우미는 기기 시각대 날짜(UTC 변환 아님)', () => {
  assert.equal(todayStr(new Date(2026, 10, 19, 0, 30)), '2026-11-19'); // 한국 00:30 — toISOString 이면 11-18
});

test('화면 약속: 확인창은 모달 · 탭 이름표에 낱말 풀이 없음 · 하위 탭 안내 · 빈 특별실 길 · 가중 문구', () => {
  assert.ok(!/window\.confirm/.test(src('web/src/settings/FeatureBoard.jsx')));
  assert.ok(!/window\.confirm/.test(src('web/src/s1c/Guide.jsx')));
  const sp = src('web/src/school/SchoolPage.jsx');
  assert.ok(!/<Tabs\.Tab[^>]*><Term/.test(sp));
  for (const tab of ['loads', 'pins', 'rules']) assert.ok(sp.includes(`<TabIntro tab="${tab}"`));
  assert.ok(src('web/src/s3/Rooms.jsx').includes('rooms-empty'));
  const ag = src('web/src/s2/AutoGen.jsx');
  assert.ok(ag.includes('4단계(생성 설정)를 켜면 가중을 바꿀 수 있습니다.'));
  assert.ok(ag.includes('전담 선생님이 점심때 쉴 칸'));
});

test('권장 규칙 17개 모두 사람 말 이름과 한 줄 풀이가 있다', () => {
  for (const k of Object.keys(SOFT_RULES)) assert.ok(RULE_TEXT[k]?.[0] && RULE_TEXT[k]?.[1], k);
});
