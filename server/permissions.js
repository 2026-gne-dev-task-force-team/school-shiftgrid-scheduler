// 권한 표 — 이 파일이 전부다(모의 해킹 때 「이 표가 전부입니다」로 낸다).
// 설계 「권한 — 역할 × 할 수 있는 일」 표를 그대로 옮겼다. 서버 검사가 방어선이고 버튼 숨김은 편의다.
// 시스템 관리자는 기관 안 데이터를 못 본다 — 기관 안 동작은 하나도 없고 기관 관리 동작만 있다.

export const ROLES = ['시스템관리자', '기관관리자', '교직원', '보기만'];

const ADMIN = '기관관리자';
const STAFF = '교직원';
const VIEW = '보기만';
const SYS = '시스템관리자';

// 동작 이름 → 허용 역할
export const PERMISSIONS = {
  // 기관 밖(교육청)
  'org.manage': [SYS], // 기관 등록·상태·첫 관리자·비번 초기화

  // 기관 안
  'school.manage': [ADMIN], // 학교 기본·명단·역할·계정 만들기·비번 초기화
  'timetable.edit': [ADMIN], // 시수표·자동 생성·시안·확정·새 학기
  'timetable.view': [ADMIN, STAFF, VIEW], // 보기·내려받기·인쇄
  'substitute.own': [ADMIN, STAFF], // 보결 올리기·맡기·내 것 취소
  'substitute.force': [ADMIN], // 강제 지정·해제·남의 것 취소
  'booking.own': [ADMIN, STAFF], // 특별실 예약·내 것 취소
  'booking.manage': [ADMIN], // 고정 칸 잠금·남의 예약 취소
  'attendance.own': [ADMIN, STAFF], // 내 근태 입력
  'attendance.manage': [ADMIN], // 남의 근태·월 마감·마감 풀기
  'audit.view': [ADMIN], // 감사 로그
};

export function can(role, action) {
  const roles = PERMISSIONS[action];
  return Array.isArray(roles) && roles.includes(role);
}
