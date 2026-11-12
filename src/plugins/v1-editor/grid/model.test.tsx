// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { emptyDoc, type Doc } from '../legacy/types/doc'
import type { Slot } from '../legacy/types/schema'
import { buildGrid } from './model'
import { TimetableGrid } from './GridView'

const slot = (index: number, label: string, start: string, end: string, assignable = true, kind?: Slot['kind']): Slot => ({ index, label, start, end, assignable, kind })
const spec = (id: string, slots: Slot[], extra = {}) => ({ id, name: id, cycleDays: 7, activeDays: [0, 1, 2, 3, 4], dayStart: '09:00', dayEnd: '14:00', slots, ...extra })

/** 1학년(2교시 뒤 점심)·5학년(3교시 뒤 점심, 금요일은 2교시까지) 두 틀 */
function sampleDoc(): Doc {
  const d = emptyDoc('가상초', '2026-2')
  d.specs = [
    spec('s1', [slot(0, '1교시', '09:00', '09:40'), slot(1, '2교시', '09:50', '10:30'), slot(2, '점심', '10:30', '11:20', false, 'lunch')]),
    spec('s5', [slot(0, '1교시', '09:00', '09:40'), slot(1, '2교시', '09:50', '10:30'), slot(2, '3교시', '10:40', '11:20'), slot(3, '점심', '11:20', '12:10', false, 'lunch')], { lessonsPerDay: { 4: 2 } }),
  ]
  d.agents = [
    { kind: 'agent', id: 'a1', name: '김과학', role: '전담' },
    { kind: 'agent', id: 'a2', name: '이체육', role: '전담' },
    { kind: 'agent', id: 'a3', name: '박보결', role: '전담' },
  ]
  d.activities = [{ kind: 'activity', id: 'k', name: '국어' }, { kind: 'activity', id: 'm', name: '수학' }, { kind: 'activity', id: 'sc', name: '과학' }]
  d.resources = [{ kind: 'resource', id: 'r1', name: '과학실' }]
  d.tracks = [
    { kind: 'track', id: 't1', name: '1-1', specId: 's1', grade: 1, homeroomName: '최담임' },
    { kind: 'track', id: 't5', name: '5-1', specId: 's5', grade: 5, homeroomName: '정담임' },
  ]
  d.timetables = [
    { id: 'tt', name: '2학기', specId: 's5', startDate: '2026-09-01', endDate: '2026-12-31', priority: 1 },
    { id: 'tx', name: '시험주간', specId: 's5', startDate: '2026-11-16', endDate: '2026-11-17', priority: 9 },
  ]
  const w = (id: string, trackId: string, dayIndex: number, slotIndex: number, extra: object) => ({ kind: 'work' as const, id, timetableId: 'tt', trackId, dayIndex, slotIndex, ...extra })
  d.assignments = [
    w('x1', 't1', 2, 0, { activityId: 'k', agentId: '__homeroom__' }),
    w('x2', 't1', 2, 1, { activityId: 'm', agentId: 'a2', coAgentId: 'a3' }),
    w('x3', 't5', 2, 0, { activityId: 'sc', agentId: 'a1', resourceId: 'r1' }),
    w('x4', 't5', 2, 2, { activityId: 'm', agentId: '__homeroom__' }),
    w('x5', 't5', 4, 1, { label: '창체', agentId: 'a2' }),
  ]
  return d
}

const WED = '2026-11-11' // 수요일(dayIndex 2)
const cellsOf = (g: ReturnType<typeof buildGrid>) => (g.ok ? g.rows.map((r) => [r.trackName, r.off, r.cells.map((c) => [c.status, c.subject, c.teacher, c.coTeacher, c.room, c.was && JSON.stringify(c.was)].filter((x) => x != null && x !== '').join('|')).join(' / ')]) : g)

