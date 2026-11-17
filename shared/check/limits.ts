// 조각별 크기 한도 — 설계 ④ 1절 표 · ③ 7절(T-2n-6). 화면(80% ⚠️)과 함수 `parts`(413)가 이 표 하나를 읽는다.
// 한도는 받은 평문 JSON 바이트(UTF-8 · gzip·암호화 전)로 잰다. 순수 모듈 — DOM·Node·Deno API 금지.
// MB·KB 는 1024 단위로 잡았다(10 MB = 10 × 1024 × 1024 바이트).

const KB = 1024
const MB = 1024 * KB

/** 조각 이름 → 한도(바이트). 보관 조각 `doc@<n>` 은 `doc` 줄을 따른다. */
export const PART_LIMITS = {
  doc: 10 * MB,
  'ops.rooms': 1 * MB,
  'ops.calendar': 1 * MB,
  'ops.fixed': 1 * MB,
  'ops.classSubjects': 1 * MB,
  'ops.changes': 4 * MB,
  'ops.aux': 4 * MB,
  'ops.settings': 64 * KB,
  'ops.installed': 64 * KB,
} as const satisfies Record<string, number>

export type LimitedPart = keyof typeof PART_LIMITS

/** 화면이 ⚠️ 를 띄우는 비율(① 11-3 「덩어리」 줄) */
export const PART_WARN_RATIO = 0.8

/** 보관 조각 이름 `doc@<n>`(n ≥ 1 정수) */
export const ARCHIVE_RE = /^doc@([1-9]\d*)$/

export const isArchivePart = (part: string): boolean => ARCHIVE_RE.test(part)

/** 표에 있는 조각(보관 제외)인가 */
export const isLimitedPart = (part: string): part is LimitedPart => Object.hasOwn(PART_LIMITS, part)

/** 그 조각의 한도. 모르는 이름이면 undefined. */
export function partLimit(part: string): number | undefined {
  if (isArchivePart(part)) return PART_LIMITS.doc
  return isLimitedPart(part) ? PART_LIMITS[part] : undefined
}

const enc = new TextEncoder()

/** 평문 JSON 의 UTF-8 바이트 수(문자 수가 아니다 — 한글은 한 자 3바이트) */
export const plainSize = (json: string): number => enc.encode(json).length

export type SizeVerdict =
  | { ok: true; part: string; limit: number; size: number; warn: boolean }
  | { ok: false; part: string; limit: number; size: number }

/** 413 `part_too_large {part, limit, size}` 판정 — 한도와 같으면 통과. 모르는 조각은 던진다(부르는 쪽이 404 를 먼저 가른다). */
export function checkPartSize(part: string, size: number): SizeVerdict {
  const limit = partLimit(part)
  if (limit === undefined) throw new Error(`한도 표에 없는 조각: ${part}`)
  if (size > limit) return { ok: false, part, limit, size }
  return { ok: true, part, limit, size, warn: size >= limit * PART_WARN_RATIO }
}
