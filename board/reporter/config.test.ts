import { describe, expect, it } from 'vitest'
import { homedir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error — 보고꾼은 node ESM(.mjs)이라 타입 선언이 없다
import { defaultSinkState, loadConfig } from './config.mjs'

describe('loadConfig', () => {
  it('싣기 상태 파일 기본 자리는 기기별 로컬 캐시(레포 밖) · 설정으로 바꿀 수 있다', () => {
    expect(loadConfig({}, 'darwin').sinkState).toBe(join(homedir(), 'Library', 'Caches', 'board-reporter', 'last-sink.json'))
    expect(defaultSinkState({ LOCALAPPDATA: 'C:/L' }, 'win32')).toBe(join('C:/L', 'board-reporter', 'last-sink.json'))
  })

  it('맥은 config.mac.json 을 읽고 ~ 를 홈으로 푼다', () => {
    const c = loadConfig({}, 'darwin')
    expect(c.gate).toBe(join(homedir(), '.claude/board/actors.json'))
    expect(c.lane.startsWith(homedir())).toBe(true)
    expect(c.lane.includes('작업현황판')).toBe(true)
  })
  it('설정 파일이 없는 OS 는 윈도우 기본값', () => {
    const c = loadConfig({}, 'win32', 'file:///nonexistent/x.mjs')
    expect(c.ref).toBe('')
    expect(c.usage).toBe(join(homedir(), '.claude/rate-limits.json'))
  })
  it('BOARD_REPORTER_CONFIG 가 가리키는 파일이 없으면 던진다', () => {
    expect(() => loadConfig({ BOARD_REPORTER_CONFIG: '/nonexistent/c.json' }, 'darwin')).toThrow()
  })
})
