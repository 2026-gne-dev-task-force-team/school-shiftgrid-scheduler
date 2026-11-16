import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// 사고(T-8s · R82): 화면·보고꾼이 캐릭터 상태 'off'·'wait' 를 내는데 서버 check 목록은 옛것이라 싣기 18연속 실패.
// 화면 타입(ActorState)과 스키마 check 목록이 어긋나면 여기서 먼저 깨진다 — 두 파일을 글로 읽어 비교한다.
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf-8')
const list = (s: string) => [...s.matchAll(/'(\w+)'/g)].map((m) => m[1]).sort()

describe('actors.state 허용 목록 = 화면 타입', () => {
  it('types.ts ActorState 와 board-schema.sql actors_state_check 가 같은 집합', () => {
    const t = read('../src/types.ts').match(/export type ActorState\s*=\s*([^\n]+)/)
    expect(t, 'ActorState 타입을 못 찾음').toBeTruthy()
    const sql = read('../supabase/board-schema.sql')
    const inline = sql.match(/create table if not exists board\.actors[\s\S]*?\n\);/)?.[0].match(/state text not null check \(state in \(([^)]*)\)\)/)
    const alter = sql.match(/add constraint actors_state_check check \(state in \(([^)]*)\)\)/)
    expect(inline, '표 정의의 state check 를 못 찾음').toBeTruthy()
    expect(alter, 'actors_state_check 갈아 끼움 줄을 못 찾음').toBeTruthy()
    expect(list(inline![1])).toEqual(list(t![1]))
    expect(list(alter![1])).toEqual(list(t![1]))
  })
})

// 사고(T-10cs · R118): 보고꾼이 사건 종류 'lane.log' 를 내기 시작했는데 서버 events_kind_check 목록엔 없어 싣기 400.
// 보고꾼·화면이 사건을 만드는 자리(`kind: … subject_type` 객체 · `add(종류, 대상, …)` 호출)의 종류 글자를 긁어 스키마 목록 안에 있는지 본다.
describe('events.kind 허용 목록 ⊇ 코드가 내는 사건 종류', () => {
  const sql = read('../supabase/board-schema.sql')
  const kinds = (s: string) => [...s.matchAll(/'([a-z]+(?:\.[a-z]+)?)'/g)].map((m) => m[1])
  const inline = sql.match(/create table if not exists board\.events[\s\S]*?\n\);/)?.[0].match(/kind text not null check \(kind in \(([^)]*)\)\)/)
  const alter = sql.match(/add constraint events_kind_check check \(kind in \(([^)]*)\)\)/)

  it('표 정의의 목록과 갈아 끼움 줄의 목록이 같은 집합', () => {
    expect(inline, '표 정의의 kind check 를 못 찾음').toBeTruthy()
    expect(alter, 'events_kind_check 갈아 끼움 줄을 못 찾음').toBeTruthy()
    expect(kinds(inline![1]).sort()).toEqual(kinds(alter![1]).sort())
  })

  it('snapshot.mjs · feedback.ts 가 만드는 종류가 전부 목록에 있다', () => {
    const allowed = new Set(kinds(alter![1]))
    const src = read('./snapshot.mjs') + '\n' + read('../src/lib/feedback.ts')
    const spans = [
      ...[...src.matchAll(/\bkind:\s*([^\n]*?)\bsubject_type\b/g)].map((m) => m[1]),
      ...[...src.matchAll(/\badd\(([^\n]*?'),\s*'[a-z]+',/g)].map((m) => m[1]),
    ]
    const made = [...new Set(spans.flatMap(kinds))].sort()
    // 긁개가 눈멀지 않았는지 — 알려진 종류 넷은 반드시 잡혀야 한다
    for (const k of ['lane.log', 'task.move', 'goal.progress', 'feedback.add']) expect(made, `긁개가 ${k} 를 못 잡음`).toContain(k)
    expect(made.filter((k) => !allowed.has(k)), '스키마 events_kind_check 에 없는 사건 종류').toEqual([])
  })
})
