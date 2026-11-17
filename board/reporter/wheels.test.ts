// T-10dv — U18·R123 보고꾼 보수 여섯: 태스크 표 머리 별칭 · 바퀴→스프린트 · 스프린트 날짜 · 레인 이름 · 도는 레인 · ⏸=대기 · 대화 세션 하는 일
// 픽스처는 운전 레인 노트(씽크패드) 표본을 작게 뜬 것이다(세션 번호는 가짜). 볼트 파일은 읽지 않는다.
import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error — 보고꾼은 node ESM(.mjs)이라 타입 선언이 없다
import { build, headAlias, laneTitleOf, parseLaneNote, parseWheels } from './snapshot.mjs'
// @ts-expect-error — 위와 같음
import { findDirty } from './plain.mjs'

type T = { id: string; sprint: number; column: string; reason: string; lane_id: string }
type S = { id: number; title: string; began: string; ended: string | null; task_ids: string[]; passed: boolean | null }
type A = { id: string; kind: string; state: string; task_id: string | null }
type L = { id: string; title: string; state: string }

const NOW = new Date('2026-11-17T01:20:00Z') // KST 11-17 10:20
const ago = (min: number) => new Date(NOW.getTime() - min * 60e3)

const THINKPAD = `# 레인 씽크패드

**맡은 세션**: aaaa1111 · 운전
**지금**(10:13): 🔨 바퀴 6 — U19 이름 ∥ U18 보고꾼 · aaaa1111

## 판 표

| 칸 | 판 | 무엇 | 왜 이 자리 | 모델·노력 | 상태 |
|---|---|---|---|---|---|
| 1 | T-10cq | 저녁 반영 | 순서 | 깊게 | ⏸ 저녁·주말 반영 대기(조건 녹색) |

## 진행 로그

| 시각 | 판 | 결과 | 비고 |
|---|---|---|---|
| 11-17 10:13 | 바퀴 6 시작(T-10du·T-10dv) | 띄움 | |
| 11-17 10:13 | 바퀴 5(B7·B10) | 합침 | |
| 11-17 09:30 | 바퀴 2(B3·R121) | 합침 | |
| 11-17 08:17 | 바퀴 1 끝 | 녹색 | |
| 11-17 07:41 | 바퀴 1 시작 | 시작 | |
| 11-17 23:50 | 바퀴 9 시작(T-10dw) | 미래 줄 | |

## 태스크

| 번호 | 할 일 | 맡은 이 | 상태 |
|---|---|---|---|
| T-10dn | U17 B7 부품 검사 | aaaa1111 → 서브 | ✅ |
| T-10dp | U17 B10 셋째 묶음 | aaaa1111 → 서브 | ✅ |
| T-10dt | 현황판 말줄임 | 서브 | 🔄 |
| T-10du | U19 캐릭터 이름 | 서브 | 🔄 |
| T-10dv | U18 보고꾼 보수 | 서브 | 🔄 |
| T-10dw | 마이그레이션 둘째 | 서브 | ⬜ |
`
const L1 = `## 스프린트 8 — 앞 판 (10:00~11:00)
- **목표**: 앞 판

| 태스크 | 무엇 | 팀 | est_min | 상태 |
|---|---|---|---|---|
| T-1a | 첫 일 하기 | 코드 | 5 | ✅ |
`
function laneRoot(spec: Record<string, { body: string; ageMin?: number }>) {
  const root = mkdtempSync(join(tmpdir(), 'u18-'))
  for (const [dir, { body, ageMin }] of Object.entries(spec)) {
    mkdirSync(join(root, dir))
    const f = join(root, dir, `레인 ${dir}.md`)
    writeFileSync(f, body)
    const t = ago(ageMin ?? 0)
    utimesSync(f, t, t)
  }
  return root
}
const run = (extra: Record<string, unknown> = {}, body = THINKPAD, ageMin = 2) =>
  build({ now: NOW, md: L1, laneRoot: laneRoot({ 씽크패드: { body, ageMin } }), ...extra })

describe('U18 ① 태스크 표 머리 별칭', () => {
  it('「| 번호 | 할 일 | 맡은 이 | 상태 |」 표를 태스크 표로 읽는다', () => {
    expect(headAlias(['번호', '할 일', '맡은 이', '상태'])).toEqual(['태스크', '무엇', '맡은 이', '상태'])
    expect(headAlias(['칸', '판', '무엇', '상태'])).toEqual(['칸', '판', '무엇', '상태']) // 판 표는 그대로
    const note = parseLaneNote(THINKPAD)
    expect(note.rows.map((r: { id: string }) => r.id)).toEqual(['T-10cq', 'T-10dn', 'T-10dp', 'T-10dt', 'T-10du', 'T-10dv', 'T-10dw'])
    expect(note.now).toMatch(/^🔨 바퀴 6/) // 「**지금**(10:13):」 꼴도 읽는다
  })
})

