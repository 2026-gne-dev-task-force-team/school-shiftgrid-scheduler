import { describe, expect, it } from 'vitest'
import { checkPartSize, isArchivePart, PART_LIMITS, partLimit, plainSize } from './limits.ts'

describe('limits — 조각별 한도(④ 1절 표)', () => {
  it('표 값 그대로', () => {
    expect(PART_LIMITS.doc).toBe(10 * 1024 * 1024)
    expect(PART_LIMITS['ops.changes']).toBe(4 * 1024 * 1024)
    expect(PART_LIMITS['ops.aux']).toBe(4 * 1024 * 1024)
    expect(PART_LIMITS['ops.rooms']).toBe(1024 * 1024)
    expect(PART_LIMITS['ops.settings']).toBe(64 * 1024)
    expect(PART_LIMITS['ops.installed']).toBe(64 * 1024)
  })
  it('doc@<n> 은 doc 한도 · 모르는 이름은 undefined', () => {
    expect(isArchivePart('doc@12')).toBe(true)
    expect(isArchivePart('doc@0')).toBe(false)
    expect(partLimit('doc@3')).toBe(PART_LIMITS.doc)
    expect(partLimit('ops.nope')).toBeUndefined()
    expect(partLimit('toString')).toBeUndefined()
  })
  it('경계 — 한도와 같으면 통과 · 1바이트 넘으면 413 몫 · 80% 에서 warn', () => {
    const l = PART_LIMITS['ops.settings']
    expect(checkPartSize('ops.settings', l)).toMatchObject({ ok: true, warn: true })
    expect(checkPartSize('ops.settings', l + 1)).toEqual({ ok: false, part: 'ops.settings', limit: l, size: l + 1 })
    expect(checkPartSize('ops.settings', Math.floor(l * 0.79))).toMatchObject({ ok: true, warn: false })
    expect(() => checkPartSize('ops.nope', 1)).toThrow()
  })
  it('평문 크기는 UTF-8 바이트', () => {
    expect(plainSize('"가"')).toBe(5)
  })
})
