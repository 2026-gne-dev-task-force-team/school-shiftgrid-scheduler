// 기기별 경로 설정 — 경로만 담는다(비밀 ⛔). 값은 `config.<기기>.json`(win · mac) 이나 BOARD_REPORTER_CONFIG 가 가리키는 파일에서 읽고,
// 없으면 윈도우 업무 PC 기본값. 값 앞의 `~` 는 홈 폴더로 풀린다(공개 자료에 사용자 이름이 안 들어가게).
// 키: lane · requests · laneRoot · dir(board-data 작업 폴더) · usage · gate · projects
import { existsSync, readFileSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULTS = {
  lane: 'D:/문서/subnauticaz/계획/판/시간표 작업판/레인/작업현황판/레인 작업현황판.md',
  requests: 'D:/문서/subnauticaz/계획/판/시간표 작업판/레인/요청함/레인 요청함.md',
  laneRoot: 'D:/문서/subnauticaz/계획/판/시간표 작업판/레인',
  dir: 'D:/gne-dev-task/sg-board-data',
  usage: '~/.claude/rate-limits.json',
  gate: '~/.claude/board/actors.json',
  projects: '~/.claude/projects',
}

export const expandHome = (p) => (typeof p === 'string' && (p === '~' || p.startsWith('~/')) ? join(homedir(), p.slice(1)) : p)

export function loadConfig(env = process.env, os = platform(), dirUrl = import.meta.url) {
  const key = os === 'darwin' ? 'mac' : os === 'win32' ? 'win' : os
  const file = env.BOARD_REPORTER_CONFIG || fileURLToPath(new URL(`./config.${key}.json`, dirUrl))
  let over = {}
  if (existsSync(file)) over = JSON.parse(readFileSync(file, 'utf-8'))
  else if (env.BOARD_REPORTER_CONFIG) throw new Error(`설정 파일 없음: ${file}`)
  const out = {}
  for (const k of Object.keys(DEFAULTS)) out[k] = expandHome(over[k] ?? DEFAULTS[k])
  return out
}
