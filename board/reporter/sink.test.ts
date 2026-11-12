import { describe, expect, it } from 'vitest'
// @ts-expect-error — 보고꾼은 node ESM(.mjs)이라 타입 선언이 없다
import { NoCredential, readToken, sink, sinkAndLog } from './sink.mjs'
// @ts-expect-error — 같은 이유
import { TABLES } from './to-sql.mjs'

const snap = Object.fromEntries((TABLES as string[]).map((t) => [t, [{ id: 'x' }]]))
const fakeFetch = (status: number, body: unknown = {}) => async (url: string, init: { headers: Record<string, string>; body: string }) => {
  calls.push({ url, init })
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}
const calls: { url: string; init: { headers: Record<string, string>; body: string } }[] = []

describe('sink', () => {
  it('200 이면 ok · API 주소와 Bearer 로 SQL 을 보낸다', async () => {
    calls.length = 0
    const r = await sink(snap, { token: 'T', ref: 'R', fetchImpl: fakeFetch(200) })
    expect(r.ok).toBe(true)
    expect(calls[0].url).toBe('https://api.supabase.com/v1/projects/R/database/query')
    expect(calls[0].init.headers.Authorization).toBe('Bearer T')
    expect(JSON.parse(calls[0].init.body).query).toContain('delete from board.tasks;')
  })
  it('400 이면 ok 아님 · 로그엔 응답 코드와 줄 수만, 토큰 없음', async () => {
    const lines: string[] = []
    const code = await sinkAndLog(snap, { token: 'SECRET', ref: 'R', fetchImpl: fakeFetch(400, { message: 'bad' }) }, (l: string) => lines.push(l))
    expect(code).toBe(1)
    expect(lines.join('\n')).toContain('응답 400')
    expect(lines.join('\n')).toContain('tasks 1')
    expect(lines.join('\n')).not.toContain('SECRET')
  })
  it('자격 없음은 던지고 fetch 를 안 부른다 · 종료코드 3', async () => {
    calls.length = 0
    await expect(sink(snap, { token: null, ref: 'R', fetchImpl: fakeFetch(200) })).rejects.toBeInstanceOf(NoCredential)
    const lines: string[] = []
    expect(await sinkAndLog(snap, { token: 'T', ref: null, fetchImpl: fakeFetch(200) }, (l: string) => lines.push(l))).toBe(3)
    expect(lines[0]).toBe('자격 없음 — 싣기 건너뜀')
    expect(calls.length).toBe(0)
  })
  it('fetch 가 던져도 토큰을 안 찍고 1', async () => {
    const lines: string[] = []
    const boom = async () => { throw new Error('net down') }
    expect(await sinkAndLog(snap, { token: 'SECRET', ref: 'R', fetchImpl: boom }, (l: string) => lines.push(l))).toBe(1)
    expect(lines[0]).not.toContain('SECRET')
  })
})

describe('readToken', () => {
  const none = { exists: () => false, read: () => '', run: () => { throw new Error('no') } }
  it('환경변수가 먼저', () => {
    expect(readToken({ env: { BOARD_SUPABASE_TOKEN: ' E ' }, os: 'darwin', ...none })).toBe('E')
  })
  it('맥은 키체인 명령(-w)으로 읽는다', () => {
    let args: string[] = []
    const run = (_c: string, a: string[]) => { args = a; return 'K\n' }
    expect(readToken({ env: { USER: 'u' }, os: 'darwin', ...none, run })).toBe('K')
    expect(args).toEqual(['find-generic-password', '-a', 'u', '-s', 'board-reporter-supabase', '-w'])
  })
  it('윈도우는 LOCALAPPDATA 아래 token 파일', () => {
    const t = readToken({ env: { LOCALAPPDATA: 'C:/L' }, os: 'win32', exists: () => true, read: () => 'W\n', run: none.run })
    expect(t).toBe('W')
  })
  it('아무 데도 없으면 null', () => {
    expect(readToken({ env: {}, os: 'darwin', ...none })).toBeNull()
    expect(readToken({ env: {}, os: 'win32', ...none })).toBeNull()
  })
})
