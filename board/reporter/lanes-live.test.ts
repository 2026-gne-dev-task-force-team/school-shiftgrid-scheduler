// T-10bh — R84(집은 카드) · R101①(두 판 레인) · R102(지금 몇 명 · 최근 로그 · 가짜 막힘) 픽스처 시험
import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error — 보고꾼은 node ESM(.mjs)이라 타입 선언이 없다
import { appOfRow, appsOfLane, build, columnOfLinked, parseLaneLog, parsePicked } from './snapshot.mjs'
// @ts-expect-error — 위와 같음
import { findDirty } from './plain.mjs'

type T = { id: string; app: string; column: string; reason: string; lane_id: string; actor_id: string | null }
type A = { id: string; state: string; task_id: string | null }
type E = { ts: string; text: string; subject_type: string }

const NOW = new Date('2026-11-16T05:00:00Z') // KST 14:00
const ago = (min: number) => new Date(NOW.getTime() - min * 60e3)
const L1 = (rows: string) => `## 스프린트 1 — 시험 판 (10:00~)
- **목표**: 시험으로 고친 것을 증명하기

| 태스크 | 무엇 | 팀 | est_min | 상태 |
|---|---|---|---|---|
${rows}
`
/** 레인 뿌리 하나를 만들고 폴더별 노트를 쓴다. ageMin 을 주면 그 폴더 노트 수정 시각을 그만큼 옛날로. */
function lanes(spec: Record<string, { body: string; ageMin?: number }>) {
  const root = mkdtempSync(join(tmpdir(), 'r102-'))
  for (const [dir, { body, ageMin }] of Object.entries(spec)) {
    mkdirSync(join(root, dir))
    const f = join(root, dir, `레인 ${dir}.md`)
    writeFileSync(f, body)
    const t = ago(ageMin ?? 0)
    utimesSync(f, t, t)
  }
  return root
}
const TABLE = (rows: string) => `| 칸 | 판 | 무엇 | 상태 |\n|---|---|---|---|\n${rows}\n`
const working = (d: { actors: A[] }) => d.actors.filter((a) => a.state === 'work' || a.state === 'blocked')

describe('R84 — 집은 카드가 카드 상태를 바꾼다', () => {
  const REQ = '| # | 받은 시각 | 쥔님 원문 | 태스크로 풀면 | 종류 | 상태 |\n|---|---|---|---|---|---|\n| R1 | 11-16 10:00 | 원문 | **보고꾼이 집은 카드를 읽게 하기** | 일 | 📥 대기 |\n'
  it('줄 꼴 셋 · 같은 번호는 마지막 줄 · ✅ 가 든 화살표는 끝', () => {
    const p = parsePicked('- U10 · 🔨 세션 · 11:55\n- R84 · → T-10bh · 세션 · 11:55\n- R84 · ✅ abc1234 (T-10bh) · 13:00\n- R95 · → T-10i ✅ 9523348 · s · 21:12\n')
    expect(p.get('U10')).toBe('🔨 세션')
    expect(p.get('R84')).toMatch(/^✅/)
    expect(p.get('R95')).toMatch(/^✅/)
  })
  it('집은 줄이 없으면 요청함 칸(대기) · 「→ T-」 줄이면 그 태스크 · 끝 줄이면 끝', () => {
    const col = (pickedMd: string) => build({ now: NOW, md: L1('| T-1a | 첫 일 하기 | 코드 | 5 | 🔄 |'), requestMd: REQ, pickedMd }).tasks.find((t: T) => t.id === 'R1').column
    expect(col('')).toBe('wait')
    expect(col('- R1 · → T-1a · s · 11:00\n')).toBe('work')
    expect(col('- R1 · → T-1a · s · 11:00\n- R1 · ✅ abc1234 · 12:00\n')).toBe('done')
  })
  it('요청함 옆 「집은 카드.md」 파일을 스스로 찾는다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'req-'))
    writeFileSync(join(dir, '레인 요청함.md'), REQ)
    writeFileSync(join(dir, '집은 카드.md'), '## 집은 줄\n\n- R1 · ✅ abc1234 · 12:00\n')
    const d = build({ now: NOW, md: L1('| T-1a | 첫 일 하기 | 코드 | 5 | ✅ |'), requestPath: join(dir, '레인 요청함.md') })
    expect(d.tasks.find((t: T) => t.id === 'R1').column).toBe('done')
  })
})

