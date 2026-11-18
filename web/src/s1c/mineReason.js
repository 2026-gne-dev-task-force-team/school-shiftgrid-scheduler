// 순수: 「내 시간표」가 빈 까닭 — 적용 확정본(applied/mine 의 timetable)과 시간표 목록으로 가른다.
// list 는 GET /timetables([{status}]) · 날짜는 읽지 않는다(오늘 적용 여부는 서버 한 곳이 정한다).
export function emptyReason(applied, list = []) {
  if (applied) return { title: '내 수업 없음', body: '오늘 적용 중인 확정 시간표에 내 이름으로 들어간 수업이 없습니다.' };
  if (list.some((t) => t.status === '확정')) return { title: '아직 적용 전입니다', body: '확정된 시간표가 있지만 적용 시작일이 아직 오지 않았습니다. 시작일이 되면 내 수업이 여기에 보입니다.' };
  if (list.length) return { title: '아직 확정본이 없습니다(시안만 있음)', body: '관리자가 시안을 확정하면 내 수업이 여기에 보입니다.' };
  return { title: '아직 시간표가 없습니다', body: '관리자가 시간표를 만들면 내 수업이 여기에 보입니다.' };
}
