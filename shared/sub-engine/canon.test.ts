import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { compareGroup, parseCanon, runCanon, type CanonAdapter, type CanonCase } from './canon'
import { sample } from './sample'
import { makeGridAdapter } from './canon-input'

/** 맨손 표본 정답지 — 정답지 파일(OPS_FIXTURE_DIR)이 없는 곳에서도 틀이 돈다는 걸 재는 용도 */
const NAMES: Record<string, string> = { 'homeroom:1-1': '김일', 'homeroom:3-1': '이삼', S1: '영어전담', S2: '음악전담', N1: '사서', vp: '교감샘', 'aux:9': '튜터' }
const sampleCases: CanonCase[] = [
  { dayIndex: 0, start: 540, end: 580, self: 'S1', A: ['김일'], B: [], C: ['음악전담'], X: ['이삼'] },
  { dayIndex: 0, start: 640, end: 660, self: 'homeroom:1-1', A: [], B: ['이삼'], C: ['영어전담', '음악전담'], X: [] },
]
const adapter: CanonAdapter = (c) => ({ input: sample(), query: { trackName: '1-1', startMin: Number(c.start), endMin: Number(c.end), absentId: c.self }, nameOf: (id) => NAMES[id] ?? id })

describe('1,820 대조 틀', () => {
  it('compareGroup: 정렬 무관 · 빠진/남은 이름을 가른다', () => {
    expect(compareGroup(['나', '가'], ['가', '나'])).toEqual({ missing: [], extra: [] })
    expect(compareGroup(['가', '나'], ['나', '다'])).toEqual({ missing: ['가'], extra: ['다'] })
  })
  it('parseCanon: 꼴이 틀리면 빈 배열', () => {
    expect(parseCanon(null)).toEqual([])
    expect(parseCanon({ cases: 'x' })).toEqual([])
    expect(parseCanon({ cases: sampleCases })).toHaveLength(2)
  })
  it('틀이 돈다: 표본 2건 — 맞는 정답지는 어긋남 0', () => {
    expect(runCanon(sampleCases, adapter)).toMatchObject({ total: 2, skipped: 0, mismatched: 0 })
  })
  it('어긋난 정답지는 건수·사이 이름을 센다(집계 검산)', () => {
    const bad = [{ ...sampleCases[0], C: ['사서'] }, sampleCases[1]]
    const rep = runCanon(bad, adapter)
    expect(rep.mismatched).toBe(1)
    expect(rep.diffs).toEqual([{ index: 0, group: 'C', missing: ['사서'], extra: ['음악전담'] }])
  })
  it('입력을 못 만들거나 어댑터가 던지면 skipped 로 센다', () => {
    const rep = runCanon(sampleCases, (_c, i) => { if (i === 0) throw new Error('x'); return null })
    expect(rep).toMatchObject({ total: 0, skipped: 2, mismatched: 0 })
  })
  it('정답지 파일이 있으면 앞 절반(0~909번) 어긋남 0 — 읽고 기록 파일에 남긴다(없으면 표본만)', () => {
    const dir = process.env.OPS_FIXTURE_DIR
    const f = dir ? join(dir, '보결_정답지_2026-2학기.json') : ''
    const g = dir ? join(dir, '가상학교초_2026-2학기.shiftgrid.json') : ''
    const has = !!f && existsSync(f) && existsSync(g)
    const fixtureCases = has ? parseCanon(JSON.parse(readFileSync(f, 'utf8'))) : []
    const rep = has ? runCanon(fixtureCases, makeGridAdapter(JSON.parse(readFileSync(g, 'utf8'))), { from: 0, to: 910 }) : runCanon(sampleCases, adapter)
    const record = { fixtureRead: fixtureCases.length, frontTotal: has ? rep.total : 0, frontMismatched: has ? rep.mismatched : 0, sampleTotal: has ? 0 : rep.total, sampleMismatched: has ? 0 : rep.mismatched, diffs: rep.diffs.slice(0, 20) }
    if (has) writeFileSync(join(__dirname, '../../test/canon.record.json'), JSON.stringify(record, null, 2) + '\n')
    if (has) { expect(fixtureCases).toHaveLength(1820); expect(rep).toMatchObject({ total: 910, skipped: 0, mismatched: 0 }) }
    else expect(rep.total).toBe(2)
  })
})
