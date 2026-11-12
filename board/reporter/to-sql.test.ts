import { describe, expect, it } from 'vitest'
// @ts-expect-error — 보고꾼은 node ESM(.mjs)이라 타입 선언이 없다
import { TABLES, toSql } from './to-sql.mjs'

const empty = () => Object.fromEntries((TABLES as string[]).map((t) => [t, []]))

describe('to-sql', () => {
  it('고정 표 목록 밖 이름을 안 만든다 · feedback 제외', () => {
    const sql: string = toSql({ ...empty(), feedback: [{ id: 'f1' }], evil: [{ id: 'x' }], 'x; drop schema board': [] })
    const names = [...sql.matchAll(/board\.(\w+)/g)].map((m) => m[1])
    expect(new Set(names)).toEqual(new Set(TABLES))
    expect(sql).not.toMatch(/feedback|evil|drop/)
    expect(sql.startsWith('begin;')).toBe(true)
    expect(sql.endsWith('commit;')).toBe(true)
  })
  it('$snap$ 이 들어 있으면 예외', () => {
    expect(() => toSql({ ...empty(), tasks: [{ id: 't', title: 'a$snap$; drop' }] })).toThrow(/\$snap\$/)
  })
  it('표 배열이 빠지면 예외(빈 표로 지우지 않는다)', () => {
    const { tasks: _, ...rest } = empty()
    expect(() => toSql(rest)).toThrow(/tasks/)
  })
})