describe('R101① — 두 판이 든 레인 이름', () => {
  it('appsOfLane 은 적힌 판 전부 · appOfRow 는 줄 머리 표시만', () => {
    expect(appsOfLane('v1·v2 설계')).toEqual(['v1', 'v2'])
    expect(appsOfLane('코드 맥')).toEqual(['1.2v'])
    expect(appOfRow('[v2] 저장 구조 짜기')).toBe('v2')
    expect(appOfRow('v1: 화면 고치기')).toBe('v1')
    expect(appOfRow('레포 v1·v2 실물 대조')).toBeNull() // 본문 언급은 표시가 아니다
  })
  it('「v1·v2 설계」 레인 카드는 v2 에도 실린다 · 줄 머리 표시가 있으면 그 판만', () => {
    const root = lanes({ 'v1·v2 설계': { body: TABLE('| 1 | 대조 | 레포 실물과 설계 대조하기 | ✅ |\n| 2 | 저장 | [v2] 저장 구조 새로 짜기 | ⬜ |') } })
    const d = build({ now: NOW, md: L1('| T-1a | 첫 일 하기 | 코드 | 5 | ✅ |'), laneRoot: root })
    const apps = d.tasks.filter((t: T) => t.lane_id !== 'l1').map((t: T) => t.app)
    expect(apps.filter((a: string) => a === 'v2').length).toBeGreaterThan(0)
    expect(apps.sort()).toEqual(['v1', 'v2', 'v2'])
    expect(new Set(d.tasks.map((t: T) => t.id)).size).toBe(d.tasks.length) // 복사본 id 는 안 겹친다
    expect(findDirty(d)).toBeNull()
  })
})

describe('R102① — 아무도 안 돌면 일함 0', () => {
  const body = TABLE('| 1 | 첫판 | 벽 세우기 일 | 🔄 |\n| 2 | 둘판 | 지붕 얹기 일 | ⛔ 자재 없음 |')
  it('레인 노트가 60분 넘게 안 바뀌면 🔄·⛔ 줄 캐릭터는 없다(퇴근) · 레인도 쉼', () => {
    const d = build({ now: NOW, md: L1('| T-1a | 첫 일 하기 | 코드 | 5 | ✅ |'), laneRoot: lanes({ '가 레인': { body, ageMin: 90 } }) })
    expect(working(d)).toEqual([])
    expect(d.lanes[1].state).toBe('idle')
    expect(d.tasks.find((t: T) => t.lane_id !== 'l1' && t.column === 'work')).toBeTruthy() // 카드는 진행 칸에 그대로
  })
  it('60분 안에 바뀌었으면 일함·막힘으로 센다', () => {
    const d = build({ now: NOW, md: L1('| T-1a | 첫 일 하기 | 코드 | 5 | ✅ |'), laneRoot: lanes({ '가 레인': { body, ageMin: 10 } }) })
    expect(working(d).map((a: A) => a.state).sort()).toEqual(['blocked', 'work'])
  })
  it('지금 판 노트(lanePath)도 묵었으면 🔄 줄 캐릭터·지휘 일함이 없다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'l1-'))
    const lanePath = join(dir, '레인 작업현황판.md')
    writeFileSync(lanePath, L1('| T-1a | 첫 일 하기 | 코드 | 5 | 🔄 |\n| T-1b | 둘째 일 하기 | 지휘 | 5 | 🔄 |\n| T-1c | 셋째 일 하기 | 코드 | 5 | ⛔ 기다림 |'))
    const at = (min: number) => { const t = ago(min); utimesSync(lanePath, t, t); return build({ now: NOW, lanePath }) }
    const stale = at(120)
    expect(working(stale)).toEqual([])
    expect(stale.actors.find((a: A) => a.id === 'a-lead').state).not.toBe('work')
    const fresh = at(5)
    expect(working(fresh).length).toBeGreaterThan(0)
  })
})

