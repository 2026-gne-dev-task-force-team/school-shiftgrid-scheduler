// 앱이 들고 있는 시간표 번들의 보관 자리 — 한 곳. 앱(src/app)이 넣고, 플러그인은 shared 를 통해 읽는다(플러그인끼리 import 걷기).
// 순수 모듈: DOM·React 없음. 번들이 없으면 null(새 학교).
import { sniff } from './sniff.ts'
import type { Bundle } from './types.ts'

let current: Bundle | null = null
const subs = new Set<() => void>()

export const getBundle = (): Bundle | null => current

/** 번들을 바꾸고 구독자에게 알린다. null 이면 비운다. */
export function setBundle(next: Bundle | null): void {
  current = next
  subs.forEach((f) => f())
}

/** 바뀔 때 부른다. 돌려받은 함수로 끈다. */
export function subscribeBundle(fn: () => void): () => void {
  subs.add(fn)
  return () => { subs.delete(fn) }
}

/** 가져온 자료(문자열·JSON)를 판별해 덩어리일 때만 들인다. 덩어리가 아니면 안 건드리고 이유를 돌려준다. */
export function loadBundle(raw: unknown): { ok: true; bundle: Bundle } | { ok: false; reason: string } {
  const r = sniff(raw)
  if (r.kind === 'bundle') { setBundle(r.bundle); return { ok: true, bundle: r.bundle } }
  return { ok: false, reason: r.kind === 'broken' ? r.reason : r.kind === 'empty' ? '빈 자료' : 'v1 파일(번들 아님)' }
}
