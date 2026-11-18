import test from 'node:test';
import assert from 'node:assert/strict';
import { findOverlaps as serverOverlaps } from '../server/violations.js';
import { findOverlaps as webOverlaps, combinedOf } from '../web/src/gen/overlap.js';
import { currentConflicts, moveConflicts } from '../web/src/gen/core.js';
import { buildTimes, rowsOf } from '../web/src/school/periodTimes.js';
import { emptyReason } from '../web/src/s1c/mineReason.js';
import { extraFrom, extraToWeights } from '../web/src/s2b/extra.js';

const T = (s, e) => ({ start: s, end: e });
const timed = { grades: { 1: { periods: 5, times: [T('09:00', '09:40'), T('09:50', '10:30'), T('10:40', '11:20'), T('11:30', '12:10'), T('13:00', '13:40')] }, 3: { periods: 5, times: [T('09:00', '09:40'), T('09:50', '10:30'), T('10:40', '11:20'), T('12:50', '13:30'), T('13:40', '14:20')] } } };
const lunch = { grades: { 3: { periods: 6, lunchAfter: 3 }, 5: { periods: 6, lunchAfter: 5 } } };
const C = (classroom_id, period, extra = {}) => ({ classroom_id, weekday: 1, period, membership_id: 7, ...extra });
// 같은 시험 표 — 서버·화면 규칙이 같은 답을 내야 한다
const TABLE = [
  { name: '시각 겹침', cells: [C(1, 5), C(2, 4)], ctx: { periods: timed, gradeOf: { 1: 1, 2: 3 } }, n: 1 },
  { name: '교시 같아도 시각 안 겹침', cells: [C(1, 4), C(2, 4)], ctx: { periods: timed, gradeOf: { 1: 1, 2: 3 } }, n: 0 },
  { name: '점심 자리 시각 칸', cells: [C(1, 4), C(2, 5)], ctx: { periods: lunch, gradeOf: { 1: 3, 2: 5 } }, n: 1 },
  { name: '복식 같은 교과 → 한 수업', cells: [C(1, 2, { subject_id: 4 }), C(2, 2, { subject_id: 4 })], ctx: { combined: [[1, 2]] }, n: 0 },
  { name: '복식 묶음이라도 교과 다르면 겹침', cells: [C(1, 2, { subject_id: 4 }), C(2, 2, { subject_id: 5 })], ctx: { combined: [[1, 2]] }, n: 1 },
  { name: '묶음 밖 반이 끼면 겹침', cells: [C(1, 2, { subject_id: 4 }), C(2, 2, { subject_id: 4 }), C(3, 2, { subject_id: 4 })], ctx: { combined: [[1, 2]] }, n: 1 },
  { name: 'null 교시 섞여도 시각 있는 칸은 시각으로', cells: [C(1, 5), C(2, 4), C(3, 3)], ctx: { periods: timed, gradeOf: { 1: 1, 2: 3, 3: 9 } }, n: 1 },
  { name: 'null 교시끼리만 번호로', cells: [C(1, 4), C(2, 4), C(3, 3), C(4, 3)], ctx: { periods: timed, gradeOf: { 1: 1, 2: 3, 3: 9, 4: 9 } }, n: 1 },
  { name: '시각 칸 + 시각 null 칸 같은 교시 → 교시 번호로 겹침(재확인)', cells: [C(1, 4), C(3, 4)], ctx: { periods: timed, gradeOf: { 1: 1, 3: 9 } }, n: 1, level: '재확인' },
  { name: '시각 칸 + 시각 null 칸 다른 교시 → 안 겹침', cells: [C(1, 4), C(3, 3)], ctx: { periods: timed, gradeOf: { 1: 1, 3: 9 } }, n: 0 },
  { name: '특별실', cells: [{ classroom_id: 1, weekday: 2, period: 3, special_room_id: 9 }, { classroom_id: 2, weekday: 2, period: 3, special_room_id: 9 }], ctx: {}, n: 1 },
];
const key = (f) => JSON.stringify([f.rule, f.weekday, f.period, f.classroom_ids, f.detail]);
for (const row of TABLE) {
  test(`겹침 시험 표(서버=화면): ${row.name}`, () => {
    const s = serverOverlaps(row.cells, row.ctx);
    const w = webOverlaps(row.cells, row.ctx);
    assert.equal(s.length, row.n);
    if (row.level) for (const f of [...s, ...w]) { assert.equal(f.level, row.level); assert.match(f.detail, /교시 시각이 없어 교시 번호로 비교함/); }
    assert.deepEqual(w.map(key), s.map(key));
  });
}

