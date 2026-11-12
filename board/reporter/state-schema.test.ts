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
