import { describe, expect, it } from 'vitest'
import { checkBundle, checkV1, hasBlocking, RULES } from './index.ts'
import { PART_SIZE_WARN } from './rules.ts'

// 가짜 표본(실명 없음). good() 은 어떤 규칙에도 안 걸린다.
const good = (): any => ({
  bundleVersion: 1,
  versions: {},
  parts: {
    doc: {
      validFrom: null, validTo: null,
      doc: {
        meta: { name: '가짜학교', term: '1', schemaVersion: 3 },
        agents: [{ kind: 'agent', id: 'a1', name: '가나다', attr: { 직무: '전담' } }],
        activities: [], resources: [],
        specs: [{ id: 's1', name: '틀1', slots: [{ index: 0, label: '1교시', kind: 'lesson', assignable: true, start: '09:00', end: '09:40' }] }],
        tracks: [{ kind: 'track', id: 't1', name: '1-1', specId: 's1' }, { kind: 'track', id: 't2', name: '1-2', specId: 's1' }],
        timetables: [{ id: 'tt', name: 'x', specId: 's1', startDate: '2026-03-02', endDate: '2026-07-20', priority: 0 }],
        demands: [], assignments: [],
      },
    },
    rooms: { rooms: [{ id: 'r1', name: '가짜실' }], fixed: [{ roomId: 'r1', dayIndex: 0, startMin: 540 }], blocks: [] },
    calendar: [{ id: 'e1', startDate: '2026-05-01', endDate: '2026-05-01', kind: 'x', targetKind: 'all', targetValue: '', note: '' }],
    changes: [{ id: 'c1', date: '2026-05-01', trackName: '1-1', period: null, activityName: null, note: '' }],
    fixed: [{ id: 'f1', personRef: 'a1', dayIndex: 0, startMin: 540, endMin: 580, reason: '', validFrom: null, validTo: null }],
    classSubjects: [{ trackName: '1-2', dayIndex: 0, startMin: 540, subject: '국어' }],
    aux: {},
    settings: { schoolName: '가짜학교', term: '1' },
  },
})
const doc = (b: any) => b.parts.doc.doc

// 규칙마다 버그를 심는 손. 심은 뒤 그 규칙 id 만 걸려야 한다.
const bugs: Record<string, (b: any) => void> = {
  'doc.schema-version': (b) => { doc(b).meta.schemaVersion = 2 },
  'doc.array-missing': (b) => { delete doc(b).demands },
  'doc.spec-missing': (b) => { doc(b).specs = [] },
  'doc.track-missing': (b) => { doc(b).tracks = []; b.parts.changes = []; b.parts.classSubjects = [] },
  'doc.track-spec': (b) => { doc(b).tracks[0].specId = '없는틀' },
  'norm.slot-name': (b) => { doc(b).specs[0].slots[0].label = '첫째시간' },
  'norm.slot-kind': (b) => { delete doc(b).specs[0].slots[0].kind },
  'open.term-default': (b) => { doc(b).timetables[0].startDate = '2026-03-02'; doc(b).timetables[0].endDate = '2027-02-28' },
  'open.job-empty': (b) => { doc(b).agents[0].attr = {} },
  'open.lessons-per-day': (b) => { doc(b).specs[0].lessonsPerDay = { 0: 4 } },
  'id.agent-colon': (b) => { doc(b).agents[0].id = 'x:1'; b.parts.fixed[0].personRef = 'x:1' },
  'id.track-name-dup': (b) => { doc(b).tracks[1].name = '1-1'; b.parts.classSubjects[0].trackName = '1-1' },
  'part.shape': (b) => { b.parts.settings = { schoolName: 1 } },
  'part.room-fixed-overlap': (b) => { b.parts.rooms.fixed.push({ ...b.parts.rooms.fixed[0] }) },
  'ref.track-name': (b) => { b.parts.changes[0].trackName = '없는반' },
  'ref.room-id': (b) => { b.parts.rooms.fixed[0].roomId = 'r9' },
  'bundle.part-size': (b) => { b.parts.aux = { blob: 'x'.repeat(PART_SIZE_WARN) } },
}

describe('ops-check 규칙', () => {
  it('통과 표본은 아무것도 안 걸린다', () => {
    expect(checkBundle(good())).toEqual([])
  })
  it('모든 규칙에 심은 표본이 있다', () => {
    expect(Object.keys(bugs).sort()).toEqual(RULES.map((r) => r.id).sort())
  })
  for (const r of RULES) {
    it(`${r.id} — 심은 표본에서 이 규칙만 걸린다`, () => {
      const b = good(); bugs[r.id](b)
      const issues = checkBundle(b)
      expect([...new Set(issues.map((i) => i.id))]).toEqual([r.id])
      expect(issues[0].severity).toBe(r.severity)
      expect(issues[0].where).toBeTruthy()
    })
  }
  it('error 가 있으면 막힘, warn 만이면 안 막힘', () => {
    const e = good(); bugs['doc.schema-version'](e)
    const w = good(); bugs['norm.slot-name'](w)
    expect(hasBlocking(checkBundle(e))).toBe(true)
    expect(hasBlocking(checkBundle(w))).toBe(false)
  })
  it('v1 파일은 doc 규칙만 돈다', () => {
    expect(checkV1(doc(good()))).toEqual([])
    expect(checkV1({ schemaVersion: 3, teachers: [] }).map((i) => i.id)).toContain('doc.schema-version')
  })
})
