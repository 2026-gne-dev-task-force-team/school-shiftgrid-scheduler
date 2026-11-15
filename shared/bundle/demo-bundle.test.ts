import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { lessonsOnOf, demoLessons } from '../../src/plugins/ops-aux/source.ts'
import { frameInputFromBundle } from './frame.ts'
import { sniff } from './sniff.ts'

const raw = readFileSync(new URL('../../public/samples/demo-bundle.json', import.meta.url), 'utf8')

describe('public/samples/demo-bundle.json (합성·비식별 데모 번들)', () => {
  it('번들로 판정되고 시간 틀·수업 칸이 비어 있지 않으며 demo 와 다르다', () => {
    const r = sniff(raw)
    expect(r.kind).toBe('bundle')
    if (r.kind !== 'bundle') return
    const f = frameInputFromBundle(r.bundle)
    expect(f).not.toBeNull()
    expect(f!.tracks.length).toBeGreaterThan(0)
    expect(f!.cells.length).toBeGreaterThan(0)
    const lessons = lessonsOnOf(r.bundle)('2026-11-16')
    expect(lessons.length).toBeGreaterThan(0)
    expect(lessonsOnOf(r.bundle)).not.toBe(demoLessons)
    expect(lessons.map((l) => l.trackName)).not.toContain('3-2')
  })
})