test('수정 모드 칸 색: 복식 묶음 · 교시 시각을 안다', () => {
  const info = { 1: { L: 0, P: 5 }, 2: { L: 0, P: 5 } };
  const ctxT = { periods: timed, gradeOf: { 1: 1, 2: 3 }, combined: [] };
  const cells = [C(1, 5), C(2, 1)];
  // 반2 1교시 → 4교시(12:50~13:30) 는 반1 5교시(13:00~13:40)와 시각이 겹친다. 옛 규칙(교시 번호)은 모른다
  const mv = (ctx) => moveConflicts(cells, info, { classroom_id: 2, weekday: 1, period: 1 }, { classroom_id: 2, weekday: 1, period: 4 }, ctx).map((x) => x.rule);
  assert.deepEqual(mv(ctxT), ['teacher_overlap']);
  assert.deepEqual(mv(null), []);
  // 복식 묶음은 지금 상태도 위반이 아니다
  const comb = [C(1, 2, { subject_id: 4 }), C(2, 2, { subject_id: 4 })];
  assert.equal(currentConflicts(comb, info, { combined: [[1, 2]] }).size, 0);
  assert.equal(currentConflicts(comb, info, { combined: [] }).size, 2);
  assert.equal(currentConflicts(comb, info).size, 2);
  assert.deepEqual(combinedOf({ enabled: true, combined_mode: 'separate', combined: [{ classroom_ids: [1, 2] }] }), []);
  assert.deepEqual(combinedOf({ enabled: true, combined: [{ classroom_ids: [1, 2] }] }), [[1, 2]]);
});

test('교시 시각 칸: 저장 형식 만들기', () => {
  assert.deepEqual(buildTimes([{ start: '09:00', end: '09:40' }, { start: '09:50', end: '10:30' }, { start: '', end: '' }]), { ok: true, times: [T('09:00', '09:40'), T('09:50', '10:30')] });
  assert.equal(buildTimes([{ start: '9:00', end: '09:40' }]).ok, false);
  assert.equal(buildTimes([{ start: '10:00', end: '09:40' }]).ok, false);
  assert.deepEqual(buildTimes([{ start: '', end: '' }, { start: '09:00', end: '09:40' }]), { ok: true, times: [null, T('09:00', '09:40')] }); // 앞이 비어도 저장
  assert.deepEqual(buildTimes([{ start: '', end: '' }]), { ok: true, times: [] });
  assert.deepEqual(rowsOf([T('09:00', '09:40')], 2), [{ start: '09:00', end: '09:40' }, { start: '', end: '' }]);
});

test('내 시간표 빈 사유: 적용 전 · 시안만 · 시간표 없음 · 내 수업 없음', () => {
  assert.match(emptyReason(null, [{ status: '확정' }]).title, /적용 전/);
  assert.match(emptyReason(null, [{ status: '시안' }]).title, /시안만/);
  assert.match(emptyReason(null, []).title, /아직 시간표가 없/);
  assert.match(emptyReason({ id: 1 }, []).title, /내 수업 없음/);
});

test('생성 설정 세부값: 저장 조각 만들기(기본·빈 칸은 뺀다)', () => {
  const x = extraFrom({ params: { maxConsec: 4, roundSubjects: [] }, options: { oneSubjectDay: true, roomClassSplit: false }, avoid: { 5: [{ weekday: 1, period: 1 }], 6: [] } });
  assert.deepEqual(extraToWeights(x), { params: { maxConsec: 4 }, options: { oneSubjectDay: true }, avoid: { 5: [{ weekday: 1, period: 1 }] } });
  assert.deepEqual(extraToWeights(extraFrom({})), {});
});