describe('U18 ②③ 바퀴 → 스프린트', () => {
  it('새 꼴·옛 꼴 바퀴 줄을 시각순으로 읽고 미래 줄은 버린다', () => {
    const w = parseWheels(THINKPAD, 2026, NOW.getTime(), parseLaneNote(THINKPAD).now)
    expect(w.map((x: { n: number }) => x.n)).toEqual([1, 2, 5, 6])
    expect(w[0]).toMatchObject({ began: '2026-11-17T07:41:00+09:00', ended: '2026-11-17T08:17:00+09:00' })
    expect(w[2]).toMatchObject({ ended: '2026-11-17T10:13:00+09:00', ids: ['B7', 'B10'] }) // 옛 꼴 = 시작이자 끝
    expect(w[3]).toMatchObject({ ended: null, ids: ['T-10du', 'T-10dv', 'U19', 'U18'] }) // 열린 바퀴 + 「지금」 줄 번호
  })

  it('끝 없이 다음 바퀴가 열리면 그 앞 마지막 로그 줄로 닫는다(「띄움」도 시작)', () => {
    const md = `## 진행 로그\n\n| 시각 | 판 | 결과 |\n|---|---|---|\n| 11-17 07:41 | 바퀴 1 시작 | ok |\n| 11-17 07:01 | T-10cu 도구 | ok |\n| 11-16 18:56 | 바퀴 1 띄움 | ok |\n`
    const w = parseWheels(md, 2026, NOW.getTime())
    expect(w).toHaveLength(2)
    expect(w[0]).toMatchObject({ began: '2026-11-16T18:56:00+09:00', ended: '2026-11-17T07:01:00+09:00' })
    expect(w[1].ended).toBeNull()
  })

  it('바퀴가 지금 판 최대 번호 다음부터 스프린트가 되고, 일감 카드에 그 번호가 붙는다', () => {
    const d = run()
    const sp: S[] = d.sprints
    expect(sp.map((s) => s.id)).toEqual([8, 9, 10, 11, 12])
    expect(sp.slice(1).map((s) => s.title)).toEqual(['바퀴 1', '바퀴 2 (B3·R121)', '바퀴 5 (B7·B10)', '바퀴 6 (T-10du·T-10dv·U19·U18)'])
    const card = (raw: string) => d.tasks.find((t: T) => t.lane_id !== 'l1' && t.id.endsWith(`-${raw}`)) as T
    expect(card('T-10dn').sprint).toBe(11) // B7 → 「할 일」 칸의 B7
    expect(card('T-10dp').sprint).toBe(11) // B10 (B1 과 안 섞임)
    expect(card('T-10du').sprint).toBe(12)
    expect(card('T-10dv').sprint).toBe(12)
    expect(card('T-10dw').sprint).toBe(0) // 미래 줄의 바퀴는 버렸다
    expect(sp.at(-1)).toMatchObject({ ended: null, passed: null, task_ids: [card('T-10du').id, card('T-10dv').id] })
    expect(d.goals[0]).toMatchObject({ sprint: 12, state: 'work' }) // 지금 도는 바퀴가 현재 스프린트
    expect(findDirty(d)).toBeNull()
  })

  it('모든 스프린트: 시작 ≤ 지금 · 끝 ≥ 시작 · 끝 ≤ 지금', () => {
    for (const s of run().sprints as S[]) {
      expect(Date.parse(s.began)).toBeLessThanOrEqual(NOW.getTime())
      if (s.ended === null) continue
      expect(Date.parse(s.ended)).toBeGreaterThanOrEqual(Date.parse(s.began))
      expect(Date.parse(s.ended)).toBeLessThanOrEqual(NOW.getTime())
    }
  })
})

describe('U18 ④⑤ 레인 이름 · 도는 레인', () => {
  it('기기 이름만인 레인은 「<기기> 운전」, 다른 낱말이 있으면 기기 낱말만 뗀다', () => {
    expect(laneTitleOf('씽크패드')).toBe('씽크패드 운전')
    expect(laneTitleOf('맥 검수')).toBe('검수')
    expect(laneTitleOf('v1·v2 설계')).toBe('v1·v2 설계')
    const lane = run().lanes.find((l: L) => l.id !== 'l1') as L
    expect(lane.title).toBe('씽크패드 운전')
    expect(findDirty({ lanes: [{ title: '씽크패드 운전' }] })).toBeNull()
    expect(findDirty({ tasks: [{ title: '씽크패드 운전' }] })).toBe('.tasks.0.title') // 다른 칸은 그대로 걸린다
  })

  it('「지금」 🔨 + 노트 10분 안이면 표에 🔄 가 없어도 work, 10분 넘으면 아니다', () => {
    const quiet = THINKPAD.replace(/\| 🔄 \|/g, '| ⬜ |')
    expect((run({}, quiet, 5).lanes.find((l: L) => l.id !== 'l1') as L).state).toBe('work')
    expect((run({}, quiet, 30).lanes.find((l: L) => l.id !== 'l1') as L).state).toBe('idle')
  })
})

describe('U18 ⑥ · 덤', () => {
  it('⏸ 줄은 막힘이 아니라 대기 — 카드도 캐릭터도', () => {
    const d = run()
    const cq = d.tasks.find((t: T) => t.id.endsWith('-T-10cq')) as T
    expect(cq).toMatchObject({ column: 'wait' })
    expect(cq.reason).not.toBe('blocked')
    expect((d.actors.find((a: A) => a.task_id === cq.id) as A).state).toBe('wait')
  })

  it('대화 세션 캐릭터의 하는 일 = 그 세션 에이전트가 든 레인 「지금」 줄 첫 번호', () => {
    const gatePath = join(mkdtempSync(join(tmpdir(), 'gate-')), 'actors.json')
    const t0 = NOW.getTime()
    writeFileSync(gatePath, JSON.stringify({ actors: {
      s: { id: 'a-55555555', kind: 'session', role: '세션', started: t0 - 60e3, ended: null },
      u: { id: 'a-66666666', lead: 'a-55555555', task: 'T-10dv', started: t0 - 60e3, ended: null },
      o: { id: 'a-77777777', kind: 'session', role: '세션', started: t0 - 60e3, ended: null }, // 에이전트 없는 세션
    } }))
    const d = run({ gatePath })
    const du = d.tasks.find((t: T) => t.id.endsWith('-T-10du')) as T
    expect((d.actors.find((a: A) => a.id === 'a-55555555') as A).task_id).toBe(du.id) // 「지금」 첫 번호 U19 → T-10du
    expect((d.actors.find((a: A) => a.id === 'a-77777777') as A).task_id).toBeNull()
  })
})
