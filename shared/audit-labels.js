import { SUB_GRADES } from './sub-grades.js';
// 기록 탭 이름표 — 서버가 남기는 동작 이름(audit action)을 학교 사람 말로. 화면과 시험이 한 곳을 본다.
export const ACTION_LABEL = {
  'admin.reset-password': '비밀번호 초기화(시스템 관리자)', 'attendance.close': '근태 마감', 'attendance.delete': '근태 삭제', 'attendance.edit': '근태 고침', 'attendance.reopen': '근태 마감 풂', 'attendance.save': '근태 저장',
  'booking.cancel': '예약 취소', 'booking.create': '예약',
  'org.concurrent-add': '겸임 추가', 'org.create': '기관 만듦', 'org.first-admin': '첫 관리자 만듦', 'org.switch': '기관 전환', 'org.update': '기관 고침', 'password.change': '비밀번호 바꿈',
  'room_lock.create': '특별실 잠금', 'room_lock.delete': '특별실 잠금 풂',
  'roster.create': '명단 추가', 'roster.import': '명단 가져옴', 'roster.lock': '계정 잠금', 'roster.reset-password': '비밀번호 초기화', 'roster.unlock': '계정 잠금 풂', 'roster.update': '명단 고침',
  'school.quick_start': '빠른 시작(반·교시 한 번에 만듦)', 'small-school.save': '작은 학교 설정 저장', 'soft-weights.save': '권장 규칙 설정 저장',
  'substitute.assign': '보결 지정', 'substitute.cancel': '보결 취소', 'substitute.create': '보결 올림', 'substitute.release': '보결 풂', 'substitute.take': '보결 맡음',
  'term.import_previous': '지난 학기 가져옴', 'term.new_semester': '새 학기 시작',
  'timetable.confirm': '시간표 확정', 'timetable.edit_confirmed': '확정본 직접 고침', 'timetable.save': '시안 저장',
};
export const TABLE_LABEL = {
  app_user: '계정', attendance: '근태', booking: '예약', membership: '명단', month_close: '근태 마감', org: '기관', room_lock: '특별실 잠금', substitute: '보결', term: '학기', timetable: '시간표',
};
const KEY_LABEL = {
  on_date: '날짜', date: '날짜', starts_on: '적용 시작일', name: '이름', hours: '시간', ym: '해당 월', role: '역할', status: '상태', grade: '등급', taken: '맡은 사람', by: '올린 사람', for: '결강 교사', ids: '건수',
  classes: '반 수', periods: '교시 수', classrooms: '반', loads: '시수', cells: '칸 수', made: '만든 수', failed: '실패 수', from: '이전 학기', cell: '칸', reason: '사유',
  swap: '두 칸 맞바꿈', weekday: '요일', period: '교시', classroom_id: '반', start: '시작', end: '끝',
};
const labelKey = (k) => KEY_LABEL[k];
const show = (v, k) => (k === 'grade' && SUB_GRADES[v] ? SUB_GRADES[v].name : v == null ? '-' : Array.isArray(v) ? `${v.length}개` : typeof v === 'object' ? null : typeof v === 'boolean' ? (v ? '예' : '아니오') : String(v));

// 대상 칸 요약 — 한국어 이름이 있는 키만 「이름 값」으로. 없는 키·중첩 값이 있으면 raw=true 로 원문을 펼침에 두게 알린다.
export function summarize(obj) {
  if (obj == null || typeof obj !== 'object') return { text: '', raw: false };
  const parts = [];
  let raw = false;
  for (const [k, v] of Object.entries(obj)) {
    const lk = labelKey(k);
    const sv = show(v, k);
    if (!lk || sv == null) { raw = true; continue; }
    parts.push(`${lk} ${sv}`);
  }
  return { text: parts.join(' · '), raw };
}

// 전/후 한 줄 — 같은 항목이 둘 다 있고 값이 다르면 「맡은 사람 - → 김선생」, 한쪽만 있으면 「이전 상태 접수」·그냥 「등급 …」.
export function summarizeChange(before, after) {
  const b = before && typeof before === 'object' ? before : {};
  const a = after && typeof after === 'object' ? after : {};
  const parts = [];
  let raw = false;
  for (const k of [...Object.keys(b), ...Object.keys(a).filter((x) => !(x in b))]) {
    const lk = labelKey(k);
    const sb = k in b ? show(b[k], k) : undefined;
    const sa = k in a ? show(a[k], k) : undefined;
    if (!lk || sb === null || sa === null) { raw = true; continue; }
    if (sb !== undefined && sa !== undefined) parts.push(sb === sa ? `${lk} ${sa}` : `${lk} ${sb} → ${sa}`);
    else if (sa !== undefined) parts.push(`${lk} ${sa}`);
    else parts.push(`이전 ${lk} ${sb}`);
  }
  return { text: parts.join(' · '), raw };
}
