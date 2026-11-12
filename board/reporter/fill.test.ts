import { describe, expect, it } from 'vitest'
// @ts-expect-error — 보고꾼은 node ESM(.mjs)이라 타입 선언이 없다
import { bodyFromLinks, bodyFromLog, branchTitle, logBody, sprintNext, sprintReview } from './fill.mjs'
// @ts-expect-error — 위와 같음
import { audit } from './fill-audit.mjs'
// @ts-expect-error — 위와 같음
import { build, codeWord } from './snapshot.mjs'

const hit = (result: string) => ({ at: '11-12 10:00', pan: 'T-1a 뼈대', result })

describe('채움 규칙', () => {
  it('설명이 비면 진행 로그 결과로 채운다 · 이미 있으면 그대로 · 한 낱말뿐이면 안 채운다', () => {
    expect(bodyFromLog({ id: 'T-1a' }, [hit('✅ 머지 · 가짜 화면 뼈대를 세웠다')], codeWord).body).toBe('머지 · 가짜 화면 뼈대를 세웠다')
    expect(bodyFromLog({ id: 'T-1a', body: '원래 설명' }, [hit('✅ 다른 긴 문장이 있다 해도')], codeWord).body).toBe('원래 설명')
    expect(bodyFromLog({ id: 'T-1a' }, [hit('✅ 머지')], codeWord).body).toBeUndefined()
    expect(bodyFromLog({ id: 'T-1a' }, [], codeWord).body).toBeUndefined()
  })
  it('로그 결과도 담백 거름을 탄다(기기 이름이 든 문장은 빠진다)', () => {
    expect(logBody('✅ 맥에서 돌려 보았다', codeWord)).toBe('')
  })
  it('설명이 빈 태스크는 이어진 태스크 설명을 빌린다 · 이어진 것도 비면 비워 둔다', () => {
    const ts = [{ id: 'R1', links: ['T-1'] }, { id: 'T-1', body: '가짜 설명이다', links: ['R1'] }, { id: 'R2', links: ['T-9'] }, { id: 'T-9', links: ['R2'] }]
    bodyFromLinks(ts)
    expect(ts.map((t: { body?: string }) => t.body)).toEqual(['가짜 설명이다', '가짜 설명이다', undefined, undefined])
  })
  it('가지 제목 = 마지막 커밋 제목 · 경로 낀 것·한글 없는 것은 null', () => {
    expect(branchTitle('가짜 화면을 고친다', codeWord)).toBe('가짜 화면을 고친다')
    expect(branchTitle('fix a/b', codeWord)).toBeNull()
    expect(branchTitle('', codeWord)).toBeNull()
  })
  it('스프린트 검수 칸은 태스크 셈 · 다음엔은 이어지는 스프린트 제목(마지막은 비움)', () => {
    const t = (column: string, kind = 'work') => ({ column, kind })
    expect(sprintReview([t('done'), t('done', 'review')])).toBe('태스크 2개 전부 완료 · 검사 일 1개 중 1개 끝')
    expect(sprintReview([t('done'), t('work')])).toBe('태스크 2개 중 1개 완료')
    expect(sprintReview([])).toBe('')
    expect(sprintNext([{ title: '가' }, { title: '나' }])).toEqual(['다음 스프린트 — 나', ''])
  })
  it('build 통합 — 로그 결과가 설명이 되고 스프린트 칸이 찬다', () => {
    const md = `## 스프린트 1 — 가짜 (10:00~)
- **목표**: 가짜 목표를 세운다

| 태스크 | 무엇 | 팀 | est_min | 상태 |
|---|---|---|---|---|
| T-1a | 뼈대 — a/b 입구 | 화면 | 5 | ✅ |

## 스프린트 2 — 두번째 (11:00~)

| 태스크 | 무엇 | 팀 | est_min | 상태 |
|---|---|---|---|---|
| T-2a | 둘째 — c/d 일 | 화면 | 5 | 🔄 |

## 진행 로그 (맨 위가 최신)
| 시각 | 판 | 결과 | 비고 |
|---|---|---|---|
| 11-12 10:30 | T-1a 뼈대 | ✅ 머지 · 가짜 입구를 열었다 | |
`
    const d = build({ md, now: new Date('2026-11-12T03:00:00Z') })
    expect(d.tasks.find((t: { id: string }) => t.id === 'T-1a').body).toBe('머지 · 가짜 입구를 열었다')
    expect(d.tasks.find((t: { id: string }) => t.id === 'T-2a').body).toBeUndefined() // 원천에 없으면 지어내지 않는다
    expect(d.sprints.map((s: { review: string }) => s.review)).toEqual(['태스크 1개 전부 완료', '태스크 1개 중 0개 완료'])
    expect(d.sprints[0].next).toBe('다음 스프린트 — 두번째')
    expect(d.sprints[1].next).toBe('')
  })
  it('빈칸 세기 — 칸마다 빈 수/전체', () => {
    const r = audit({ actors: [{ state: 'work', task_id: null }, { state: 'work', task_id: 'T-1', tok_total: 5 }, { state: 'off' }], branches: [{ trunk: false, title: '가지 x', state: 'live', actor_id: null }],
      lanes: [{ actor_id: null }], tasks: [{ body: '', column: 'work', actor_id: null }], modules: [{ task_id: null, note: 'n' }], sprints: [{ review: '', next: '' }, { review: 'x', next: '' }] })
    const get = (c: string) => r.find((x: { cell: string }) => x.cell === c)
    expect(get('맡은 일')).toMatchObject({ empty: 1, total: 2 })
    expect(get('가지 설명(이름뿐)')).toMatchObject({ empty: 1, total: 1 })
    expect(get('설명')).toMatchObject({ empty: 1, total: 1 })
    expect(get('메모')).toMatchObject({ empty: 0, total: 1 })
    expect(get('검수·QA')).toMatchObject({ empty: 1, total: 2 })
    expect(get('다음엔(이어지는 스프린트가 있을 때)')).toMatchObject({ empty: 1, total: 1 })
  })
})
