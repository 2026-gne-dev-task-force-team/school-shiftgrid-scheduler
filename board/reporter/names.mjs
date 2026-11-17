// 캐릭터 이름(R98) — 사람 이름처럼 고정. 같은 에이전트(seed = 캐릭터 id)면 다시 떠도 같은 이름이고, 직업 낱말로 이름을 만들지 않는다.
// 보고꾼(snapshot.mjs)과 화면(src/lib/actor.ts · 직업 칸 없는 옛 자료의 대체 이름)이 같은 표를 쓴다.
export const NAMES = ['하준', '서윤', '도윤', '지우', '시우', '하린', '예준', '아린', '주원', '수아', '지호', '다은', '건우', '채원', '현우', '소율',
  '유준', '나윤', '민재', '가은', '태민', '유나', '승현', '지안', '재윤', '서아', '은우', '하윤', '이안', '세은', '우진', '연우', '선우', '보람', '한결', '새봄']
const fnv = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) } return h >>> 0 }
/** seed → 이름. taken(이미 쓰인 이름 집합)과 겹치면 다음 칸으로 비켜 간다(같은 시각 같은 이름 없음). 표보다 많이 겹치면 맨 처음 이름을 그대로 쓴다. */
export function pickName(seed, taken = new Set()) {
  const i = fnv(seed) % NAMES.length
  for (let k = 0; k < NAMES.length; k++) { const n = NAMES[(i + k) % NAMES.length]; if (!taken.has(n)) return n }
  return NAMES[i]
}
