import { describe, expect, it } from 'vitest'
import { EMPTY, filterTasks, fromSearch, toSearch, type Filter } from './filter.ts'
import type { Task } from '../types.ts'

const T = (o: Partial<Task>): Task => ({ id: 'T-1', title: '제목', category: '코드', kind: 'work', team: 'a', sprint: 1, est_min: 0,
  started_at: null, lane_id: 'l1', column: 'wait', reason: 'new', actor_id: null, updated_at: '', ...o })
const F = (o: Partial<Filter>): Filter => ({ ...EMPTY, ...o })
// 손으로 센 가짜 자료 — 결함 3(기다림 2·작업 1) · 기능 2 · 검수 1
const data: Task[] = [
  T({ id: 'R67', title: '공이 굴러간다', kind: 'bug', target: '현황판', direct: true, ask: '"저 공 왜 굴러가냐"' }),
  T({ id: 'R68', title: '이름표', kind: 'bug', target: 'v2', body: '캐릭터 이름 공개', ask: '"이게 이름이냐"', direct: true }),
  T({ id: 'T-7z', title: '이름 고치기', kind: 'bug', column: 'work', started_at: 'x', actor_id: 'a1', lane_id: 'l2' }),
  T({ id: 'T-8a', title: '달력 칸', kind: 'work', target: 'v1' }),
  T({ id: 'R70', title: '시간표 정리', kind: 'work', column: 'done' }),
  T({ id: 'T-9b', title: '화면 검사', kind: 'review', column: 'wait', reason: 'checking' }),
]
const ids = (f: Filter) => filterTasks(data, f).map((t) => t.id)

describe('검색', () => {
  it('빈 질의 = 전부', () => { expect(ids(EMPTY)).toHaveLength(6); expect(ids(F({ q: '   ' }))).toHaveLength(6) })
  it('「공」 = 제목·설명에 「공」 든 카드만', () => expect(ids(F({ q: '공' }))).toEqual(['R67', 'R68']))
  it('번호로 찾는다(대소문자 무시)', () => { expect(ids(F({ q: 'r67' }))).toEqual(['R67']); expect(ids(F({ q: 'T-7Z' }))).toEqual(['T-7z']) })
  it('원문(ask)·설명(body) 낱말까지', () => { expect(ids(F({ q: '이게' }))).toEqual(['R68']); expect(ids(F({ q: '캐릭터' }))).toEqual(['R68']) })
  it('띄어쓰기는 AND', () => { expect(ids(F({ q: '이름 공개' }))).toEqual(['R68']); expect(ids(F({ q: '이름 굴러' }))).toEqual([]) })
})
describe('칩', () => {
  it('유형 결함 + 상태 기다림 = 손으로 센 2', () => expect(ids(F({ type: ['bug'], status: ['wait'] }))).toEqual(['R67', 'R68']))
  it('같은 칸 안은 OR', () => expect(ids(F({ type: ['bug', 'review'] }))).toHaveLength(4))
  it('확인 중은 별도 열', () => expect(ids(F({ status: ['check'] }))).toEqual(['T-9b']))
  it('대상 — 미분류는 target 없는 카드', () => { expect(ids(F({ target: ['미분류'] }))).toEqual(['T-7z', 'R70', 'T-9b']); expect(ids(F({ target: ['v2'] }))).toEqual(['R68']) })
  it('레인 · 캐릭터', () => { expect(ids(F({ lane: ['l2'] }))).toEqual(['T-7z']); expect(ids(F({ who: ['a1'] }))).toEqual(['T-7z']) })
  it('쥔님 직접 지시만 — R 줄 중 표지 있는 것', () => expect(ids(F({ direct: true }))).toEqual(['R67', 'R68']))
  it('칩과 검색은 AND', () => expect(ids(F({ q: '공', target: ['v2'] }))).toEqual(['R68']))
})
describe('주소 왕복', () => {
  it('상태 → 주소 → 상태 같음', () => {
    const f = F({ q: '이름 공개', type: ['bug', 'cr'], status: ['wait'], target: ['미분류', 'v2'], lane: ['l1'], who: ['a1'], direct: true })
    expect(fromSearch(toSearch(f))).toEqual(f)
  })
  it('빈 상태 = 빈 주소', () => { expect(toSearch(EMPTY)).toBe(''); expect(fromSearch('')).toEqual(EMPTY) })
  it('주소 모양', () => expect(toSearch(F({ q: '공', type: ['bug'] }))).toBe('?q=%EA%B3%B5&type=bug'))
})
