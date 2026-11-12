import { describe, expect, it } from 'vitest'
// @ts-expect-error — 보고꾼은 node ESM(.mjs)이라 타입 선언이 없다
import { build, columnOf, publicTitle } from './snapshot.mjs'
// @ts-expect-error — 위와 같음
import { findDirty, isPlain } from './plain.mjs'

const MD = `# 레인
## 스프린트 1 — 뼈대 (10:55~)
- **목표**: 쥔님 10:50 *"빨리"* · 화면 뼈대를 세운다(\`board/\`)

| 태스크 | 무엇 | 팀 | est_min | 상태 |
|---|---|---|---|---|
| T-1a | 뼈대 — \`board/\` 입구 | 화면 sonnet | 25 | ✅ \`a80d832\` |
| T-1b | 2층 원통(canvas) | 품질 sonnet 1 | 10 | 🔄 |
| T-1c | D:\\x 경로만 | 메인 | 5 | ⬜ |
| 👀 | 쥔님 검수 | 쥔님 | — | ⬜ |

## 스프린트 2 — 막대 (11:47~)
- **목표**: 막대를 단다

| 태스크 | 무엇 | 팀 | est_min | 상태 |
|---|---|---|---|---|
| T-2a | 막대 · 서랍 | 코드 opus | 20 | ⛔ 대기 |

## 진행 로그 (맨 위가 최신)
| 시각 | 판 | 결과 | 비고 |
|---|---|---|---|
| 11-12 11:00 | T-1a 뼈대 | ✅ 머지 · 맥에서 opus | 비고 |
| 11-12 10:58 | 📌 방향 | 쥔님 메일 a@b.kr | |
`

describe('보고꾼', () => {
  const dropped: string[] = []
  const d = build({ md: MD, now: new Date('2026-11-12T03:00:00Z'), onDrop: (t: string, id: string) => dropped.push(`${t}:${id}`) })

  it('스프린트·태스크 수와 칸 매핑', () => {
    expect(d.sprints.map((s: { id: number }) => s.id)).toEqual([1, 2])
    expect(d.tasks.map((t: { id: string }) => t.id)).toEqual(['T-1a', 'T-1b', 'T-2a']) // T-1c 는 담백 검사로, 👀 는 id 꼴이 아니라 빠짐
    expect(dropped).toEqual(['tasks:T-1c'])
    const by = Object.fromEntries(d.tasks.map((t: { id: string }) => [t.id, t]))
    expect(by['T-1a']).toMatchObject({ title: '뼈대', category: '화면', column: 'done', started_at: '2026-11-12T11:00:00+09:00' })
    expect(by['T-1b']).toMatchObject({ title: '2층 원통', category: '검사', column: 'work', actor_id: 'a-T-1b' })
    expect(by['T-2a']).toMatchObject({ title: '막대', category: '코드', column: 'wait', reason: 'blocked' })
    expect(d.sprints[0]).toMatchObject({ began: '2026-11-12T10:55:00+09:00', ended: null, est_min: 35, goal: '화면 뼈대를 세운다' })
    expect(d.goals[0]).toMatchObject({ sprint: 2, progress: 0 })
    expect(d.actors.map((a: { id: string }) => a.id)).toEqual(['a-lead', 'a-T-1b'])
  })

  it('사건은 담백 틀 글만 싣는다', () => {
    expect(d.events.map((e: { text: string }) => e.text)).toEqual(['뼈대 끝', '방향 정리'])
    expect(findDirty(d)).toBeNull()
  })

  it('담백 검사가 경로·이메일·모델·기기를 거른다', () => {
    for (const bad of ['D:\\gne', 'board/src', 'a@b.kr', 'opus 판', '업무 PC 에서', 'sk-abc', '[[노트]]']) expect(isPlain(bad)).toBe(false)
    for (const ok of ['task-board 정리', '14:36 끝', '2층 원통']) expect(isPlain(ok)).toBe(true)
    expect(findDirty({ a: [{ b: 'x sonnet' }] })).toBe('.a.0.b')
  })

  it('제목·상태 낱개', () => {
    expect(publicTitle('QA 상 결함 넷(원통 이름표) · 다음')).toBe('QA 상 결함 넷')
    expect(columnOf('✅ 끝').column).toBe('done')
    expect(columnOf('⬜').column).toBe('wait')
  })
})
