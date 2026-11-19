// 첫 방문 안내 · 순서 안내 · 따라 하기 대본 — 순수 데이터와 함수(F-7). 화면은 web/src/s1c/Guide.jsx.
import { FEATURES, MENU_FEATURES, featureOn } from './features.js';

// 사람·기관 단위 localStorage 키. 같은 브라우저를 여럿이 써도 각자 한 번씩 본다.
const NS = 'tt-intro';
export const seenPrefix = (orgId, userId) => `${NS}:${orgId}:${userId}:`;
export const seenKey = (orgId, userId, menu) => `${seenPrefix(orgId, userId)}${menu}`;
export const walkKey = (orgId, userId) => `tt-walk:${orgId}:${userId}`;

// 이 접두어로 시작하는 키를 지운다(저장소는 localStorage 꼴 — length·key·removeItem).
export function clearSeen(storage, prefix) {
  const keys = [];
  for (let i = 0; i < storage.length; i += 1) { const k = storage.key(i); if (k && k.startsWith(prefix)) keys.push(k); }
  keys.forEach((k) => storage.removeItem(k));
  return keys.length;
}

// 메뉴 → 소개 글 키. 메뉴가 쥔 스위치 중 켜진 첫 것, 스위치 없는 격자는 intro, 내 정보·기능 고르기는 없음.
export function pitchKeyFor(menu, features, pitch) {
  if (menu === 'grid') return 'intro';
  const hit = (MENU_FEATURES[menu] || []).find((k) => featureOn(features, k) && pitch[k]);
  return hit || null;
}

const anyOn = (features, keys) => !keys.length || keys.some((k) => featureOn(features, k));

// 「처음이면 이 순서로」 — 켜진 것만. keys 가 비면 늘 있음.
const ORDER = [
  { keys: ['setup'], t: '명단' },
  { keys: MENU_FEATURES.school, t: '학교 기본(시수표까지)' },
  { keys: ['gen'], t: '자동 생성' },
  { keys: [], t: '시안 저장 → 확정' },
  { keys: ['output', 'import'], t: '출력' },
];
export const orderLine = (features) => ORDER.filter((o) => anyOn(features, o.keys)).map((o) => o.t).join(' → ');

// 환영 창 목록 — 켜진 것만
const WELCOME = [
  { keys: ['setup'], t: '학교 기본 — 반 · 교시 · 점심 시각 (기본 교과 14개는 이미 들어 있습니다)' },
  { keys: ['setup'], t: '명단 — 선생님 계정 만들기' },
  { keys: ['loads'], t: '시수표 — 누가 어느 반에 몇 시간' },
  { keys: [], t: '시간표 — 시안을 만들고 칸을 채우기' },
];
export const welcomeSteps = (features) => WELCOME.filter((o) => anyOn(features, o.keys)).map((o) => o.t);

// 따라 하기 대본 — 단계마다 할 일 2~4줄. 켜는 키는 features.js 의 그 단계 스위치.
export const WALKTHROUGH = [
  { stage: 1, title: '1단계 · 칸에 과목 써서 인쇄하기', steps: [
    '시간표 격자에서 「빠른 시작」 카드에 반 수와 교시 수만 넣으면 빈 시간표가 생깁니다.',
    '칸 하나를 눌러 「과목 이름 직접 쓰기」로 과목을 적습니다. 선생님은 비워 둬도 됩니다.',
    '「내 시간표」로 가 보고, 인쇄 단추로 종이에 뽑아 봅니다.',
  ] },
  { stage: 2, title: '2단계 · 시수표 세어 보고 파일로 받기', steps: [
    '학교 기본의 「시수표」 탭에 과목별 주당 시간을 적습니다.',
    '격자로 돌아가 노란 줄(덜 넣은 줄)을 찾아 마저 채웁니다.',
    '출력 메뉴에서 반 하나를 골라 PDF 로 받아 열어 봅니다.',
  ] },
  { stage: 3, title: '3단계 · 자동 생성과 고정', steps: [
    '자동 생성에서 후보 수를 3으로 두고 눌러 초안을 받습니다.',
    '마음에 드는 초안을 시안으로 저장합니다.',
    '학교 기본의 「고정·금지」 탭에서 체육 한 시간을 「수요일 4교시 고정」으로 걸고 다시 돌려 봅니다.',
  ] },
  { stage: 4, title: '4단계 · 우리 학교 취향 맞추기', steps: [
    '생성 설정에서 「연속 수업 한도」를 하나 낮추고 다시 돌려 달라진 점을 봅니다.',
    '학교 기본의 「규칙 수위」 탭에서 규칙 하나를 「끔」으로 바꾸고 격자 표시를 봅니다.',
  ] },
  { stage: 5, title: '5단계 · 날마다 쓰기(보결·특별실·근태)', steps: [
    '보결의 「올리기」에서 내일 한 시간을 결강으로 올리고 「후보 보기」를 눌러 봅니다.',
    '특별실의 「빈 교실」에서 내일 날짜와 3교시로 빈 방을 찾아 봅니다.',
    '근태에서 오늘 근무 한 줄을 넣고 이번 달 합이 바뀌는지 봅니다. 세 가지는 서로 무관하니 필요한 것만 하면 됩니다.',
  ] },
  { stage: 6, title: '6단계 · 관리(기록·기관 설정)', steps: [
    '격자에서 칸 하나를 고친 뒤 기록을 열어 방금 한 일이 맨 위에 있는지 봅니다.',
    '기관 설정에서 보결 「후보 순서」가 우리 학교와 맞는지 읽어 봅니다.',
  ] },
];

export const SAMPLE_NOTE = '처음이라면 연습용 「예시초등학교」(6학급)에서 해 보세요. 연습용 예시 학교가 필요하면 담당자에게 요청하세요. 실제 학교 자료는 건드리지 않습니다.';

// 그 단계의 스위치만 켜는 목표({키: true}) — 나머지 단계는 그대로 둔다. featureDiff 에 넘긴다.
export const stageTarget = (n) => Object.fromEntries(FEATURES.filter((f) => f.stage === n).map((f) => [f.key, true]));

// 완료 체크 저장값(JSON 배열 문자열) ↔ 단계 번호 배열. 깨진 값은 빈 목록.
export function parseDone(raw) {
  try { const a = JSON.parse(raw || '[]'); return Array.isArray(a) ? a.filter((n) => Number.isInteger(n) && n >= 1 && n <= 6) : []; } catch { return []; }
}
export const toggleDone = (done, n) => (done.includes(n) ? done.filter((x) => x !== n) : [...done, n].sort((a, b) => a - b));
