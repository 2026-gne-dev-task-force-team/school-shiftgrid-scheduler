import { describe, expect, it } from 'vitest'
import { sniff } from './sniff.ts'

// 가짜 표본(실명 없음)
const v1Doc = { schemaVersion: 3, teachers: [{ id: 't1', name: '가나다' }], classes: [] }
const bundle = { bundleVersion: 1, parts: { doc: { doc: v1Doc, validFrom: null, validTo: null }, settings: { schoolName: '가짜학교', term: '1' } }, versions: { doc: '"1.1"' } }

describe('sniff 판별 넷', () => {
  it('덩어리', () => {
    expect(sniff(bundle).kind).toBe('bundle')
    expect(sniff(JSON.stringify(bundle)).kind).toBe('bundle')
  })
  it('v1 파일 — bundleVersion 없는 객체', () => {
    const r = sniff(JSON.stringify(v1Doc))
    expect(r.kind).toBe('v1')
    expect(sniff(v1Doc).kind).toBe('v1')
  })
  it('빈 JSON', () => {
    for (const x of ['', '  \n', 'null', '{}', '[]', null, undefined, {}, []]) expect(sniff(x).kind, String(x)).toBe('empty')
  })
  it('깨진 JSON', () => {
    const cut = JSON.stringify(v1Doc).slice(0, 20)
    for (const x of [cut, '{"a":', 'abc', 123, '123', '"str"', [1], true]) expect(sniff(x).kind, String(x)).toBe('broken')
  })
  it('빈 Doc 사고: 덩어리 표지가 망가지면 v1 으로 떨어지지 않는다', () => {
    expect(sniff({ ...bundle, bundleVersion: 2 }).kind).toBe('broken')
    expect(sniff({ bundleVersion: 1, versions: {} }).kind).toBe('broken')
    expect(sniff({ bundleVersion: 1, parts: {} }).kind).toBe('broken')
  })
})
