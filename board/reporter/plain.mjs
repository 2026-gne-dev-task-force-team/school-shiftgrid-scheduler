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