describe('R102② — 최근 로그는 모든 레인에서 최신순', () => {
  it('표 꼴 · 줄 꼴 · 날짜 잇기 · 자정 넘김 · 날짜 모르는 줄은 버림', () => {
    const md = '## 로그\n\n- 09:00 날짜 모르는 옛 줄\n- 11-15 23:50 어제 밤 줄\n- 00:10 자정 넘은 줄\n\n## 진행 로그\n\n| 시각 | 판 | 결과 | 비고 |\n|---|---|---|---|\n| 11-16 13:30 | 둘째 | ✅ | |\n| 2026-11-12 10:00 | 첫째 | ✅ | |\n'
    expect(parseLaneLog(md, 2026).map((l: { at: string }) => l.at)).toEqual(['11-15 23:50', '11-16 00:10', '11-16 13:30', '11-12 10:00'])
  })
  it('지금 판 로그가 묵어도 다른 레인의 오늘 일이 맨 위 · 번호가 있으면 카드 제목으로', () => {
    const l1 = `${L1('| T-1a | 첫 일 하기 | 코드 | 5 | ✅ |')}\n## 진행 로그 (맨 위가 최신)\n| 시각 | 판 | 결과 | 비고 |\n|---|---|---|---|\n| 11-12 10:00 | T-1a ✅ | 끝 | |\n`
    const root = lanes({
      '가 레인': { body: `${TABLE('| 1 | T-5a | 벽 세우기 일 | ✅ |')}\n## 진행 로그\n\n| 시각 | 판 | 결과 | 비고 |\n|---|---|---|---|\n| 11-16 13:40 | T-5a | ✅ 머지 | |\n` },
      '나 레인': { body: `${TABLE('| 1 | 첫판 | 지붕 얹기 일 | ✅ |')}\n## 로그\n\n- 11-16 13:50 무슨 일이든 적은 줄\n` },
    })
    const ev: E[] = build({ now: NOW, md: l1, laneRoot: root }).events
    expect(ev[0].ts.slice(0, 10)).toBe('2026-11-16')
    expect(ev.slice(0, 3).map((e) => e.text)).toEqual(['나 레인 기록', '벽 세우기 일 끝', '첫 일 하기 끝'])
    expect([...ev].sort((a, b) => b.ts.localeCompare(a.ts))).toEqual(ev) // 최신순
  })
})

describe('R102④ — 가짜 막힘', () => {
  const st = new Map([['T-9a', '✅ 끝'], ['T-9b', '🔄'], ['T-9c', '⛔ 진짜 막힘']])
  const of = (id: string) => st.get(id)
  it('「⛔ … → T-번호」 는 그 번호 상태 · 「⛔ 고칠 것 없음」·↪ 는 끝', () => {
    expect(columnOfLinked('⛔ 넘김 → T-9a', of).column).toBe('done')
    expect(columnOfLinked('⛔ 넘김 → T-9b', of).column).toBe('work')
    expect(columnOfLinked('⛔ 넘김 → T-9c', of).reason).toBe('blocked')
    expect(columnOfLinked('⛔ 고칠 것 없음', of).column).toBe('done')
    expect(columnOfLinked('↪ ✅3 ❌4 → T-9a 로 넘김', of).column).toBe('done')
    expect(columnOfLinked('⛔ push 대기', of).reason).toBe('blocked')
  })
  it('가짜 막힘 줄엔 막힘 캐릭터가 안 선다', () => {
    const root = lanes({ '가 레인': { body: TABLE('| 1 | T-9a | 벽 세우기 일 | ✅ |\n| 2 | 둘판 | 지붕 얹기 일 | ⛔ 앞 일 → T-9a |\n| 3 | 셋판 | 창문 달기 일 | ⛔ 고칠 것 없음 |\n| 4 | 넷판 | 문 달기 일 | ↪ 넘김 |\n| 5 | 닷판 | 바닥 깔기 일 | ⛔ 자재 없음 |') } })
    const d = build({ now: NOW, md: L1('| T-1a | 첫 일 하기 | 코드 | 5 | ✅ |'), laneRoot: root })
    expect(working(d).map((a: A) => a.task_id?.replace(/^l-\w+-/, ''))).toEqual(['닷판'])
  })
})
