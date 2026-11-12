import { describe, expect, it } from 'vitest'
import { homedir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error — 보고꾼은 node ESM(.mjs)이라 타입 선언이 없다
import { loadConfig } from './config.mjs'

describe('loadConfig', () => {
  it('맥은 config.mac.json 을 읽고 ~ 를 홈으로 푼다', () => {
    const c = loadConfig({}, 'darwin')
    expect(c.gate).toBe(join(homedir(), '.claude/board/actors.json'))
    expect(c.lane.startsWith(homedir())).toBe(true)
    expect(c.lane.includes('작업현황판')).toBe(true)
  })
  it('설정 파일이 없는 OS 는 윈도우 기본값', () => {
    const c = loadConfig({}, 'win32', 'file:///nonexistent/x.mjs')
    expect(c.dir).toBe('D:/gne-dev-task/sg-board-data')
    expect(c.usage).toBe(join(homedir(), '.claude/rate-limits.json'))
  })
  it('BOARD_REPORTER_CONFIG 가 가리키는 파일이 없으면 던진다', () => {
    expect(() => loadConfig({ BOARD_REPORTER_CONFIG: '/nonexistent/c.json' }, 'darwin')).toThrow()
  })
})
