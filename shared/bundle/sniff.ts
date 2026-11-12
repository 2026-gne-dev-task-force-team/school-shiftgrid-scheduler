import type { Bundle, SniffResult } from './types.ts'

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** 가져온 파일(문자열) 또는 이미 파싱된 JSON(unknown)이 어느 꼴인지 가른다. 던지지 않는다.
 *  순서(설계 ① 3절): bundleVersion 이 있으면 덩어리 → 없을 때만 v1 — 빈 Doc 사고(모르는 모양을 migrateDoc 이 빈 Doc 으로 채움) 방지. */
export function sniff(input: unknown): SniffResult {
  let v = input
  if (typeof input === 'string') {
    if (input.trim() === '') return { kind: 'empty' }
    try { v = JSON.parse(input) } catch { return { kind: 'broken', reason: 'JSON 이 아님(잘렸거나 깨짐)' } }
  }
  if (v === null || v === undefined) return { kind: 'empty' }
  if (Array.isArray(v)) return v.length === 0 ? { kind: 'empty' } : { kind: 'broken', reason: '배열 — 파일 꼴 아님' }
  if (!isObj(v)) return { kind: 'broken', reason: '객체 아님' }
  if (Object.keys(v).length === 0) return { kind: 'empty' }
  if (!('bundleVersion' in v)) return { kind: 'v1', raw: v }
  if (v.bundleVersion !== 1) return { kind: 'broken', reason: `모르는 bundleVersion: ${String(v.bundleVersion)}` }
  if (!isObj(v.parts)) return { kind: 'broken', reason: 'parts 없음' }
  if (!isObj(v.versions)) return { kind: 'broken', reason: 'versions 없음' }
  return { kind: 'bundle', bundle: v as Bundle }
}
