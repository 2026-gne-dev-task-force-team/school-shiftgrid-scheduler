import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error — 보고꾼은 node ESM(.mjs)이라 타입 선언이 없다
import { sumUsage, tokensByToolUse } from './tokens.mjs'
// @ts-expect-error — 위와 같음
import { build } from './snapshot.mjs'
import { actorTokens } from '../src/lib/actor.ts'
import type { Actor } from '../src/types.ts'

const line = (id: string, u: object, role = 'assistant') => JSON.stringify({ type: role, message: { id, role, usage: u } })
const U = (i: number, o: number, c: number, r: number) => ({ input_tokens: i, output_tokens: o, cache_creation_input_tokens: c, cache_read_input_tokens: r })

describe('토큰 합산(가짜 jsonl)', () => {
  it('입력+출력+캐시 쓰기만 센다 — 캐시 재읽기는 뺀다', () => {
    expect(sumUsage(line('m1', U(2, 10, 100, 9999)))).toBe(112)
  })
  it('같은 응답이 반복된 줄은 마지막 하나만 센다 · 깨진 줄·사용자 줄은 건너뛴다', () => {
    const t = [line('m1', U(2, 8, 50, 0)), line('m1', U(2, 300, 50, 0)), '{깨진 줄', line('u', U(1, 1, 1, 1), 'user'), line('m2', U(1, 5, 0, 70))].join('\n')
    expect(sumUsage(t)).toBe(352 + 6)
  })
  it('usage 가 없으면 0', () => expect(sumUsage('{"type":"user"}\n\n')).toBe(0))

  it('meta.json 의 toolUseId 로 기록을 잇는다 · 오래된 기록은 뺀다', () => {
    const root = mkdtempSync(join(tmpdir(), 'proj-'))
    const dir = join(root, 'p1', 's1', 'subagents'); mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'agent-a1.jsonl'), line('m1', U(1, 2, 3, 4))); writeFileSync(join(dir, 'agent-a1.meta.json'), '{"toolUseId":"toolu_x"}')
    writeFileSync(join(dir, 'agent-a2.jsonl'), line('m1', U(9, 9, 9, 9))) // meta 없음 = 못 잇는다
    expect(tokensByToolUse(root)).toEqual({ toolu_x: 6 })
    expect(tokensByToolUse(root, Date.now() + 3 * 86400e3)).toEqual({})
  })
})

describe('캐릭터에 싣기', () => {
  const now = new Date('2026-11-12T05:00:00Z'), t0 = now.getTime()
  const md = '# 레인\n## 스프린트 1 — 뼈대 (10:55~)\n- **목표**: 화면\n\n| 태스크 | 무엇 | 팀 | est_min | 상태 |\n|---|---|---|---|---|\n'
  it('도는 에이전트에 누적·분당이 실린다 · 못 이은 에이전트는 값이 없다', () => {
    const gatePath = join(mkdtempSync(join(tmpdir(), 'gate-')), 'actors.json')
    writeFileSync(gatePath, JSON.stringify({ sessions: {}, actors: {
      toolu_a: { id: 'a-11111111', task: null, started: t0 - 10 * 60e3, ended: null },
      toolu_b: { id: 'a-22222222', task: null, started: t0 - 60e3, ended: null },
    } }))
    const d = build({ now, gatePath, md, tokens: { toolu_a: 5000 } })
    const a = d.actors.find((x: Actor) => x.id === 'a-11111111'), b = d.actors.find((x: Actor) => x.id === 'a-22222222')
    expect(a).toMatchObject({ tok_total: 5000, tok_per_min: 500 })
    expect(b.tok_total).toBeUndefined()
    expect(actorTokens(a)).toBe('누적 5,000 · 분당 500')
    expect(actorTokens(b)).toBe('—')
  })
})
