// 캐릭터 이름(R98 · U19) — 사람 이름이 아닌 개발 말장난 이름으로 고정(실명 오해 방지). 같은 에이전트(seed = 캐릭터 id)면 다시 떠도 같은 이름이고, 직업 낱말로 이름을 만들지 않는다.
// 보고꾼(snapshot.mjs)과 화면(src/lib/actor.ts · 직업 칸 없는 옛 자료의 대체 이름)이 같은 표를 쓴다.
export const NAMES = ['머지않아', '브랜치킨', '디버거킹', '린트콩', '캐시미어', '빌드업', '로그인형', '깃발', '리팩토리', '널포인트', '커밋먼트', '푸시업', '풀업', '스택오버플로우', '배포자기', '버그잡이',
  '핫픽스', '롤백이불', '쿼리감자', '콜백전화', '토큰별', '해시브라운', '루프탑', '컴파일러브', '패치워크', '도커스', '스크립트라', '렌더링이', '타입캐스트', '포크레인', '클론이', '프록시마',
  '코드리뷰어', '에러난', '스니펫', '웹훅']
const fnv = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) } return h >>> 0 }
/** seed → 이름. taken(이미 쓰인 이름 집합)과 겹치면 다음 칸으로 비켜 간다(같은 시각 같은 이름 없음). 표보다 많이 겹치면 맨 처음 이름을 그대로 쓴다. */
export function pickName(seed, taken = new Set()) {
  const i = fnv(seed) % NAMES.length
  for (let k = 0; k < NAMES.length; k++) { const n = NAMES[(i + k) % NAMES.length]; if (!taken.has(n)) return n }
  return NAMES[i]
}
