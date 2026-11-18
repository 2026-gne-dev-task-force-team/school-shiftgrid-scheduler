// 시간표 → 출력용 표(시트). 세 출력(PDF·엑셀·HWPX)이 같은 시트를 읽는다.
// 시트: { title, header: [칸...], rows: [[칸...]] } · 칸: { text, kind: null|'changche'|'specialist', shade: bool }
export const DAYS = ['월', '화', '수', '목', '금'];

export async function loadSheetData(pool, orgId, ttId) {
  const q = async (sql, p) => (await pool.query(sql, p)).rows;
  const tt = (await q(`SELECT id, term_id, name, status, starts_on FROM timetable WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`, [ttId, orgId]))[0];
  if (!tt) return null;
  return {
    tt,
    cells: await q(`SELECT classroom_id, weekday, period, subject_id, membership_id, special_room_id FROM cell WHERE org_id = $1 AND timetable_id = $2 AND deleted_at IS NULL`, [orgId, tt.id]),
    classrooms: await q(`SELECT id, grade, class_no FROM classroom WHERE org_id = $1 AND term_id = $2 AND deleted_at IS NULL ORDER BY grade, class_no`, [orgId, tt.term_id]),
    subjects: await q(`SELECT id, name, short_name FROM subject WHERE org_id = $1`, [orgId]),
    teachers: await q(`SELECT m.id, u.name, m.duty FROM membership m JOIN app_user u ON u.id = m.user_id WHERE m.org_id = $1 AND m.deleted_at IS NULL AND m.role <> '시스템관리자'`, [orgId]),
    rooms: await q(`SELECT id, name FROM special_room WHERE org_id = $1`, [orgId]),
    periodConfig: (await q(`SELECT period_config FROM org WHERE id = $1`, [orgId]))[0]?.period_config ?? {},
  };
}

const maxPeriods = (cfg, grades) => Math.max(1, ...grades.map((g) => cfg?.grades?.[g]?.periods ?? 6));
const className = (c) => `${c.grade}학년 ${c.class_no}반`;

// 칸 하나의 글자·종류
function cellView(c, ix, st, withTeacher = true, withClass = null) {
  const sub = ix.subject.get(Number(c.subject_id));
  const t = ix.teacher.get(Number(c.membership_id));
  const room = ix.room.get(Number(c.special_room_id));
  const lines = [sub ? sub.short_name || sub.name : ''];
  if (withClass) lines.push(withClass);
  if (withTeacher && t) lines.push(t.name);
  if (room) lines.push(room.name);
  const isChangche = !!sub && [sub.name, sub.short_name].some((n) => n && st.changcheNames.includes(n));
  const kind = isChangche ? 'changche' : t?.duty === '전담·비교과' ? 'specialist' : null;
  const shade = !!room && st.shadeRoomKeywords.some((k) => room.name.includes(k));
  return { text: lines.filter(Boolean).join('\n'), kind, shade };
}

function index(d) {
  const by = (a) => new Map(a.map((x) => [Number(x.id), x])); // pg bigint 는 문자열 — 숫자로 맞춘다
  return { subject: by(d.subjects), teacher: by(d.teachers), room: by(d.rooms), classroom: by(d.classrooms) };
}

// 반 하나의 시트
export function classSheet(d, st, classroom) {
  const ix = index(d);
  const n = maxPeriods(d.periodConfig, [classroom.grade]);
  const own = d.cells.filter((c) => Number(c.classroom_id) === Number(classroom.id));
  const rows = [];
  for (let p = 1; p <= n; p++) {
    rows.push([{ text: `${p}교시` }, ...DAYS.map((_, i) => {
      const c = own.find((x) => x.weekday === i + 1 && x.period === p);
      return c ? cellView(c, ix, st) : { text: '' };
    })]);
  }
  return { title: className(classroom), header: [{ text: '' }, ...DAYS.map((x) => ({ text: x }))], rows };
}

// 교사 하나의 시트
export function teacherSheet(d, st, teacher) {
  const ix = index(d);
  const own = d.cells.filter((c) => Number(c.membership_id) === Number(teacher.id));
  const n = maxPeriods(d.periodConfig, d.classrooms.map((c) => c.grade).concat(1));
  const rows = [];
  for (let p = 1; p <= n; p++) {
    rows.push([{ text: `${p}교시` }, ...DAYS.map((_, i) => {
      const c = own.find((x) => x.weekday === i + 1 && x.period === p);
      const cl = c && ix.classroom.get(Number(c.classroom_id));
      return c ? cellView(c, ix, st, false, cl ? className(cl) : null) : { text: '' };
    })]);
  }
  return { title: `${teacher.name} 선생님`, header: [{ text: '' }, ...DAYS.map((x) => ({ text: x }))], rows };
}

// view: 'class'(기본) | 'teacher'. classroomId·membershipId 로 하나만 고를 수 있다.
export function buildSheets(d, st, { view = 'class', id = null } = {}) {
  if (view === 'teacher') {
    const list = d.teachers.filter((t) => d.cells.some((c) => Number(c.membership_id) === Number(t.id)) && (!id || Number(t.id) === id));
    return list.sort((a, b) => a.name.localeCompare(b.name, 'ko')).map((t) => teacherSheet(d, st, t));
  }
  return d.classrooms.filter((c) => !id || Number(c.id) === id).map((c) => classSheet(d, st, c));
}

export const sheetsTitle = (d) => `${d.tt.name}${d.tt.status === '확정' ? '' : ' (시안)'}`;
