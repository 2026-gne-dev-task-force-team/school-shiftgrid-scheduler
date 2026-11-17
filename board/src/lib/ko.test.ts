import { describe, expect, it } from 'vitest'
import type { Actor, BoardData, Lane, Task, Usage } from '../types.ts'
import { KO_POSES, KO_REVIVE_MAX, fmtReset, knockout, koPose, koText, readForce, stageKo } from './ko.ts'

const u = (pct_7d: number, ts = '2026-11-17T11:00:00Z', account: Usage['account'] = 'org'): Usage =>
  ({ account, ts, pct_5h: 50, pct_7d, reset_5h_at: ts, reset_7d_at: '2026-11-18T23:00:00Z', tok_per_min: 0 })

class Mem { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null } setItem(k: string, v: string) { this.m.set(k, v) } removeItem(k: string) { this.m.delete(k) } }

describe('쓰러짐 판정', () => {
  it('기관 7일 100% 이상이면 켜지고, 아래면 꺼진다 — 마지막 줄 기준', () => {
    expect(knockout([u(100)]).on).toBe(true)
    expect(knockout([u(100, '2026-11-17T10:00:00Z'), u(21, '2026-11-17T12:00:00Z')]).on).toBe(false) // 한도가 돌아오면 저절로 원복
    expect(knockout([u(21, '2026-11-17T10:00:00Z'), u(100, '2026-11-17T12:00:00Z')]).on).toBe(true)
    expect(knockout([]).on).toBe(false)
    expect(knockout([u(100, '2026-11-17T11:00:00Z', 'personal')]).on).toBe(false) // 개인 계정은 판 전체를 쓰러뜨리지 않는다
  })
  it('손 스위치가 자료를 이긴다', () => {
    expect(knockout([u(21)], 'on').on).toBe(true)
    expect(knockout([u(100)], 'off').on).toBe(false)
  })
  it('?ko=on|off 는 저장되고 ?ko=auto 가 푼다', () => {
    const s = new Mem()
    expect(readForce(s, '')).toBeNull()
    expect(readForce(s, '?ko=on')).toBe('on'); expect(readForce(s, '')).toBe('on')
    expect(readForce(s, '?ko=off&x=1')).toBe('off')
    expect(readForce(s, '?ko=auto')).toBeNull(); expect(readForce(s, '')).toBeNull()
  })
  it('방향은 이름마다 고정이고 여섯 가지 안', () => {
    const names = ['브랜치킨', '커밋먼트', '스택오버플로우', '널포인터', '세그폴트', '레이스컨디션', '데드락', '힙오버플로']
    for (const n of names) { expect(koPose(n)).toBe(koPose(n)); expect(koPose(n)).toBeLessThan(KO_POSES) }
    expect(new Set(names.map(koPose)).size).toBeGreaterThan(2)
  })
  it('글: 원인·풀림 시각 · 강제면 표시', () => {
    const k = knockout([u(100)])
    expect(koText(k, Date.parse('2026-11-17T12:00:00Z'))).toContain('7일 한도 초과')
    expect(koText(k, Date.parse('2026-11-17T12:00:00Z'))).toContain('한도 풀림')
    expect(koText(knockout([u(21)], 'on'))).toContain('손 스위치')
    expect(fmtReset(null)).toBe(''); expect(fmtReset('없는 날')).toBe('')
    expect(fmtReset('2026-11-17T12:34:00Z', Date.parse('2026-11-17T01:00:00Z'))).toMatch(/^\d\d:\d\d$/)
  })
})

const actor = (id: string, state: Actor['state'], task_id: string | null, ended_at: string | null, kind: Actor['kind'] = 'helper', role = '코드'): Actor =>
  ({ id, parent_id: 'a-lead', kind, name: id, hue: 1, eye: 'teal', prop: 'box', dept: 'make', team: '코드팀', role, state, task_id, branch_id: null, account: 'org', tok_per_min: 0, started_at: '2026-11-17T08:00:00Z', ended_at })
const task = (id: string, column: Task['column'], actor_id: string | null, updated_at: string, lane_id = 'l1'): Task =>
  ({ id, title: id, category: '코드', kind: 'work', team: '코드팀', sprint: 1, est_min: 30, started_at: null, lane_id, column, reason: column === 'done' ? 'done' : 'new', actor_id, updated_at } as Task)
