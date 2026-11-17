// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { actorFacts, actorTag, actorTaskLine, actorTipText } from './actor-tag.ts'
import type { Actor, BoardData } from '../types.ts'

const NOW = Date.parse('2026-11-17T12:00:00')
const A = { id: 'a1', parent_id: null, kind: 'helper', name: '모래', job: '코드 짜기', hue: 20, eye: 'amber', prop: '', race: 'elf', dept: 'make', team: '제작', role: '코드', state: 'work',
  task_id: 'l-x-T-9u', branch_id: null, account: 'a', tok_per_min: 0, started_at: '2026-11-17T09:05:00', ended_at: null } as unknown as Actor
const task = (o: object) => ({ id: 'T-9u', title: '보고꾼 스프린트 머리 읽기', lane_id: 'L1', column: 'work', actor_id: 'a1', updated_at: '2026-11-17T11:40:00', ...o })
const data = { actors: [A], tasks: [task({}), task({ id: 'T-1', column: 'done' })], lanes: [{ id: 'L1', title: '코드 레인', state: 'work', actor_id: null }], events: [], branches: [] } as unknown as BoardData

describe('캐릭터 이름표', () => {
  it('태스크 있음 → 번호 + 제목', () => expect(actorTaskLine({ task_id: 'T-9u', state: 'work' }, data.tasks)).toBe('T-9u 보고꾼 스프린트 머리 읽기'))
  it('일감 없음 → 쉼·대기·퇴근 낱말', () => {
    expect(actorTaskLine({ task_id: null, state: 'idle' }, [])).toBe('쉼')
    expect(actorTaskLine({ task_id: null, state: 'wait' }, [])).toBe('대기')
    expect(actorTaskLine({ task_id: null, state: 'off' }, [])).toBe('퇴근')
  })
  it('툴팁 글 꼴 · 자료 없는 칸은 빠진다', () => {
    const tip = actorTipText(A, data, NOW)
    expect(tip).toContain('· 코드 짜기 · T-9u — 상태 🔨 일함')
    expect(tip).toContain('기기 맥 · 엘프'); expect(tip).toContain('시작 09:05'); expect(tip).toContain('마지막 활동 20분 전'); expect(tip).toContain('레인 코드 레인'); expect(tip).toContain('오늘 끝낸 일 1건')
    const bare = actorFacts({ ...A, race: undefined, task_id: null }, { ...data, tasks: [], lanes: [] }, NOW).map(([k]) => k)
    expect(bare).toEqual(['상태', '시작'])
  })
  it('쉼 상태 이름표 글', () => {
    const el = actorTag({ data, openDetail: () => {}, tip: () => {} }, { ...A, state: 'idle', task_id: null })
    expect(el.querySelector('.at-name')!.textContent).toMatch(/ · 코드 짜기$/); expect(el.querySelector('.at-task')!.textContent).toBe('쉼')
  })
  it('태스크 있음 이름표 글 · 누르면 상세', () => {
    let opened = ''
    const el = actorTag({ data, openDetail: (c) => { opened = c.title }, tip: () => {} }, A)
    expect(el.querySelector('.at-task')!.textContent).toBe('T-9u 보고꾼 스프린트 머리 읽기')
    el.click(); expect(opened).toContain('T-9u')
  })
})
