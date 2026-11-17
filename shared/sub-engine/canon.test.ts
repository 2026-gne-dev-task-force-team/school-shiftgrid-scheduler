import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { compareGroup, diffKinds, parseCanon, runCanon, type CanonAdapter, type CanonCase } from './canon'
import { sample } from './sample'
import { makeGridAdapter, bareGrid, normalizeGrid } from './canon-input'
import { substituteCandidates, whyNot } from './candidates'

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
  it('diffKinds: 어긋남을 「묶음·빠짐/남음」 유형별로 센다(큰 것부터 고치는 순서표)', () => {
    expect(diffKinds([{ index: 0, group: 'C', missing: ['가'], extra: ['나', '다'] }, { index: 1, group: 'C', missing: [], extra: ['라'] }, { index: 2, group: 'X', missing: ['마'], extra: [] }]))
      .toEqual({ 'C+': 3, 'C-': 1, 'X-': 1 })
  })
  it('정답지 파일이 있으면 앞 절반(0~909번)·뒤 절반(910~1819번) 각각 어긋남 0 — 읽고 기록 파일에 남긴다(없으면 표본만)', () => {
    const dir = process.env.OPS_FIXTURE_DIR
    const f = dir ? join(dir, '보결_정답지_2026-2학기.json') : ''
    const g = dir ? join(dir, '가상학교초_2026-2학기.shiftgrid.json') : ''
    const has = !!f && existsSync(f) && existsSync(g)
    if (!has) { expect(runCanon(sampleCases, adapter)).toMatchObject({ total: 2, mismatched: 0 }); return }
    const fixtureCases = parseCanon(JSON.parse(readFileSync(f, 'utf8')))
    const ad = makeGridAdapter(JSON.parse(readFileSync(g, 'utf8')))
    const front = runCanon(fixtureCases, ad, { from: 0, to: 910 })
    const back = runCanon(fixtureCases, ad, { from: 910, to: 1820 })
    const record = {
      fixtureRead: fixtureCases.length,
      frontTotal: front.total, frontMismatched: front.mismatched,
      backTotal: back.total, backMismatched: back.mismatched, backSkipped: back.skipped,
      diffKinds: diffKinds([...front.diffs, ...back.diffs]),
      sampleTotal: 0, sampleMismatched: 0,
      diffs: [...front.diffs, ...back.diffs].slice(0, 20),
    }
    writeFileSync(join(__dirname, '../../test/canon.record.json'), JSON.stringify(record, null, 2) + '\n')
    expect(fixtureCases).toHaveLength(1820)
    expect(front).toMatchObject({ total: 910, skipped: 0, mismatched: 0 })
    expect(back).toMatchObject({ total: 910, skipped: 0, mismatched: 0 })
  })

  const dir = process.env.OPS_FIXTURE_DIR
  const f = dir ? join(dir, '보결_정답지_2026-2학기.json') : ''
  const g = dir ? join(dir, '가상학교초_2026-2학기.shiftgrid.json') : ''
  const has = !!f && existsSync(f) && existsSync(g)
  const load = () => ({ cases: parseCanon(JSON.parse(readFileSync(f, 'utf8'))), grid: JSON.parse(readFileSync(g, 'utf8')) as unknown })

  it('정답지 전체 1,820건 어긋남 0 (없으면 건너뜀)', () => {
    if (!has) return
    const { cases, grid } = load()
    expect(runCanon(cases, makeGridAdapter(grid))).toMatchObject({ total: 1820, skipped: 0, mismatched: 0 })
  })
  it('담임 뺀 판 · 정규화 전후: 담임 배치를 모두 빼도(이름도 「N」으로) 1,820건이 같다', () => {
    if (!has) return
    const { cases, grid } = load()
    const bare = bareGrid(grid)
    expect((bare as { assignments: unknown[] }).assignments.length).toBe(189)
    for (const src of [bare, normalizeGrid(bare)]) expect(runCanon(cases, makeGridAdapter(src))).toMatchObject({ total: 1820, skipped: 0, mismatched: 0 })
  })
  it('어댑터: coAgentId 가 든 담임 칸은 coIds 로 읽혀 그 반 담임이 homeroom-with-aux 로 빠진다(합성 판)', () => {
    const slot = (index: number, start: string, end: string) => ({ index, start, end, kind: 'lesson', assignable: true })
    const grid = {
      agents: [{ id: 'a1', name: '보조', role: '전담' }],
      specs: [{ id: 's', slots: [slot(0, '09:00', '09:40'), slot(1, '09:50', '10:30')] }],
      tracks: [{ name: '1-1', specId: 's', grade: 1 }, { name: '1-2', specId: 's', grade: 1 }],
      assignments: [{ trackId: 't-1-2', dayIndex: 0, slotIndex: 0, agentId: '__homeroom__', coAgentId: 'a1' }],
      weeklyBlocks: [],
    }
    const c = { dayIndex: 0, start: '09:00', end: '09:40', self: '1-1', A: [], B: [], C: [], X: ['1-2'] } as unknown as CanonCase
    const b = makeGridAdapter(grid)(c, 0)!
    expect(b.input.tracks.find((t) => t.name === '1-2')!.lessons[0].coIds).toEqual(['a1'])
    expect(substituteCandidates(b.input, b.query).excluded.find((e) => e.id === 'homeroom:1-2')?.code).toBe('homeroom-with-aux')
    const none = makeGridAdapter({ ...grid, assignments: [{ ...grid.assignments[0], coAgentId: undefined }] })(c, 0)!
    expect(substituteCandidates(none.input, none.query).excluded.find((e) => e.id === 'homeroom:1-2')).toBeUndefined()
  })
  it('whyNot: 표본에서 빠진 교사는 문장이 있고 후보는 빈 목록', () => {
    const q = { trackName: '1-1', startMin: 540, endMin: 580, absentId: 'S1' }
    const r = substituteCandidates(sample(), q)
    const inRes = new Set([...r.A, ...r.B, ...r.C, ...r.D].map((c) => c.id))
    for (const p of sample().people) expect(whyNot(sample(), q, p.id).length === 0, p.id).toBe(inRes.has(p.id))
  })
  it('whyNot: 정답지 전수 — 후보면 빈 목록, 아니면 문장 있음 · 쌍 1,820×사람 (없으면 건너뜀)', () => {
    if (!has) return
    const { cases, grid } = load()
    const ad = makeGridAdapter(grid)
    let checked = 0, said = 0
    cases.forEach((c, i) => {
      const b = ad(c, i)!
      const r = substituteCandidates(b.input, b.query)
      const inRes = new Set([...r.A, ...r.B, ...r.C, ...r.D].map((x) => x.id))
      for (const p of b.input.people) {
        const w = whyNot(b.input, b.query, p.id)
        checked++
        if (w.length) said++
        if ((w.length === 0) !== inRes.has(p.id)) throw new Error('어긋남 ' + i + ' ' + p.id)
      }
    })
    expect(checked).toBeGreaterThan(1820 * 10)
    expect(said).toBeGreaterThan(0)
  })
  it('whyNot: 합성 판(정답지 없이) — 빠지는 길마다 문장이 맞고, 후보 여부가 substituteCandidates 와 사람마다 같다', () => {
    // 1학년 점심 12:00 · 2학년 점심 12:40 → 학교 점심 칸 둘. 질의 = 1-1 담임 결근 12:00~12:40
    const sl = (index: number, start: string, end: string, kind = 'lesson') => ({ index, start, end, kind, assignable: kind === 'lesson' })
    const grid = {
      agents: [['s1', '영어'], ['s2', '음악'], ['s3', '체육'], ['s4', '과학'], ['n1', '사서', '비교과'], ['x1', '협력']].map(([id, name, role]) => ({ id, name, role: role ?? '전담' })),
      specs: [
        { id: 'g1', slots: [sl(0, '09:00', '09:40'), sl(1, '12:00', '12:40', 'lunch'), sl(2, '12:40', '13:20')] },
        { id: 'g2', slots: [sl(0, '09:00', '09:40'), sl(1, '12:00', '12:40'), sl(2, '12:40', '13:20', 'lunch')] },
      ],
      tracks: [{ name: '1-1', specId: 'g1', grade: 1 }, { name: '1-2', specId: 'g1', grade: 1 }, { name: '2-1', specId: 'g2', grade: 2 }, { name: '2-2', specId: 'g2', grade: 2 }, { name: '2-3', specId: 'g2', grade: 2 }],
      assignments: [
        { trackId: 't-1-1', dayIndex: 0, slotIndex: 2, agentId: 's1' }, // s1: 남은 점심 칸(12:40)에 수업 → 점심 막힘
        { trackId: 't-2-1', dayIndex: 0, slotIndex: 1, agentId: 's3' }, // s3: 그 시각 2-1 수업 · 2-1 담임은 빈 몸
        { trackId: 't-2-2', dayIndex: 0, slotIndex: 1, agentId: '__homeroom__', coAgentId: 'x1' }, // 2-2: 담임 수업 + 보조
      ],
      weeklyBlocks: [{ dayIndex: 0, from: '12:00', to: '12:40', targets: [{ kind: 'agent', id: 's2' }], name: '협의회' }],
    }
    const b = makeGridAdapter(grid)({ dayIndex: 0, start: '12:00', end: '12:40', self: '1-1', A: [], B: [], C: [], X: [] }, 0)!
    const why = (id: string) => whyNot(b.input, b.query, id)
    expect(why('homeroom:1-1')).toEqual(['못 나오는 본인']) // 정답지 꼴은 결근자 = 그 반 담임
    expect(whyNot(b.input, { ...b.query, absentId: null }, 'homeroom:1-1')).toEqual(['결강 난 반 담임이 본인이거나 결근자를 모름'])
    expect(why('homeroom:1-2')).toEqual(['1학년 점심 급식지도 시간'])
    expect(why('homeroom:2-1')).toEqual([])
    expect(why('homeroom:2-2')).toEqual(['담임 수업 칸에 보조 인력이 함께 있음'])
    expect(why('homeroom:2-3')).toEqual(['자기 반 2-3 담임 수업 중'])
    expect(why('s1')).toEqual(['점심 칸이 다 막힘'])
    expect(why('s2')).toEqual(['고정 일정 협의회'])
    expect(why('s3')).toEqual(['그 시각 수업 있음 2-1'])
    expect(why('s4')).toEqual([])
    expect(why('n1')).toEqual([])
    expect(why('없는사람')).toEqual(['명단에 없는 사람'])
    expect(whyNot(b.input, { ...b.query, trackName: '9-9' }, 's4')).toEqual(['질의한 반 9-9 이(가) 없음'])
    expect(whyNot(b.input, { ...b.query, endMin: b.query.startMin }, 's4')).toEqual(['질의 시각이 비었음(12:00~12:00)'])
    const r = substituteCandidates(b.input, b.query)
    expect({ A: r.A.map((c) => c.id), C: r.C.map((c) => c.id), D: r.D.map((c) => c.id) }).toEqual({ A: ['homeroom:2-1'], C: expect.arrayContaining(['s4']), D: ['n1'] })
    const inRes = new Set([...r.A, ...r.B, ...r.C, ...r.D].map((c) => c.id))
    for (const p of b.input.people) expect(why(p.id).length === 0, p.id).toBe(inRes.has(p.id))
  })
  it('whyNot: 수업 중인 전담은 「그 시각 수업 있음 반」', () => {
    const inp = sample()
    const q = { trackName: '1-1', startMin: 540, endMin: 580, absentId: null }
    const t = inp.tracks.find((x) => x.lessons.some((l) => (l.teacherIds ?? []).length && l.startMin < 580 && 540 < l.endMin))
    const id = t?.lessons.find((l) => (l.teacherIds ?? []).length && l.startMin < 580 && 540 < l.endMin)?.teacherIds?.[0]
    if (id) expect(whyNot(inp, q, id)[0]).toBe('그 시각 수업 있음 ' + t!.name)
  })
})
