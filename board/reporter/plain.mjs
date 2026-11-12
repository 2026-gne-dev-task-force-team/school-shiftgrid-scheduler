// 공개 스냅숏용 담백 검사 — 서버 board.plain()(/ \ @ · 낱말 시작 sk- · eyJ)보다 넓게 거른다.
// src/lib/plain.ts 는 접수 글용(「3/4교시」 의 / 를 받는다)이라 여기선 따로 둔다.
const SHAPES = [
  /[/\\@]/, // 경로·이메일 (서버 check 와 같음)
  /[A-Za-z]:(?![0-9])/, // 드라이브 꼴 「D:」 (시각 14:36 은 통과)
  /(^|[^A-Za-z0-9])sk[-_]/i, // 열쇠 꼴
  /eyJ/, // 토큰 꼴
  /gh[pousr]_/, // 깃허브 토큰 꼴
  /\b[0-9a-f]{16,}\b/i, // 긴 16진
  /맥|업무 ?PC|씽크패드|thinkpad|NAS/i, // 기기 이름
  /메인|보조/, // 우리 말 — 세션 구분
  /opus|sonnet|haiku|fable/i, // 모델 이름
  /\[\[|\]\]/, // 볼트 노트 링크
]
export const isPlain = (s) => typeof s !== 'string' || !SHAPES.some((r) => r.test(s))
export const clean = (s) => (isPlain(s) ? s : '')

/** 스냅숏 전체의 글 값을 훑어 걸리는 첫 자리를 돌려준다(없으면 null). */
export function findDirty(obj, path = '') {
  if (typeof obj === 'string') return isPlain(obj) ? null : path
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      const hit = findDirty(v, `${path}.${k}`)
      if (hit) return hit
    }
  }
  return null
}

// 긴 글(요청 원문·설명·완료 조건)용 — 사람 이름·직함 꼴을 더 거른다. 제목용 SHAPES 에는 안 넣는다(「시간표 선생님」 같은 일반 낱말에 제목이 비는 걸 피한다).
const NAMES = [/[가-힣]{2,4}\s?(선생님|주무관|교사|장학사|계장|과장|서기)(?:(?![가-힣])|(?=[이가은는을를의께도과와에]))/]  // 직함 뒤 조사(「…선생님이」)도 잡는다
// 특정 실명은 코드에 두지 않는다(공개 레포) — 보고꾼 로컬 설정의 `redactNames` 칸에서 받아 build 가 넣어 준다. 칸이 없으면 꼴 규칙만 건다.
let extraNames = []
export const setRedactNames = (list) => { extraNames = (Array.isArray(list) ? list : []).filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) }
export const isPlainText = (s) => isPlain(s) && !NAMES.some((r) => r.test(s)) && !extraNames.some((n) => s.includes(n))
export const TEXT_MAX = 2000
/** 긴 글 → 공개 글. 마크다운을 걷고 문장·줄 단위로 나눠 걸리는 문장만 뺀다(통째로 비우지 않는다). 글자 수로 자르지 않는다(TEXT_MAX 넘으면 문장 경계에서 끊는다). */
export function publicText(s, codeWord = (w) => w) {
  if (typeof s !== 'string') return ''
  const t = s.replace(/`([^`]*)`/g, (_, w) => codeWord(w)).replace(/\[\[[^\]]*\]\]/g, '').replace(/\*\*/g, '').replace(/\\\|/g, '|').replace(/<br\s*\/?>/gi, '\n')
  const out = []
  let n = 0
  for (const seg of t.split(/(?<=[.!?。])\s+|\n+/)) {
    const x = seg.replace(/\s+/g, ' ').trim()
    if (!x || !isPlainText(x)) continue
    if (n + x.length > TEXT_MAX) break
    out.push(x); n += x.length + 1
  }
  return out.join('\n')
}
