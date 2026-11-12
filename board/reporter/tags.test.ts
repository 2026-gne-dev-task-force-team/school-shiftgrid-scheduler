import { describe, expect, it } from 'vitest'
// @ts-expect-error mjs
import { targetOf, tagsTable, tagsReport, TARGETS, UNSORTED, CONTENT_RULES, TYPE_CELL_RULES, CATEGORY_RULES, LANE_RULES } from './tags.mjs'
// @ts-expect-error mjs
import { kindOfType } from './snapshot.mjs'

describe('대상 규칙표 — 줄마다 1건 (가짜 이름만)', () => {
  const cases: [string, Parameters<typeof targetOf>[0], string][] = [
    ['장치 낱말', { title: '보고꾼이 카드를 읽게' }, '장치'],
    ['장치가 현황판보다 앞', { title: '현황판 훅 고치기' }, '장치'],
    ['1.2v 앱 낱말', { title: '1.2v 앱 모바일 첫 판' }, '1.2v 앱'],
    ['1.2v 구현 P번호', { title: '1.2v 구현 P4 검사 화면' }, '1.2v 앱'],
    ['판 칸 머리 앱 P번호', { id: '앱 P24', title: '정책' }, '1.2v 앱'],
    ['시간표 앱', { title: '시간표 앱 배포본 화면' }, '1.2v 앱'],
    ['현황판 낱말', { title: '카드 상세 시트가 비어 보인다 Board' }, '현황판'],
    ['📊 머리', { title: '📊 숫자가 이상하다' }, '현황판'],
    ['v1 만', { title: 'v1 편성기 순서' }, 'v1'],
    ['v2 만', { title: 'v2 꾸러미 재저울질' }, 'v2'],
    ['검수 낱말', { title: '재검 2차' }, '검수'],
    ['종류 칸 이모지', { title: '무엇', type: '👀 (그냥)' }, '검수'],
    ['분류 칸 검사', { title: '품질', category: '검사' }, '검수'],
    ['레인 이름 현황판', { title: '무엇', lane: '현황판 만들기' }, '현황판'],
    ['레인 이름 검수', { title: '무엇', lane: '검수 2' }, '검수'],
    ['레인 이름 v1', { title: '무엇', lane: 'v1 설계' }, 'v1'],
    ['레인 이름 v2', { title: '무엇', lane: 'v2 설계' }, 'v2'],
  ]
  for (const [name, input, want] of cases) it(name, () => expect(targetOf(input)).toBe(want))

  it('규칙표 줄이 위 시험에 빠짐없이 걸린다', () => {
    const rules = [...CONTENT_RULES, ...TYPE_CELL_RULES, ...CATEGORY_RULES, ...LANE_RULES]
    expect(new Set(rules.map((r: [RegExp, string]) => r[1]))).toEqual(new Set(TARGETS))
    expect(cases.length).toBeGreaterThanOrEqual(CONTENT_RULES.length + TYPE_CELL_RULES.length + CATEGORY_RULES.length + LANE_RULES.length)
  })
  it('미분류 — 단서가 없으면 짐작하지 않는다', () => {
    expect(targetOf({ title: '메모리 상한', lane: '저녁 운전' })).toBe(UNSORTED)
    expect(targetOf()).toBe(UNSORTED)
  })
  it('v1 과 v2 가 둘 다 적히면 어느 쪽인지 모른다', () => {
    expect(targetOf({ title: '레포 v1·v2 실물 대조', lane: 'v1·v2 설계' })).toBe(UNSORTED)
  })
})

describe('분류표', () => {
  const tasks = [
    { target: '현황판', kind: 'bug' }, { target: '현황판', kind: 'work' }, { target: '검수', kind: 'review' },
    { target: UNSORTED, kind: 'cr' }, { kind: 'work' }, // target 없는 줄은 미분류로 센다
  ]
  it('대상 × 유형 개수', () => {
    const t = tagsTable(tasks)
    expect(t.find((r: { target: string }) => r.target === '현황판')).toMatchObject({ bug: 1, work: 1, total: 2 })
    expect(t.find((r: { target: string }) => r.target === UNSORTED)).toMatchObject({ cr: 1, work: 1, total: 2 })
  })
  it('보고 글에 합계·미분류 비율', () => expect(tagsReport(tasks)).toMatch(/합계 5 · 미분류 2 \(40%\)/))
})

describe('유형 — 이모지로 적힌 종류 칸도 읽는다', () => {
  it.each([['🐞 (쥔님 직접 지시)', 'bug'], ['📐 (전체 그림)', 'cr'], ['👀 검수', 'review'], ['🔨 (색)', 'work']])('%s → %s', (t, k) => expect(kindOfType(t)).toBe(k))
})
