// 기능 스위치 — 키·단계·이름·한 줄 설명의 정본(서버 server/orgConfig.js·routes/org.js 와 화면이 함께 쓴다).
// 설계: 단계별 기능 설계 절 1·4. 단계는 「스위치 묶음의 이름」일 뿐이다. 0단계(격자·내 정보·도움말)는 스위치가 없고 늘 켜져 있다.
export const FEATURES = [
  { key: 'setup', stage: 1, name: '우리 학교 넣기', why: '명단·반·교과를 넣고 손으로 짠 시간표를 확정합니다' },
  { key: 'loads', stage: 2, name: '시수표', why: '과목별 주당 시간을 적어 두면 다 넣었는지 세어 줍니다' },
  { key: 'output', stage: 2, name: '출력', why: 'PDF·엑셀·한글 파일로 받습니다' },
  { key: 'import', stage: 2, name: '담임 과목 올리기', why: '담임들이 낸 과목 배정 파일을 시수표에 옮겨 적지 않게 합니다' },
  { key: 'gen', stage: 3, name: '자동 생성', why: '몇 분 만에 시간표 초안 여러 개를 받아 골라 고칩니다' },
  { key: 'pins', stage: 3, name: '고정·금지', why: '「이 수업은 이 칸」「이 선생님은 이 칸 금지」를 자동 생성에 알려 줍니다' },
  { key: 'soft', stage: 4, name: '생성 설정', why: '권장 규칙의 우선순위·세부값·교사 티어를 학교 취향대로 정합니다' },
  { key: 'small', stage: 4, name: '소규모교', why: '담임이 과목을 맡거나 두 학년이 한 교실인 학교의 자동 생성 설정입니다(단계와 따로 켤 수 있음)' },
  { key: 'levels', stage: 4, name: '규칙 수위', why: '규칙을 어겼을 때 알림·경고·재확인·끔 중 얼마나 세게 말할지 정합니다' },
  { key: 'sub', stage: 5, name: '보결', why: '결강 시간에 들어갈 수 있는 사람을 바로 보여 줍니다' },
  { key: 'rooms', stage: 5, name: '특별실', why: '특별실 예약이 겹치면 경고하고 빈 방을 찾아 줍니다' },
  { key: 'att', stage: 5, name: '근태', why: '보조인력 근무시간을 넣으면 달마다 합이 나옵니다' },
  { key: 'audit', stage: 6, name: '기록', why: '누가 언제 무엇을 바꿨는지 되짚습니다' },
  { key: 'orgcfg', stage: 6, name: '기관 설정', why: '상한·보결 순서·담당 구분·역할 표시명 같은 학교별 값을 화면에서 손봅니다' },
];

export const FEATURE_KEYS = FEATURES.map((f) => f.key);

// n 단계까지 켜고 나머지는 끈 { 키: boolean }.
export const featuresUpTo = (n) => Object.fromEntries(FEATURES.map((f) => [f.key, f.stage <= n]));

// 메뉴(탭 값) → 켜져야 보이는 스위치 키(하나라도 켜지면 보임). 목록에 없는 메뉴(grid·me)는 0단계라 늘 보인다.
export const MENU_FEATURES = {
  roster: ['setup'], mine: ['setup'], school: ['setup', 'loads', 'pins'],
  gen: ['gen'], softset: ['soft', 'small', 'levels'], orgcfg: ['orgcfg'], out: ['output', 'import'],
  att: ['att'], sub: ['sub'], rooms: ['rooms'], audit: ['audit'],
};

// 빠진 키는 켬(스위치가 생기기 전 기관 호환) — 명시적 false 만 끈다.
export const featureOn = (features, key) => features?.[key] !== false;
export const menuOn = (features, v) => !MENU_FEATURES[v] || MENU_FEATURES[v].some((k) => featureOn(features, k));

// 메뉴 목록 [{v, show}] 에서 보일 것만. 권한(show)과 AND.
export const visibleMenus = (items, features) => items.filter((i) => i.show && menuOn(features, i.v));