const lane = (id: string, state: string): Lane => ({ id, title: id, state, actor_id: null })
const base = (): BoardData => ({
  actors: [actor('a-lead', 'work', null, null, 'lead', '지휘'), actor('a1', 'off', 'T-1', '2026-11-17T11:30:00Z'), actor('a2', 'off', null, '2026-11-17T11:20:00Z'), actor('a3', 'off', null, '2026-11-17T11:10:00Z'),
    actor('a4', 'off', null, '2026-11-17T11:00:00Z'), actor('s1', 'work', null, null, 'helper', '세션'), actor('w1', 'work', 'T-9', null)],
  tasks: [task('T-1', 'done', 'a1', '2026-11-17T11:30:00Z'), task('T-2', 'done', null, '2026-11-17T11:25:00Z'), task('T-3', 'done', null, '2026-11-17T11:15:00Z'), task('T-4', 'done', null, '2026-11-17T09:00:00Z', 'l2'),
    task('R5', 'done', null, '2026-11-17T11:40:00Z'), task('T-9', 'work', 'w1', '2026-11-17T11:40:00Z')],
  lanes: [lane('l1', 'idle'), lane('l2', 'idle'), lane('l3', 'idle')], branches: [], services: [], modules: [], goals: [], events: [], usage: [], runs: [], sprints: [],
})

describe('장면 꾸미기(프런트만)', () => {
  it('퇴근한 일손을 마지막 일감(이전 티켓) 위에 다시 세운다 · 서버 자료는 그대로', () => {
    const d = base(), s = stageKo(d, Date.parse('2026-11-17T12:00:00Z'))
    expect(d.actors.find((a) => a.id === 'a1')!.state).toBe('off') // 원본 불변
    const a1 = s.actors.find((a) => a.id === 'a1')!, t1 = s.tasks.find((t) => t.id === 'T-1')!
    expect(a1.state).toBe('work'); expect(a1.task_id).toBe('T-1'); expect(t1.column).toBe('work'); expect(t1.actor_id).toBe('a1'); expect(t1.started_at).not.toBeNull()
    // 자기 일감이 없던 a2 는 최근 끝난 티켓(T-2)을 받는다 — 요청함 카드(R5)는 안 쓴다
    const a2 = s.actors.find((a) => a.id === 'a2')!
    expect(a2.state).toBe('work'); expect(a2.task_id).toBe('T-2')
    expect(s.tasks.find((t) => t.id === 'R5')!.column).toBe('done')
    // 넷에 하나는 복도(쉼 꼴)
    expect(s.actors.filter((a) => a.state === 'idle').length).toBe(1)
    // 일하던 카드가 생긴 레인은 「하는 중」, 안 건드린 레인은 그대로
    expect(s.lanes.find((l) => l.id === 'l1')!.state).toBe('work'); expect(s.lanes.find((l) => l.id === 'l3')!.state).toBe('idle')
  })
  it('지휘·대화 세션·이미 일하는 캐릭터는 그대로 · 상한을 넘기지 않는다', () => {
    const d = base()
    for (let i = 0; i < 30; i++) { d.actors.push(actor(`x${i}`, 'off', null, '2026-11-17T10:00:00Z')); d.tasks.push(task(`T-x${i}`, 'done', null, '2026-11-17T08:00:00Z')) }
    const s = stageKo(d)
    expect(s.actors.find((a) => a.id === 'a-lead')!.state).toBe('work'); expect(s.actors.find((a) => a.id === 's1')!.task_id).toBeNull()
    expect(s.tasks.find((t) => t.id === 'T-9')!.actor_id).toBe('w1')
    const revived = s.actors.filter((a) => a.kind === 'helper' && a.state !== 'off' && a.id !== 's1' && a.id !== 'w1')
    expect(revived.length).toBeLessThanOrEqual(KO_REVIVE_MAX); expect(revived.length).toBeGreaterThan(3)
  })
  it('같은 입력 → 같은 장면(다시 그려도 안 흔들린다)', () => {
    expect(JSON.stringify(stageKo(base(), 1))).toBe(JSON.stringify(stageKo(base(), 1)))
  })
})