describe('읽기 격자 — 날짜별 변경 얹기 스냅숏', () => {
  it('평소: 틀이 다른 두 반이 같은 교시 열에 놓이고, 없는 교시는 none · 빈 칸은 담임 수업', () => {
    const g = buildGrid(sampleDoc(), WED)
    expect(g.ok && g.periods).toEqual([1, 2, 3])
    expect(cellsOf(g)).toMatchInlineSnapshot(`
      [
        [
          "1-1",
          false,
          "homeroom|국어|최담임 / normal|수학|이체육|박보결 / none",
        ],
        [
          "5-1",
          false,
          "normal|과학|김과학|과학실 / homeroom|정담임 / homeroom|수학|정담임",
        ],
      ]
    `)
  })

  it('얹기 전부: 교시 과목 변경 + 보결 + 반 전체 없음(학년 행사)', () => {
    const g = buildGrid(sampleDoc(), WED, {
      changes: [{ trackName: '5-1', period: 1, activityName: '체험학습' }],
      substitutes: [{ trackName: '1-1', startMin: 9 * 60 + 50, endMin: 10 * 60 + 30, takerName: '오보결', absentName: '이체육' }],
    })
    expect(cellsOf(g)).toMatchInlineSnapshot(`
      [
        [
          "1-1",
          false,
          "homeroom|국어|최담임 / sub|수학|오보결|박보결|{"teacher":"이체육"} / none",
        ],
        [
          "5-1",
          false,
          "changed|체험학습|김과학|과학실|{"subject":"과학"} / homeroom|정담임 / homeroom|수학|정담임",
        ],
      ]
    `)
    const g2 = buildGrid(sampleDoc(), WED, { calendar: [{ kind: '소풍', targetKind: 'grade', targetValue: '5' }], changes: [{ trackName: '1-1', period: null, activityName: '행사' }] })
    expect(cellsOf(g2)).toMatchInlineSnapshot(`
      [
        [
          "1-1",
          true,
          "off / off / none",
        ],
        [
          "5-1",
          true,
          "off / off / off",
        ],
      ]
    `)
  })

  it('학교 전체 쉼 · 주말 · 시간표 없는 날은 표가 없다', () => {
    expect(buildGrid(sampleDoc(), WED, { calendar: [{ kind: '재량휴업', targetKind: 'all', targetValue: '' }] })).toEqual({ ok: false, reason: 'school-off', offReason: '재량휴업' })
    expect(buildGrid(sampleDoc(), '2026-11-14')).toEqual({ ok: false, reason: 'weekend', date: '2026-11-14' })
    expect(buildGrid(sampleDoc(), '2026-08-12')).toEqual({ ok: false, reason: 'no-timetable', date: '2026-08-12' })
  })

  it('priority 큰 특별표가 이기고, 요일별 교시 수(금은 2교시까지라 열도 둘)·입력 불변', () => {
    const doc = sampleDoc()
    const before = JSON.stringify(doc)
    expect(buildGrid(doc, '2026-11-16')).toMatchObject({ ok: true, timetableName: '시험주간' })
    const fri = buildGrid(doc, '2026-11-13', {})
    expect(fri.ok && fri.rows[1]!.cells.map((c) => c.status)).toEqual(['homeroom', 'normal'])
    expect(JSON.stringify(doc)).toBe(before)
  })

  it('렌더 한 건: 변경·보결이 표에 보인다', () => {
    const html = renderToStaticMarkup(
      <TimetableGrid doc={sampleDoc()} date={WED} overlay={{ changes: [{ trackName: '5-1', period: 1, activityName: '체험학습' }], substitutes: [{ trackName: '1-1', startMin: 590, endMin: 630, takerName: '오보결' }] }} />,
    )
    expect(html).toMatchInlineSnapshot(`"<table aria-label="2026-11-11 시간표"><caption>2026-11-11 2학기</caption><thead><tr><th>반</th><th>1교시</th><th>2교시</th><th>3교시</th></tr></thead><tbody><tr><th scope="row">1-1</th><td data-status="homeroom" title="09:00~09:40"><div>국어</div><div>최담임</div></td><td data-status="sub" title="09:50~10:30"><div>수학</div><div>오보결 · 박보결<s> 이체육</s></div><b>보결</b></td><td data-status="none"></td></tr><tr><th scope="row">5-1</th><td data-status="changed" title="09:00~09:40"><div>체험학습<s> 과학</s></div><div>김과학 @과학실</div><b>변경</b></td><td data-status="homeroom" title="09:50~10:30"><div></div><div>정담임</div></td><td data-status="homeroom" title="10:40~11:20"><div>수학</div><div>정담임</div></td></tr></tbody></table>"`)
  })
})
