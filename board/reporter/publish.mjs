// 이 PC 에서 돈다: 스냅숏 생성 → 담백 검사 → Supabase 에 바로 싣기(sink.mjs). git 은 쓰지 않는다.
// node board/reporter/publish.mjs [--dry] [--lane <노트>] [--requests <요청함 노트>] [--usage <json>]
// 종료코드: 0 성공 · 1 실패 · 3 자격 없음(싣기 건너뜀)
import { fileURLToPath } from 'node:url'
import { build, checkServices } from './snapshot.mjs'
import { findDirty } from './plain.mjs'
import { TABLES } from './to-sql.mjs'
import { loadConfig } from './config.mjs'
import { tokensByToolUse, activityByGateId } from './tokens.mjs'
import { readToken, readRef, sinkAndLog } from './sink.mjs'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const dry = process.argv.includes('--dry')
const repoDir = fileURLToPath(new URL('../..', import.meta.url))
const cfg = loadConfig()

// 1. 스냅숏 + 최종 담백 검사
const snap = build({
  lanePath: arg('--lane', cfg.lane),
  requestPath: arg('--requests', cfg.requests),
  laneRoot: arg('--lane-root', cfg.laneRoot),
  onWarn: (d, why) => console.warn('경고', d, why),
  repoDir,
  usagePath: arg('--usage', cfg.usage),
  gatePath: arg('--gate', cfg.gate),
  tokens: tokensByToolUse(arg('--projects', cfg.projects)),
  activity: activityByGateId(arg('--projects', cfg.projects)),
  services: await checkServices(repoDir, new Date(), cfg.sinkState),
})
const dirty = findDirty(snap)
if (dirty) throw new Error(`담백 검사 실패: ${dirty}`)

for (const t of TABLES) console.log(`${t}\t${snap[t].length}`)
if (dry) process.exit(0)

// 2. 이 기기에서 바로 싣기
process.exit(await sinkAndLog(snap, { token: readToken(), ref: readRef(cfg), statePath: cfg.sinkState }))
